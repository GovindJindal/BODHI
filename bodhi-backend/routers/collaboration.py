"""
routers/collaboration.py
REST + WebSocket APIs for scoped collaboration (Chat, Polls, Activity).
Integrates with TripWallet and InvestmentGroup.
"""

import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, HTTPException, Query,
    WebSocket, WebSocketDisconnect
)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.collaboration import (
    GroupPoll, PollOption, GroupPollVote,
    GroupMessage, GroupActivity,
    GroupType, MessageType, ActivityType
)
from models.social import TripMember, InvestmentMember
from models.core import User
from services.auth_service import get_current_user

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _verify_membership(
    group_type: GroupType, group_id: int, user_id: str, db: AsyncSession
):
    """Checks if the user is a member of the specified group."""
    if group_type == GroupType.trip:
        res = await db.execute(
            select(TripMember).where(TripMember.trip_id == group_id, TripMember.user_id == user_id)
        )
        if not res.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a member of this trip")
    elif group_type == GroupType.investment:
        res = await db.execute(
            select(InvestmentMember).where(InvestmentMember.group_id == group_id, InvestmentMember.user_id == user_id)
        )
        if not res.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a member of this investment club")
    else:
        raise HTTPException(status_code=400, detail="Invalid group type")


async def _log_group_activity(
    db: AsyncSession, group_type: GroupType, group_id: int, user_id: str,
    action: ActivityType, meta: dict
):
    db.add(GroupActivity(
        group_id=group_id, group_type=group_type, user_id=user_id,
        action_type=action, meta=meta
    ))


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class CreatePollReq(BaseModel):
    question: str
    options: List[str]
    expires_hours: Optional[int] = None

class VotePollReq(BaseModel):
    option_id: int

class SendMessageReq(BaseModel):
    message: str


# ─────────────────────────────────────────────────────────────────────────────
# Polls
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{group_type}/{group_id}/polls", status_code=201)
async def create_poll(
    group_type: GroupType,
    group_id: int,
    req: CreatePollReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _verify_membership(group_type, group_id, current_user.id, db)
    
    if len(req.options) < 2:
        raise HTTPException(status_code=422, detail="At least 2 options required")

    expires_at = None
    if req.expires_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=req.expires_hours)

    poll = GroupPoll(
        group_id=group_id,
        group_type=group_type,
        created_by=current_user.id,
        question=req.question,
        expires_at=expires_at,
    )
    db.add(poll)
    await db.flush()

    for opt_text in req.options:
        db.add(PollOption(poll_id=poll.id, text=opt_text))

    await _log_group_activity(db, group_type, group_id, current_user.id, ActivityType.poll_created,
                            {"question": req.question})
    await db.commit()
    return {"message": "Poll created", "poll_id": poll.id}


@router.get("/{group_type}/{group_id}/polls")
async def list_polls(
    group_type: GroupType,
    group_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _verify_membership(group_type, group_id, current_user.id, db)
    
    res = await db.execute(
        select(GroupPoll)
        .where(GroupPoll.group_id == group_id, GroupPoll.group_type == group_type)
        .options(selectinload(GroupPoll.options), selectinload(GroupPoll.votes))
        .order_by(GroupPoll.created_at.desc())
    )
    polls = res.scalars().all()

    out = []
    for p in polls:
        my_vote = next((v.selected_option for v in p.votes if v.user_id == current_user.id), None)
        total_votes = sum(o.votes for o in p.options)
        out.append({
            "id": p.id,
            "question": p.question,
            "is_active": p.is_active,
            "created_at": p.created_at.isoformat(),
            "expires_at": p.expires_at.isoformat() if p.expires_at else None,
            "my_vote": my_vote,
            "total_votes": total_votes,
            "options": [
                {
                    "id": o.id,
                    "text": o.text,
                    "votes": o.votes,
                    "pct": round(o.votes / total_votes * 100) if total_votes > 0 else 0
                }
                for o in p.options
            ],
        })
    return out


@router.post("/{group_type}/{group_id}/polls/{poll_id}/vote")
async def vote_poll(
    group_type: GroupType,
    group_id: int,
    poll_id: str,
    req: VotePollReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _verify_membership(group_type, group_id, current_user.id, db)

    # Check already voted
    existing = await db.execute(
        select(GroupPollVote).where(GroupPollVote.poll_id == poll_id, GroupPollVote.user_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Already voted")

    # Validate option
    opt_res = await db.execute(
        select(PollOption).where(PollOption.id == req.option_id, PollOption.poll_id == poll_id)
    )
    option = opt_res.scalar_one_or_none()
    if not option:
        raise HTTPException(status_code=404, detail="Option not found")

    option.votes += 1
    db.add(GroupPollVote(poll_id=poll_id, user_id=current_user.id, selected_option=req.option_id))
    await db.commit()
    return {"message": "Vote recorded"}


# ─────────────────────────────────────────────────────────────────────────────
# Chat
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{group_type}/{group_id}/messages")
async def get_messages(
    group_type: GroupType,
    group_id: int,
    limit: int = Query(50, le=200),
    before: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _verify_membership(group_type, group_id, current_user.id, db)

    q = (
        select(GroupMessage, User.full_name, User.avatar_url)
        .join(User, User.id == GroupMessage.sender_id)
        .where(GroupMessage.group_id == group_id, GroupMessage.group_type == group_type)
    )
    if before:
        try:
            cursor = datetime.fromisoformat(before)
            q = q.where(GroupMessage.created_at < cursor)
        except ValueError:
            pass
    q = q.order_by(GroupMessage.created_at.desc()).limit(limit)

    res = await db.execute(q)
    rows = res.all()

    return [
        {
            "id": msg.id,
            "sender_id": msg.sender_id,
            "sender_name": full_name,
            "avatar_url": avatar_url,
            "message": msg.message,
            "message_type": msg.message_type.value,
            "created_at": msg.created_at.isoformat(),
            "is_mine": msg.sender_id == current_user.id,
        }
        for msg, full_name, avatar_url in reversed(rows)
    ]


@router.post("/{group_type}/{group_id}/messages")
async def send_message_rest(
    group_type: GroupType,
    group_id: int,
    req: SendMessageReq,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _verify_membership(group_type, group_id, current_user.id, db)
    msg = GroupMessage(
        group_id=group_id,
        group_type=group_type,
        sender_id=current_user.id,
        message=req.message.strip(),
        message_type=MessageType.text,
    )
    db.add(msg)
    await db.commit()
    return {"id": msg.id, "created_at": msg.created_at.isoformat()}


# ─────────────────────────────────────────────────────────────────────────────
# Activity
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{group_type}/{group_id}/activity")
async def get_activity(
    group_type: GroupType,
    group_id: int,
    limit: int = Query(30, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _verify_membership(group_type, group_id, current_user.id, db)
    res = await db.execute(
        select(GroupActivity, User.full_name)
        .outerjoin(User, User.id == GroupActivity.user_id)
        .where(GroupActivity.group_id == group_id, GroupActivity.group_type == group_type)
        .order_by(GroupActivity.created_at.desc())
        .limit(limit)
    )
    rows = res.all()
    return [
        {
            "id": a.id,
            "action_type": a.action_type.value,
            "user_name": full_name,
            "meta": a.meta,
            "created_at": a.created_at.isoformat(),
        }
        for a, full_name in rows
    ]


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket
# ─────────────────────────────────────────────────────────────────────────────

# (group_type, group_id) -> set of connected WebSockets
_connections: dict[tuple[GroupType, int], set[WebSocket]] = {}

@router.websocket("/ws/{group_type}/{group_id}/chat")
async def websocket_chat(
    websocket: WebSocket,
    group_type: GroupType,
    group_id: int,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    from services.auth_service import verify_token_payload
    try:
        payload = verify_token_payload(token)
        email = payload.get("sub")
        res = await db.execute(select(User).where(User.email == email))
        user = res.scalar_one_or_none()
        if not user:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    # Check membership
    try:
        await _verify_membership(group_type, group_id, user.id, db)
    except HTTPException:
        await websocket.close(code=4003)
        return

    await websocket.accept()
    room_key = (group_type, group_id)
    _connections.setdefault(room_key, set()).add(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            raw_msg = str(payload.get("message", "")).strip()
            if not raw_msg:
                continue

            msg = GroupMessage(
                group_id=group_id,
                group_type=group_type,
                sender_id=user.id,
                message=raw_msg,
            )
            db.add(msg)
            await db.commit()

            broadcast = json.dumps({
                "type": "message",
                "id": msg.id,
                "sender_id": user.id,
                "sender_name": user.full_name,
                "avatar_url": user.avatar_url,
                "message": raw_msg,
                "created_at": msg.created_at.isoformat(),
            })
            for ws in list(_connections[room_key]):
                try:
                    await ws.send_text(broadcast)
                except Exception:
                    _connections[room_key].discard(ws)

    except WebSocketDisconnect:
        _connections.get(room_key, set()).discard(websocket)
