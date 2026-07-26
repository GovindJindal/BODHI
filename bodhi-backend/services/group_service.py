from __future__ import annotations
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Updated BODHI Imports
from models.core import Ledger, LedgerEntryType, LedgerReferenceType, PaymentStatus
from models.core import User
from models.wallets import GroupMember, GroupVoteProposal, GroupWallet, GroupWalletStatus, MemberRole
from schemas.wallets import (
    GroupContributeRequest, GroupContributeResponse, GroupJoinRequest,
    GroupMemberRead, GroupWalletCreate, GroupWalletRead,
    ProposalCreate, ProposalRead,
)

logger = logging.getLogger(__name__)

class GroupServiceError(Exception): pass
class GroupNotFoundError(GroupServiceError): pass
class GroupClosedError(GroupServiceError): pass
class UserNotFoundError(GroupServiceError): pass
class AlreadyMemberError(GroupServiceError): pass
class NotMemberError(GroupServiceError): pass
class InsufficientFundsError(GroupServiceError): pass

async def _fetch_group_locked(db: AsyncSession, group_id: str) -> GroupWallet:
    result = await db.execute(select(GroupWallet).where(GroupWallet.id == group_id).with_for_update())
    group = result.scalar_one_or_none()
    if group is None: raise GroupNotFoundError(f"GroupWallet {group_id} not found")
    return group

async def _fetch_user(db: AsyncSession, user_id: int) -> User: # UPDATED to int
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None: raise UserNotFoundError(f"User {user_id} not found")
    return user

async def _fetch_member_locked(db: AsyncSession, group_id: str, user_id: int) -> GroupMember | None: # UPDATED to int
    result = await db.execute(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id).with_for_update())
    return result.scalar_one_or_none()

async def _all_members(db: AsyncSession, group_id: str) -> list[GroupMember]:
    result = await db.execute(select(GroupMember).where(GroupMember.group_id == group_id).with_for_update())
    return list(result.scalars().all())

def _recalculate_ownership(members: list[GroupMember], group_total: int) -> None:
    if group_total == 0:
        for m in members: m.ownership_bps = 0
        return
    allocated = 0
    largest: GroupMember | None = None
    for m in members:
        bps = (m.contributed_amount * 10_000) // group_total
        m.ownership_bps = bps
        allocated += bps
        if largest is None or m.contributed_amount > largest.contributed_amount:
            largest = m
    remainder = 10_000 - allocated
    if remainder and largest: largest.ownership_bps += remainder

def _write_ledger(db: AsyncSession, *, user_id: int, entry_type: LedgerEntryType, amount: int, currency: str, reference_type: LedgerReferenceType, reference_id: str, status: PaymentStatus, description: str | None = None) -> Ledger: # UPDATED to int
    entry = Ledger(user_id=user_id, entry_type=entry_type, amount=amount, currency=currency, reference_type=reference_type, reference_id=reference_id, status=status, description=description)
    db.add(entry)
    return entry

async def create_group(db: AsyncSession, payload: GroupWalletCreate) -> GroupWalletRead:
    await _fetch_user(db, payload.created_by)
    group = GroupWallet(name=payload.name, description=payload.description, currency=payload.currency, target_amount=payload.target_amount, created_by=payload.created_by)
    db.add(group)
    await db.flush() 
    admin_member = GroupMember(group_id=group.id, user_id=payload.created_by, role=MemberRole.ADMIN)
    db.add(admin_member)
    await db.flush()
    return GroupWalletRead.model_validate(group)

async def join_group(db: AsyncSession, group_id: str, payload: GroupJoinRequest) -> GroupMemberRead:
    group = await _fetch_group_locked(db, group_id)
    if group.status == GroupWalletStatus.CLOSED: raise GroupClosedError("Cannot join a closed group")
    await _fetch_user(db, payload.user_id)
    existing = await _fetch_member_locked(db, group_id, payload.user_id)
    if existing is not None: raise AlreadyMemberError(f"User {payload.user_id} is already a member")
    member = GroupMember(group_id=group_id, user_id=payload.user_id, role=payload.role)
    db.add(member)
    await db.flush()
    return GroupMemberRead.model_validate(member)

