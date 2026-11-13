import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.auth_service import get_current_user
from services.expense_service import (
    AlreadySettledError, DebtNotFoundError, ExpenseServiceError,
    OverpaymentError, SplitValidationError, UserNotFoundError, create_expense,
    get_user_debts, settle_debt, simplify_debts,
)
from schemas.expenses import ExpenseCreate, ExpenseRead, NetDebtGraph, SettlementCreate, SettlementRead

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/expenses", tags=["expenses"])

@router.post("", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
async def create(
    body: ExpenseCreate, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)
) -> ExpenseRead:
    # If the user doesn't explicitly pass paid_by, assume the current user paid
    if not body.paid_by:
        body.paid_by = current_user.id
        
    try: return await create_expense(db, body)
    except UserNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except SplitValidationError as exc: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except ExpenseServiceError as exc: raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

@router.get("/debts", response_model=NetDebtGraph)
async def all_debts(
    currency: str = Query(default="INR", min_length=3, max_length=3), 
    db: AsyncSession = Depends(get_db), 
    current_user = Depends(get_current_user)
) -> NetDebtGraph:
    # Only the caller's own debts – the global graph would expose every user's balances.
    return await get_user_debts(db, current_user.id, currency.upper())

@router.get("/debts/{user_id}", response_model=NetDebtGraph)
async def user_debts(
    user_id: str,
    currency: str = Query(default="INR"), 
    db: AsyncSession = Depends(get_db), 
    current_user = Depends(get_current_user)
) -> NetDebtGraph:
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only view your own debts")
    return await get_user_debts(db, user_id, currency.upper())

@router.post("/debts/simplify", response_model=list[dict])
async def simplify(
    user_ids: list[str],
    currency: str = Query(default="INR"), 
    db: AsyncSession = Depends(get_db), 
    current_user = Depends(get_current_user)
) -> list[dict]:
    transfers = await simplify_debts(db, user_ids, currency.upper())
    return [{"from_user": t.from_user, "to_user": t.to_user, "amount": t.amount} for t in transfers]

@router.post("/settle", response_model=SettlementRead, status_code=status.HTTP_201_CREATED)
async def settle(
    body: SettlementCreate, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)
) -> SettlementRead:
    try: return await settle_debt(db, body)
    except DebtNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except AlreadySettledError as exc: raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except OverpaymentError as exc: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except ExpenseServiceError as exc: raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc