from __future__ import annotations
import logging
from collections import defaultdict
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Updated BODHI Imports
from models.core import Ledger, LedgerEntryType, LedgerReferenceType, PaymentStatus
from models.core import User
from models.expenses import Debt, DebtStatus, Expense, ExpenseSplit, Settlement, SplitMethod
from schemas.expenses import DebtRead, ExpenseCreate, ExpenseRead, NetDebtGraph, SettlementCreate, SettlementRead, SplitParticipant

logger = logging.getLogger(__name__)

class ExpenseServiceError(Exception): pass
class UserNotFoundError(ExpenseServiceError): pass
class ExpenseNotFoundError(ExpenseServiceError): pass
class DebtNotFoundError(ExpenseServiceError): pass
class AlreadySettledError(ExpenseServiceError): pass
class OverpaymentError(ExpenseServiceError): pass
class SplitValidationError(ExpenseServiceError): pass

def compute_equal_splits(total: int, user_ids: list[str]) -> dict[str, int]:
    n = len(user_ids)
    base = total // n
    remainder = total % n
    result: dict[int, int] = {}
    for i, uid in enumerate(user_ids):
        result[uid] = base + (1 if i < remainder else 0)
    return result

def compute_exact_splits(participants: list[SplitParticipant]) -> dict[str, int]:
    return {p.user_id: p.exact_amount or 0 for p in participants}

def compute_percentage_splits(total: int, participants: list[SplitParticipant]) -> dict[str, int]:
    result: dict[int, int] = {}
    allocated = 0
    largest_uid = max(participants, key=lambda p: p.percentage_bps or 0).user_id
    for p in participants:
        share = (total * (p.percentage_bps or 0)) // 10_000
        result[p.user_id] = share
        allocated += share
    remainder = total - allocated
    result[largest_uid] = result[largest_uid] + remainder
    return result

class SimplifiedTransfer(NamedTuple):
    from_user: str
    to_user: str
    amount: int      

def net_debts(raw_balances: dict[int, int]) -> list[SimplifiedTransfer]:
    balances = {uid: amt for uid, amt in raw_balances.items() if amt != 0}
    creditors: list[list] = sorted([[uid, amt] for uid, amt in balances.items() if amt > 0], key=lambda x: -x[1])
    debtors: list[list] = sorted([[uid, -amt] for uid, amt in balances.items() if amt < 0], key=lambda x: -x[1])
    transfers: list[SimplifiedTransfer] = []
    ci, di = 0, 0
    while ci < len(creditors) and di < len(debtors):
        creditor_uid, credit = creditors[ci]
        debtor_uid, debt = debtors[di]
        transfer = min(credit, debt)
        transfers.append(SimplifiedTransfer(debtor_uid, creditor_uid, transfer))
        creditors[ci][1] -= transfer
        debtors[di][1] -= transfer
        if creditors[ci][1] == 0: ci += 1
        if debtors[di][1] == 0: di += 1
    return transfers

def _canonical_pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)

async def _upsert_debt(db: AsyncSession, debtor: str, creditor: str, delta: int, currency: str) -> None:
    small, large = _canonical_pair(debtor, creditor)
    sign = 1 if debtor == small else -1
    result = await db.execute(select(Debt).where(Debt.debtor_id == small, Debt.creditor_id == large, Debt.currency == currency).with_for_update())
    debt = result.scalar_one_or_none()

    if debt is None:
        actual_debtor, actual_creditor = (small, large) if sign == 1 else (large, small)
        debt = Debt(debtor_id=actual_debtor, creditor_id=actual_creditor, currency=currency, net_amount=abs(delta), status=DebtStatus.OUTSTANDING)
        db.add(debt)
    else:
        new_net = debt.net_amount + (sign * delta)
        if new_net < 0:
            debt.debtor_id, debt.creditor_id = debt.creditor_id, debt.debtor_id
            debt.net_amount = -new_net
        else:
            debt.net_amount = new_net
        debt.status = DebtStatus.OUTSTANDING if debt.net_amount > 0 else DebtStatus.SETTLED

def _write_ledger(db: AsyncSession, **kwargs) -> Ledger:
    entry = Ledger(**kwargs)
    db.add(entry)
    return entry

async def create_expense(db: AsyncSession, payload: ExpenseCreate) -> ExpenseRead:
    all_user_ids = list({p.user_id for p in payload.participants} | {payload.paid_by})
    for uid in all_user_ids:
        r = await db.execute(select(User).where(User.id == uid))
        if r.scalar_one_or_none() is None: raise UserNotFoundError(f"User {uid} not found")

    participant_ids = [p.user_id for p in payload.participants]
    if payload.split_method == SplitMethod.EQUAL: splits_map = compute_equal_splits(payload.total_amount, participant_ids)
    elif payload.split_method == SplitMethod.EXACT: splits_map = compute_exact_splits(payload.participants)
    else: splits_map = compute_percentage_splits(payload.total_amount, payload.participants)

    split_total = sum(splits_map.values())
    if split_total != payload.total_amount: raise SplitValidationError(f"Split total {split_total} != expense total {payload.total_amount}")

    expense = Expense(paid_by=payload.paid_by, group_id=payload.group_id, trip_id=payload.trip_id, description=payload.description, category=payload.category, total_amount=payload.total_amount, currency=payload.currency, split_method=payload.split_method)
    db.add(expense)
    await db.flush()

    for p in payload.participants:
        owed = splits_map[p.user_id]
        split = ExpenseSplit(expense_id=expense.id, user_id=p.user_id, owed_amount=owed, percentage_bps=p.percentage_bps)
        db.add(split)
        if p.user_id != payload.paid_by and owed > 0:
            await _upsert_debt(db, debtor=p.user_id, creditor=payload.paid_by, delta=owed, currency=payload.currency)
        if owed > 0:
            _write_ledger(db, user_id=p.user_id, entry_type=LedgerEntryType.DEBIT, amount=owed, currency=payload.currency, reference_type=LedgerReferenceType.PAYMENT, reference_id=expense.id, status=PaymentStatus.SUCCESS, description=f"Share of expense: {payload.description}")

    _write_ledger(db, user_id=payload.paid_by, entry_type=LedgerEntryType.CREDIT, amount=payload.total_amount, currency=payload.currency, reference_type=LedgerReferenceType.PAYMENT, reference_id=expense.id, status=PaymentStatus.SUCCESS, description=f"Paid expense: {payload.description}")
    await db.flush()

    result = await db.execute(select(Expense).where(Expense.id == expense.id))
    exp = result.scalar_one()
    splits_result = await db.execute(select(ExpenseSplit).where(ExpenseSplit.expense_id == expense.id))
    exp_read = ExpenseRead.model_validate(exp)
    exp_read.splits = [__import__("schemas.expenses", fromlist=["ExpenseSplitRead"]).ExpenseSplitRead.model_validate(s) for s in splits_result.scalars().all()]
    return exp_read

async def get_net_debts(db: AsyncSession, currency: str = "INR") -> NetDebtGraph:
    result = await db.execute(select(Debt).where(Debt.status == DebtStatus.OUTSTANDING, Debt.currency == currency, Debt.net_amount > 0))
    debts = list(result.scalars().all())
    total = sum(d.net_amount for d in debts)
    return NetDebtGraph(debts=[DebtRead.model_validate(d) for d in debts], total_outstanding_paise=total)

async def get_user_debts(db: AsyncSession, user_id: str, currency: str = "INR") -> NetDebtGraph:
    result = await db.execute(select(Debt).where(Debt.currency == currency, Debt.status == DebtStatus.OUTSTANDING, Debt.net_amount > 0, (Debt.debtor_id == user_id) | (Debt.creditor_id == user_id)))
    debts = list(result.scalars().all())
    total = sum(d.net_amount for d in debts)
    return NetDebtGraph(debts=[DebtRead.model_validate(d) for d in debts], total_outstanding_paise=total)

async def settle_debt(db: AsyncSession, payload: SettlementCreate) -> SettlementRead:
    result = await db.execute(select(Debt).where(Debt.id == payload.debt_id).with_for_update())
    debt = result.scalar_one_or_none()
    if debt is None: raise DebtNotFoundError(f"Debt {payload.debt_id} not found")
    if debt.status == DebtStatus.SETTLED: raise AlreadySettledError(f"Debt {payload.debt_id} is already fully settled")
    if payload.amount > debt.net_amount: raise OverpaymentError(f"Settlement amount {payload.amount} exceeds outstanding {debt.net_amount}")
    if payload.paid_by != debt.debtor_id or payload.paid_to != debt.creditor_id: raise ExpenseServiceError("paid_by / paid_to do not match debt debtor / creditor")

    settlement = Settlement(debt_id=debt.id, paid_by=payload.paid_by, paid_to=payload.paid_to, amount=payload.amount, currency=payload.currency, note=payload.note)
    db.add(settlement)

    debt.net_amount -= payload.amount
    if debt.net_amount == 0: debt.status = DebtStatus.SETTLED

    _write_ledger(db, user_id=payload.paid_by, entry_type=LedgerEntryType.DEBIT, amount=payload.amount, currency=payload.currency, reference_type=LedgerReferenceType.PAYMENT, reference_id=debt.id, status=PaymentStatus.SUCCESS, description=f"Settlement to {payload.paid_to}")
    _write_ledger(db, user_id=payload.paid_to, entry_type=LedgerEntryType.CREDIT, amount=payload.amount, currency=payload.currency, reference_type=LedgerReferenceType.PAYMENT, reference_id=debt.id, status=PaymentStatus.SUCCESS, description=f"Settlement received from {payload.paid_by}")
    await db.flush()
    return SettlementRead.model_validate(settlement)

async def simplify_debts(db: AsyncSession, user_ids: list[str], currency: str = "INR") -> list[SimplifiedTransfer]:
    raw: dict[int, int] = defaultdict(int)
    result = await db.execute(select(Debt).where(Debt.currency == currency, Debt.status == DebtStatus.OUTSTANDING, Debt.net_amount > 0))
    for debt in result.scalars().all():
        if debt.debtor_id in user_ids or debt.creditor_id in user_ids:
            raw[debt.creditor_id] += debt.net_amount   
            raw[debt.debtor_id] -= debt.net_amount     
    return net_debts(dict(raw))