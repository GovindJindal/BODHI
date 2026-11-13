"""
routers/social.py
Social Hub API — Shared Investments & Shared Trip Wallets
FastAPI + SQLAlchemy Async (BODHI stack)

Endpoints:
  GET /social/investments  → User's active investment groups with per-user share
  GET /social/trips        → User's active trip wallets with spent/owed amounts
"""

import asyncio
import secrets
import string
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.core import User
from services.auth_service import get_current_user
from models.social import (
    InvestmentGroup,
    InvestmentMember,
    InvestmentStatus,
    TripWallet,
    TripMember,
    TripExpense,
    TripSplit,
    TripStatus,
    SplitType,
)

router = APIRouter(tags=["social"])

# ── POST Schemas ──
class CreateGroupReq(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty")
        return v

class CreateExpenseReq(BaseModel):
    description: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0, le=10_000_000)
    category: Optional[str] = Field(default="general", max_length=60)

class ContributeReq(BaseModel):
    amount: float = Field(..., gt=0, le=10_000_000)

class JoinReq(BaseModel):
    invite_code: str = Field(..., min_length=4, max_length=12)

class CreatePollReq(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    quantity: float = Field(..., gt=0)
    type: str = Field(..., pattern=r"(?i)^(BUY|SELL)$")
    expires_hours: int = Field(default=48, ge=1, le=24 * 30)

# ── Response Schemas ───────────────────────────────────────────────────────────

class InvestmentGroupOut(BaseModel):
    """
    Mirrors exactly what SocialScreen.tsx needs for each venture card.
    All monetary values are pre-formatted strings (₹X,XX,XXX.XX).
    """
    id:             int
    name:           str
    emoji:          str
    member_count:   int
    pending_votes:  int = Field(description="Total open votes for the current user")
    total_value:    str = Field(description="Formatted total portfolio value e.g. ₹2,45,680.50")
    total_returns:  str = Field(description="Formatted return amount e.g. +₹18,750.30")
    returns_pct:    str = Field(description="Formatted return percentage e.g. +8.25%")
    your_share:     str = Field(description="Formatted rupee value of user's ownership slice")
    status:         str
    invite_code:    str
    created_at:     datetime

    class Config:
        from_attributes = True


class TripWalletOut(BaseModel):
    """
    Mirrors exactly what SocialScreen.tsx needs for each trip card.
    `you_owe` is positive when user owes money; negative when others owe them.
    """
    id:             int
    name:           str
    emoji:          str
    member_count:   int
    status_label:   str = Field(description="Human-readable status e.g. 'Just started'")
    total_balance:  str = Field(description="Formatted total wallet balance e.g. ₹62,340.00")
    you_spent:      str = Field(description="Formatted total paid by current user e.g. ₹8,120.00")
    you_owe:        str = Field(description="Formatted net amount owed by user e.g. ₹2,430.00")
    you_owe_raw:    float = Field(description="Raw net owed (positive = you owe, negative = owed to you)")
    invite_code:    str
    created_at:     datetime

    class Config:
        from_attributes = True


class SocialDashboardOut(BaseModel):
    investments:    List[InvestmentGroupOut]
    trips:          List[TripWalletOut]
    # Aggregates for a future summary widget
    total_invested: str
    total_trips:    int


# ── Formatting Helpers ─────────────────────────────────────────────────────────

def _fmt_inr(amount: float, sign: bool = False) -> str:
    """
    Format a float as an Indian-locale rupee string.
    e.g. 245680.50 → '₹2,45,680.50'
    sign=True prepends '+' for positive values (for returns display).
    """
    prefix = ""
    if sign and amount > 0:
        prefix = "+"
    elif amount < 0:
        prefix = "-"
        amount = abs(amount)

    # Indian number system: last 3 digits, then pairs
    int_part = int(amount)
    dec_part = round((amount - int_part) * 100)
    s = str(int_part)
    if len(s) > 3:
        last3 = s[-3:]
        rest = s[:-3]
        # Group rest in pairs from the right
        groups = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        s = ",".join(groups) + "," + last3
    return f"{prefix}₹{s}.{dec_part:02d}"


def _fmt_pct(value: float, sign: bool = True) -> str:
    prefix = "+" if (sign and value > 0) else ("-" if value < 0 else "")
    return f"{prefix}{abs(value):.2f}%"


def _status_label(trip: TripWallet) -> str:
    if trip.status == TripStatus.SETTLED:
        return "Settled"
    if trip.start_date and trip.start_date > datetime.utcnow():
        return "Upcoming"
    if not trip.expenses:
        return "Just started"
    return "In progress"


# ── Shared Query Helpers ───────────────────────────────────────────────────────

async def _investment_groups_for_user(
    uid: str, db: AsyncSession
) -> List[InvestmentGroup]:
    """Load all ACTIVE investment groups the user belongs to, with members eager-loaded."""
    member_ids_q = await db.execute(
        select(InvestmentMember.group_id).where(InvestmentMember.user_id == uid)
    )
    group_ids = [r[0] for r in member_ids_q.fetchall()]
    if not group_ids:
        return []

    result = await db.execute(
        select(InvestmentGroup)
        .options(selectinload(InvestmentGroup.members))
        .where(
            and_(
                InvestmentGroup.id.in_(group_ids),
                InvestmentGroup.status == InvestmentStatus.ACTIVE,
            )
        )
        .order_by(InvestmentGroup.updated_at.desc())
    )
    return result.scalars().all()


async def _trip_wallets_for_user(uid: str, db: AsyncSession) -> List[TripWallet]:
    """Load all ACTIVE trip wallets the user belongs to, with expenses + splits eager-loaded."""
    member_ids_q = await db.execute(
        select(TripMember.trip_id).where(TripMember.user_id == uid)
    )
    trip_ids = [r[0] for r in member_ids_q.fetchall()]
    if not trip_ids:
        return []

    result = await db.execute(
        select(TripWallet)
        .options(
            selectinload(TripWallet.members),
            selectinload(TripWallet.expenses).selectinload(TripExpense.splits),
        )
        .where(
            and_(
                TripWallet.id.in_(trip_ids),
                TripWallet.status == TripStatus.ACTIVE,
            )
        )
        .order_by(TripWallet.updated_at.desc())
    )
    return result.scalars().all()


# ── Per-User Trip Calculations ─────────────────────────────────────────────────

def _calculate_trip_figures(trip: TripWallet, uid: str) -> tuple[float, float]:
    """
    Returns (you_spent, you_owe_net) for `uid` across all expenses in `trip`.

    you_spent   = total amount uid paid (as the payer) across all expenses
    you_owe_net = (sum of uid's splits that are unsettled) minus
                  (unsettled amounts others owe uid as payer)
                  Positive → uid owes the group
                  Negative → group owes uid
    """
    you_spent: float = 0.0
    your_liability: float = 0.0   # what you owe to others as a splitee
    others_owe_you: float = 0.0   # what others owe you because you paid

    for expense in trip.expenses:
        # Amount this user paid out-of-pocket
        if expense.paid_by_user_id == uid:
            you_spent += expense.amount

        for split in expense.splits:
            split_amount = _resolve_split_amount(split, expense)

            if split.is_settled:
                continue

            if split.user_id == uid and expense.paid_by_user_id != uid:
                # Unsettled share the current user owes to the payer
                your_liability += split_amount
            elif split.user_id != uid and expense.paid_by_user_id == uid:
                # Unsettled share another member owes to the current user
                others_owe_you += split_amount

    you_owe_net = round(your_liability - others_owe_you, 2)
    return round(you_spent, 2), you_owe_net


def _resolve_split_amount(split: TripSplit, expense: TripExpense) -> float:
    """Convert a split record to its actual rupee value."""
    if expense.split_type == SplitType.PERCENTAGE:
        return expense.amount * split.amount   # split.amount is 0–1
    return split.amount                        # EQUAL or EXACT: already in rupees


# ── Endpoint: GET /social/investments ─────────────────────────────────────────

@router.get("/investments", response_model=List[InvestmentGroupOut])
async def get_investments(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Returns all ACTIVE investment groups the current user is a member of.
    Each item includes the user's personal share value and pending vote count.
    """
    uid: str = current_user.id
    groups = await _investment_groups_for_user(uid, db)

    out: List[InvestmentGroupOut] = []
    for group in groups:
        membership = next((m for m in group.members if m.user_id == uid), None)
        if not membership:
            continue  # safety guard — shouldn't happen

        share_val = group.member_share(uid)

        out.append(
            InvestmentGroupOut(
                id=group.id,
                name=group.name,
                emoji=group.emoji,
                member_count=group.member_count,
                pending_votes=membership.pending_votes,
                total_value=_fmt_inr(group.total_value),
                total_returns=_fmt_inr(group.total_returns, sign=True),
                returns_pct=_fmt_pct(group.returns_pct),
                your_share=_fmt_inr(share_val),
                status=group.status.value,
                invite_code=group.invite_code,
                created_at=group.created_at,
            )
        )

    return out


# ── Endpoint: GET /social/trips ────────────────────────────────────────────────

@router.get("/trips", response_model=List[TripWalletOut])
async def get_trips(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Returns all ACTIVE trip wallets the current user is a member of.
    Each item includes how much the user has spent and their current net balance
    (positive = they owe the group; negative = the group owes them).
    """
    uid: str = current_user.id
    trips = await _trip_wallets_for_user(uid, db)

    out: List[TripWalletOut] = []
    for trip in trips:
        you_spent, you_owe_net = _calculate_trip_figures(trip, uid)

        out.append(
            TripWalletOut(
                id=trip.id,
                name=trip.name,
                emoji=trip.emoji,
                member_count=trip.member_count,
                status_label=_status_label(trip),
                total_balance=_fmt_inr(trip.total_spent or 0),
                you_spent=_fmt_inr(you_spent),
                you_owe=_fmt_inr(abs(you_owe_net)),
                you_owe_raw=you_owe_net,
                invite_code=trip.invite_code,
                created_at=trip.created_at,
            )
        )

    return out


# ── Endpoint: GET /social/dashboard ───────────────────────────────────────────

@router.get("/dashboard", response_model=SocialDashboardOut)
async def social_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Composite endpoint — returns both investments and trips in one call.
    Ideal for the initial Social Hub screen load.
    """
    uid: str = current_user.id

    groups = await _investment_groups_for_user(uid, db)
    trips  = await _trip_wallets_for_user(uid, db)

    # ── Investment items ──────────────────────────────────────
    investment_items: List[InvestmentGroupOut] = []
    total_invested_raw: float = 0.0

    for group in groups:
        membership = next((m for m in group.members if m.user_id == uid), None)
        if not membership:
            continue
        share_val = group.member_share(uid)
        total_invested_raw += share_val

        investment_items.append(
            InvestmentGroupOut(
                id=group.id,
                name=group.name,
                emoji=group.emoji,
                member_count=group.member_count,
                pending_votes=membership.pending_votes,
                total_value=_fmt_inr(group.total_value),
                total_returns=_fmt_inr(group.total_returns, sign=True),
                returns_pct=_fmt_pct(group.returns_pct),
                your_share=_fmt_inr(share_val),
                status=group.status.value,
                invite_code=group.invite_code,
                created_at=group.created_at,
            )
        )

    # ── Trip items ────────────────────────────────────────────
    trip_items: List[TripWalletOut] = []

    for trip in trips:
        you_spent, you_owe_net = _calculate_trip_figures(trip, uid)
        trip_items.append(
            TripWalletOut(
                id=trip.id,
                name=trip.name,
                emoji=trip.emoji,
                member_count=trip.member_count,
                status_label=_status_label(trip),
                total_balance=_fmt_inr(trip.total_spent or 0),
                you_spent=_fmt_inr(you_spent),
                you_owe=_fmt_inr(abs(you_owe_net)),
                you_owe_raw=you_owe_net,
                invite_code=trip.invite_code,
                created_at=trip.created_at,
            )
        )

    return SocialDashboardOut(
        investments=investment_items,
        trips=trip_items,
        total_invested=_fmt_inr(total_invested_raw),
        total_trips=len(trip_items),
    )

# ── Shared helpers for write endpoints ─────────────────────────────────────────

_INVITE_ALPHABET = string.ascii_uppercase + string.digits


async def _new_invite_code(db: AsyncSession, model) -> str:
    """Cryptographically random, collision-checked 6-char invite code."""
    for _ in range(10):
        code = "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(6))
        if not await db.scalar(select(model.id).where(model.invite_code == code)):
            return code
    raise HTTPException(status_code=500, detail="Could not allocate an invite code, please retry")


async def _user_names(db: AsyncSession, user_ids) -> dict:
    ids = {u for u in user_ids if u}
    if not ids:
        return {}
    rows = await db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))
    return {uid: (name or "Member") for uid, name in rows.all()}


async def _load_trip(db: AsyncSession, trip_id: int, uid: str, *, with_splits: bool = True) -> TripWallet:
    expenses = selectinload(TripWallet.expenses)
    if with_splits:
        expenses = expenses.selectinload(TripExpense.splits)
    trip = (await db.execute(
        select(TripWallet).options(selectinload(TripWallet.members), expenses).where(TripWallet.id == trip_id)
    )).scalar_one_or_none()
    if not trip or trip.status != TripStatus.ACTIVE:
        raise HTTPException(status_code=404, detail="Trip not found")
    if not any(m.user_id == uid for m in trip.members):
        raise HTTPException(status_code=403, detail="Not a member of this trip")
    return trip


async def _load_club(db: AsyncSession, club_id: int, uid: str) -> InvestmentGroup:
    club = (await db.execute(
        select(InvestmentGroup).options(selectinload(InvestmentGroup.members)).where(InvestmentGroup.id == club_id)
    )).scalar_one_or_none()
    if not club or club.status != InvestmentStatus.ACTIVE:
        raise HTTPException(status_code=404, detail="Club not found")
    if not any(m.user_id == uid for m in club.members):
        raise HTTPException(status_code=403, detail="Not a member of this club")
    return club


def _trip_net_balances(trip: TripWallet) -> dict:
    """Net position per member (+ = is owed money, - = owes money).

    Uses the stored splits; legacy expenses without splits fall back to an
    equal split across the current members.
    """
    member_ids = [m.user_id for m in trip.members]
    net = {uid: 0.0 for uid in member_ids}
    for exp in trip.expenses:
        net[exp.paid_by_user_id] = net.get(exp.paid_by_user_id, 0.0) + exp.amount
        if exp.splits:
            for sp in exp.splits:
                net[sp.user_id] = net.get(sp.user_id, 0.0) - _resolve_split_amount(sp, exp)
        elif member_ids:
            share = exp.amount / len(member_ids)
            for uid in member_ids:
                net[uid] -= share
    return {uid: round(v, 2) for uid, v in net.items()}


def _greedy_settlement(net: dict) -> list:
    debtors = sorted(([u, -v] for u, v in net.items() if v < -0.01), key=lambda x: x[1], reverse=True)
    creditors = sorted(([u, v] for u, v in net.items() if v > 0.01), key=lambda x: x[1], reverse=True)
    out, i, j = [], 0, 0
    while i < len(debtors) and j < len(creditors):
        amt = min(debtors[i][1], creditors[j][1])
        out.append({"from_user": debtors[i][0], "to_user": creditors[j][0], "amount": round(amt, 2)})
        debtors[i][1] -= amt
        creditors[j][1] -= amt
        if debtors[i][1] < 0.01:
            i += 1
        if creditors[j][1] < 0.01:
            j += 1
    return out


# ── Endpoint: POST /social/investments ──
@router.post("/investments")
async def create_investment_group(
    req: CreateGroupReq,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    new_group = InvestmentGroup(
        name=req.name,
        created_by=current_user.id,
        invite_code=await _new_invite_code(db, InvestmentGroup),
        status=InvestmentStatus.ACTIVE,
    )
    db.add(new_group)
    await db.flush()
    db.add(InvestmentMember(group_id=new_group.id, user_id=current_user.id, share_percentage=100.0, is_admin=True))
    await db.commit()
    return {"message": "Investment group created", "id": new_group.id, "invite_code": new_group.invite_code}


# ── Endpoint: POST /social/trips ──
@router.post("/trips")
async def create_trip_wallet(
    req: CreateGroupReq,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    new_trip = TripWallet(
        name=req.name,
        created_by=current_user.id,
        invite_code=await _new_invite_code(db, TripWallet),
        status=TripStatus.ACTIVE,
    )
    db.add(new_trip)
    await db.flush()
    db.add(TripMember(trip_id=new_trip.id, user_id=current_user.id, is_admin=True))
    await db.commit()
    return {"message": "Trip wallet created", "id": new_trip.id, "invite_code": new_trip.invite_code}


# ── Endpoint: POST /trips/join ──
@router.post("/trips/join")
async def join_trip_wallet(
    req: JoinReq,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    trip = (await db.execute(
        select(TripWallet).where(TripWallet.invite_code == req.invite_code.strip().upper())
    )).scalar_one_or_none()
    if not trip or trip.status != TripStatus.ACTIVE:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    existing = await db.scalar(select(TripMember.id).where(TripMember.trip_id == trip.id, TripMember.user_id == current_user.id))
    if existing:
        return {"message": "Already a member", "id": trip.id}

    db.add(TripMember(trip_id=trip.id, user_id=current_user.id, is_admin=False))
    await db.commit()
    return {"message": "Joined trip successfully", "id": trip.id}


# ── Endpoint: POST /investments/join ──
@router.post("/investments/join")
async def join_investment_club(
    req: JoinReq,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    group = (await db.execute(
        select(InvestmentGroup).where(InvestmentGroup.invite_code == req.invite_code.strip().upper())
    )).scalar_one_or_none()
    if not group or group.status != InvestmentStatus.ACTIVE:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    existing = await db.scalar(select(InvestmentMember.id).where(
        InvestmentMember.group_id == group.id, InvestmentMember.user_id == current_user.id))
    if existing:
        return {"message": "Already a member", "id": group.id}

    # 0% share until they contribute
    db.add(InvestmentMember(group_id=group.id, user_id=current_user.id, share_percentage=0.0, is_admin=False))
    await db.commit()
    return {"message": "Joined club successfully", "id": group.id}


# ── Endpoint: GET /social/trips/{trip_id} ──
@router.get("/trips/{trip_id}")
async def get_trip_details(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    trip = await _load_trip(db, trip_id, current_user.id)
    names = await _user_names(db, [m.user_id for m in trip.members] + [e.paid_by_user_id for e in trip.expenses])
    net = _trip_net_balances(trip)

    members = []
    for member in trip.members:
        paid = sum(e.amount for e in trip.expenses if e.paid_by_user_id == member.user_id)
        members.append({
            "user_id": member.user_id,
            "name": names.get(member.user_id, "Member"),
            "is_admin": member.is_admin,
            "is_you": member.user_id == current_user.id,
            "contributed": round(paid, 2),
            "balance": net.get(member.user_id, 0.0),
        })

    expenses = sorted(trip.expenses, key=lambda e: e.created_at or datetime.min, reverse=True)
    return {
        "id": trip.id,
        "name": trip.name,
        "total_expenses": round(sum(e.amount for e in trip.expenses), 2),
        "expenses": [
            {
                "id": e.id,
                "desc": e.title,
                "amount": e.amount,
                "paid_by": e.paid_by_user_id,
                "paid_by_name": names.get(e.paid_by_user_id, "Member"),
                "category": e.category,
                "created_at": e.created_at,
            } for e in expenses
        ],
        "members": members,
        "invite_code": trip.invite_code,
        "is_admin": any(m.user_id == current_user.id and m.is_admin for m in trip.members),
    }


# ── Endpoint: POST /social/trips/{trip_id}/expenses ──
@router.post("/trips/{trip_id}/expenses")
async def add_trip_expense(
    trip_id: int,
    req: CreateExpenseReq,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    trip = await _load_trip(db, trip_id, current_user.id, with_splits=False)
    amount = round(req.amount, 2)
    member_ids = sorted(m.user_id for m in trip.members)

    expense = TripExpense(
        trip_id=trip.id,
        paid_by_user_id=current_user.id,
        amount=amount,
        title=req.description.strip(),
        split_type=SplitType.EQUAL,
        category=(req.category or "general").strip().lower() or "general",
    )
    db.add(expense)
    await db.flush()

    # Equal split among current members; the first member absorbs rounding paise.
    per_head = round(amount / len(member_ids), 2)
    remainder = round(amount - per_head * len(member_ids), 2)
    for idx, uid in enumerate(member_ids):
        db.add(TripSplit(
            expense_id=expense.id,
            user_id=uid,
            amount=round(per_head + (remainder if idx == 0 else 0), 2),
            is_settled=uid == current_user.id,  # the payer's own share is already "paid"
        ))

    trip.total_spent = round((trip.total_spent or 0) + amount, 2)
    await db.commit()
    return {"message": "Expense added successfully", "id": expense.id}


# ── Endpoint: GET /social/trips/{trip_id}/settle ──
@router.get("/trips/{trip_id}/settle")
async def get_trip_settlement_plan(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    trip = await _load_trip(db, trip_id, current_user.id)
    transactions = _greedy_settlement(_trip_net_balances(trip))
    names = await _user_names(db, [t["from_user"] for t in transactions] + [t["to_user"] for t in transactions])
    for t in transactions:
        t["from_name"] = names.get(t["from_user"], "Member")
        t["to_name"] = names.get(t["to_user"], "Member")
    return {"transactions": transactions}


def _latest_price(symbol: str) -> Optional[float]:
    try:
        import yfinance as yf
        price = yf.Ticker(symbol).fast_info.get("lastPrice")
        return float(price) if price else None
    except Exception:
        return None


# ── Endpoint: GET /social/investments/{club_id} ──
@router.get("/investments/{club_id}")
async def get_club_details(
    club_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from models.social import InvestmentHolding, InvestmentPoll

    club = await _load_club(db, club_id, current_user.id)
    holdings = (await db.execute(select(InvestmentHolding).where(InvestmentHolding.group_id == club_id))).scalars().all()
    polls = (await db.execute(
        select(InvestmentPoll)
        .where(InvestmentPoll.group_id == club_id, InvestmentPoll.status == "ACTIVE")
        .order_by(InvestmentPoll.created_at.desc())
    )).scalars().all()

    # Price lookups are blocking network calls: run them in parallel off the event loop.
    prices = await asyncio.gather(*(run_in_threadpool(_latest_price, h.symbol) for h in holdings))
    names = await _user_names(db, [m.user_id for m in club.members])

    return {
        "id": club.id,
        "name": club.name,
        "buying_power": club.total_balance,
        "total_value": club.total_value,
        "total_invested": club.total_invested,
        "total_returns": club.total_returns,
        "members": [
            {
                "user_id": m.user_id,
                "name": names.get(m.user_id, "Member"),
                "share": round(m.share_percentage, 2),
                "contributed": m.contributed_amount,
                "is_admin": m.is_admin,
                "is_you": m.user_id == current_user.id,
            }
            for m in club.members
        ],
        "holdings": [
            {
                "id": h.id,
                "symbol": h.symbol,
                "qty": h.quantity,
                "avgPrice": h.average_price,
                "currentPrice": price if price is not None else h.average_price,
            }
            for h, price in zip(holdings, prices)
        ],
        "polls": [
            {
                "id": p.id, "type": p.type, "symbol": p.symbol, "quantity": p.quantity,
                "votes_for": p.votes_for, "votes_against": p.votes_against, "votes_needed": p.votes_needed,
                "expires_at": p.expires_at,
            }
            for p in polls
        ],
        "invite_code": club.invite_code,
        "is_admin": any(m.user_id == current_user.id and m.is_admin for m in club.members),
    }


# ── Endpoint: POST /social/investments/{club_id}/polls ──
@router.post("/investments/{club_id}/polls")
async def create_club_proposal(
    club_id: int,
    req: CreatePollReq,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Propose a BUY/SELL for the club; a simple majority of members is needed."""
    from models.social import InvestmentPoll

    club = await _load_club(db, club_id, current_user.id)
    poll = InvestmentPoll(
        group_id=club.id,
        created_by=current_user.id,
        type=req.type.upper(),
        symbol=req.symbol.strip().upper(),
        quantity=req.quantity,
        votes_needed=len(club.members) // 2 + 1,
        status="ACTIVE",
        expires_at=datetime.utcnow() + timedelta(hours=req.expires_hours),
    )
    db.add(poll)
    await db.commit()
    return {"message": "Proposal created", "id": poll.id}


# ── Endpoint: POST /social/investments/{club_id}/contribute ──
@router.post("/investments/{club_id}/contribute")
async def add_club_funds(
    club_id: int,
    req: ContributeReq,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Move money from the member's BODHI wallet into the club pool."""
    from models.core import Ledger, LedgerEntryType, LedgerReferenceType, PaymentStatus

    amount = round(req.amount, 2)
    club = await _load_club(db, club_id, current_user.id)

    # Lock the club row and the wallet (fresh values, not the cached identity map).
    group = (await db.execute(
        select(InvestmentGroup).where(InvestmentGroup.id == club.id).with_for_update().execution_options(populate_existing=True)
    )).scalar_one()
    wallet = (await db.execute(
        select(User).where(User.id == current_user.id).with_for_update().execution_options(populate_existing=True)
    )).scalar_one()
    if wallet.balance + 1e-9 < amount:
        raise HTTPException(status_code=400, detail=f"Insufficient wallet balance (₹{wallet.balance:,.2f}).")

    wallet.balance = round(wallet.balance - amount, 2)
    group.total_balance = round((group.total_balance or 0) + amount, 2)
    group.total_invested = round((group.total_invested or 0) + amount, 2)
    group.total_value = round((group.total_value or 0) + amount, 2)

    members = (await db.execute(select(InvestmentMember).where(InvestmentMember.group_id == group.id))).scalars().all()
    for m in members:
        if m.user_id == current_user.id:
            m.contributed_amount = round((m.contributed_amount or 0) + amount, 2)
    total = sum(m.contributed_amount or 0 for m in members)
    if total > 0:
        for m in members:
            m.share_percentage = round((m.contributed_amount or 0) * 100 / total, 4)

    db.add(Ledger(
        user_id=wallet.id,
        entry_type=LedgerEntryType.DEBIT,
        amount=int(round(amount * 100)),
        currency="INR",
        reference_type=LedgerReferenceType.PAYMENT,
        reference_id=str(uuid.uuid4()),
        status=PaymentStatus.SUCCESS,
        description=f"Contribution to club '{group.name}'",
    ))
    await db.commit()
    return {"message": "Funds added successfully", "new_balance": group.total_balance, "wallet_balance": wallet.balance}


# ── DELETE INVESTMENT CLUB ──
@router.delete("/investments/{club_id}")
async def delete_investment_club(
    club_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    club = await _load_club(db, club_id, current_user.id)
    if club.created_by != current_user.id and not any(m.user_id == current_user.id and m.is_admin for m in club.members):
        raise HTTPException(status_code=403, detail="Only the club admin can delete this club")
    if (club.total_balance or 0) > 0.009:
        raise HTTPException(status_code=400, detail="This club still holds funds. Withdraw or settle them before deleting.")
    await db.delete(club)
    await db.commit()
    return {"message": "Club deleted successfully"}


# ── DELETE TRIP WALLET ──
@router.delete("/trips/{trip_id}")
async def delete_trip_wallet(
    trip_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    trip = await _load_trip(db, trip_id, current_user.id, with_splits=False)
    if trip.created_by != current_user.id and not any(m.user_id == current_user.id and m.is_admin for m in trip.members):
        raise HTTPException(status_code=403, detail="Only the trip admin can delete this trip")
    await db.delete(trip)
    await db.commit()
    return {"message": "Trip deleted successfully"}