async def contribute(db: AsyncSession, group_id: str, payload: GroupContributeRequest) -> GroupContributeResponse:
    group = await _fetch_group_locked(db, group_id)
    if group.status != GroupWalletStatus.OPEN: raise GroupClosedError(f"Group {group_id} is {group.status.value}; contributions not accepted")
    await _fetch_user(db, payload.user_id)
    member = await _fetch_member_locked(db, group_id, payload.user_id)
    if member is None:
        member = GroupMember(group_id=group_id, user_id=payload.user_id, role=MemberRole.MEMBER)
        db.add(member)
        await db.flush()
    member.contributed_amount += payload.amount
    group.total_contributed += payload.amount
    all_members = await _all_members(db, group_id)
    _recalculate_ownership(all_members, group.total_contributed)
    ledger_entry = _write_ledger(db, user_id=payload.user_id, entry_type=LedgerEntryType.CREDIT, amount=payload.amount, currency=group.currency, reference_type=LedgerReferenceType.PAYMENT, reference_id=group_id, status=PaymentStatus.SUCCESS, description=f"Contribution to group '{group.name}'")
    await db.flush()
    return GroupContributeResponse(group_id=group_id, user_id=payload.user_id, contributed_amount=member.contributed_amount, ownership_bps=member.ownership_bps, group_total=group.total_contributed, ledger_entry_id=ledger_entry.id)

async def close_group(db: AsyncSession, group_id: str) -> GroupWalletRead:
    group = await _fetch_group_locked(db, group_id)
    if group.status == GroupWalletStatus.CLOSED: raise GroupClosedError(f"Group {group_id} is already closed")
    group.status = GroupWalletStatus.CLOSED
    group.closed_at = datetime.now(timezone.utc)
    await db.flush()
    return GroupWalletRead.model_validate(group)

async def create_proposal(db: AsyncSession, group_id: str, payload: ProposalCreate) -> ProposalRead:
    group = await _fetch_group_locked(db, group_id)
    if group.status != GroupWalletStatus.OPEN: raise GroupClosedError("Proposals can only be created for OPEN groups")
    member = await _fetch_member_locked(db, group_id, payload.proposed_by)
    if member is None: raise NotMemberError(f"User {payload.proposed_by} is not a member of group {group_id}")
    proposal = GroupVoteProposal(group_id=group_id, proposed_by=payload.proposed_by, title=payload.title, description=payload.description, amount=payload.amount, destination=payload.destination, voting_deadline=payload.voting_deadline)
    db.add(proposal)
    await db.flush()
    return ProposalRead.model_validate(proposal)

async def get_group(db: AsyncSession, group_id: str, user_id: str) -> GroupWalletRead:
    result = await db.execute(select(GroupWallet).where(GroupWallet.id == group_id))
    group = result.scalar_one_or_none()
    if group is None: raise GroupNotFoundError(f"GroupWallet {group_id} not found")
    
    # IDOR/BOLA Protection: Ensure requesting user is a member
    member = await db.execute(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id))
    if not member.scalar_one_or_none():
        # Prefer GroupNotFoundError (404) over 403 to prevent enumeration
        raise GroupNotFoundError(f"GroupWallet {group_id} not found")
        
    return GroupWalletRead.model_validate(group)

async def list_members(db: AsyncSession, group_id: str, user_id: str) -> list[GroupMemberRead]:
    # IDOR/BOLA Protection: Ensure requesting user is a member
    member = await db.execute(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id))
    if not member.scalar_one_or_none():
        # Prefer GroupNotFoundError (404) over 403 to prevent enumeration
        raise GroupNotFoundError(f"GroupWallet {group_id} not found")
        
    result = await db.execute(select(GroupMember).where(GroupMember.group_id == group_id))
    return [GroupMemberRead.model_validate(m) for m in result.scalars().all()]