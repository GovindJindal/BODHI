import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.auth_service import get_current_user

# These imports will work once you drop the services in!
import services.group_service as group_svc
import services.trips_service as trip_svc
from schemas.wallets import (
    GroupContributeRequest, GroupContributeResponse, GroupJoinRequest, GroupMemberRead,
    GroupWalletCreate, GroupWalletRead, ProposalCreate, ProposalRead,
    TripCloseResponse, TripContributeRequest, TripContributeResponse,
    TripExpenseCreate, TripExpenseRead, TripJoinRequest, TripMemberRead,
    TripWalletActivate, TripWalletCreate, TripWalletRead,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/wallets", tags=["wallets"])

_GROUP_PREFIX = "/groups"

@router.post(f"{_GROUP_PREFIX}", response_model=GroupWalletRead, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: GroupWalletCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> GroupWalletRead:
    body.created_by = current_user.id # Force ID to prevent spoofing
    try: return await group_svc.create_group(db, body)
    except group_svc.UserNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

@router.get(f"{_GROUP_PREFIX}/{{group_id}}", response_model=GroupWalletRead)
async def get_group(group_id: str, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)) -> GroupWalletRead:
    try: return await group_svc.get_group(db, group_id, current_user.id)
    except group_svc.GroupNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

@router.post(f"{_GROUP_PREFIX}/{{group_id}}/members", response_model=GroupMemberRead, status_code=status.HTTP_201_CREATED)
async def join_group(
    group_id: str, body: GroupJoinRequest, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)
) -> GroupMemberRead:
    body.user_id = current_user.id
    try: return await group_svc.join_group(db, group_id, body)
    except group_svc.GroupNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except group_svc.UserNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except group_svc.GroupClosedError as exc: raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except group_svc.AlreadyMemberError as exc: raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

@router.get(f"{_GROUP_PREFIX}/{{group_id}}/members", response_model=list[GroupMemberRead])
async def list_group_members(group_id: str, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)) -> list[GroupMemberRead]:
    try: return await group_svc.list_members(db, group_id, current_user.id)
    except group_svc.GroupNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

@router.post(f"{_GROUP_PREFIX}/{{group_id}}/contribute", response_model=GroupContributeResponse)
async def contribute_to_group(
    group_id: str, body: GroupContributeRequest, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)
) -> GroupContributeResponse:
    body.user_id = current_user.id
    try: return await group_svc.contribute(db, group_id, body)
    except group_svc.GroupNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except group_svc.UserNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except group_svc.GroupClosedError as exc: raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except group_svc.GroupServiceError as exc: raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

@router.post(f"{_GROUP_PREFIX}/{{group_id}}/proposals", response_model=ProposalRead, status_code=status.HTTP_201_CREATED)
async def create_proposal(
    group_id: str, body: ProposalCreate, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)
) -> ProposalRead:
    body.proposed_by = current_user.id
    try: return await group_svc.create_proposal(db, group_id, body)
    except group_svc.GroupNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except group_svc.GroupClosedError as exc: raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except group_svc.NotMemberError as exc: raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc

_TRIP_PREFIX = "/trips"

@router.post(f"{_TRIP_PREFIX}", response_model=TripWalletRead, status_code=status.HTTP_201_CREATED)
async def create_trip(
    body: TripWalletCreate, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)
) -> TripWalletRead:
    body.created_by = current_user.id
    try: return await trip_svc.create_trip(db, body)
    except trip_svc.UserNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

@router.post(f"{_TRIP_PREFIX}/{{trip_id}}/members", response_model=TripMemberRead, status_code=status.HTTP_201_CREATED)
async def join_trip(
    trip_id: str, body: TripJoinRequest, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)
) -> TripMemberRead:
    body.user_id = current_user.id
    try: return await trip_svc.join_trip(db, trip_id, body)
    except trip_svc.TripNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except trip_svc.TripStateError as exc: raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except trip_svc.AlreadyMemberError as exc: raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

@router.post(f"{_TRIP_PREFIX}/{{trip_id}}/contribute", response_model=TripContributeResponse)
async def contribute_to_trip(
    trip_id: str, body: TripContributeRequest, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)
) -> TripContributeResponse:
    body.user_id = current_user.id
    try: return await trip_svc.contribute_to_trip(db, trip_id, body)
    except trip_svc.TripNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except trip_svc.TripStateError as exc: raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except trip_svc.NotMemberError as exc: raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except trip_svc.TripServiceError as exc: raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

@router.post(f"{_TRIP_PREFIX}/{{trip_id}}/expenses", response_model=TripExpenseRead, status_code=status.HTTP_201_CREATED)
async def record_expense(
    trip_id: str, body: TripExpenseCreate, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)
) -> TripExpenseRead:
    body.recorded_by = current_user.id
    try: return await trip_svc.record_expense(db, trip_id, body)
    except trip_svc.TripNotFoundError as exc: raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except trip_svc.TripStateError as exc: raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except trip_svc.NotMemberError as exc: raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except trip_svc.InsufficientFundsError as exc: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc