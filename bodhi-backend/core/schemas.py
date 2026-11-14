"""
core/schemas.py
All Pydantic v2 request / response schemas for the Social Clubs API.
"""

from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from models.social import ClubType, InviteStatus, BetStatus


# ── Shared ────────────────────────────────────────────────────

class UserMini(BaseModel):
    id:       int
    username: str
    avatar:   Optional[str] = None   # emoji or URL

    class Config:
        from_attributes = True


# ── Club ─────────────────────────────────────────────────────

class ClubCreate(BaseModel):
    name:        str       = Field(..., min_length=2, max_length=120)
    description: str       = Field("", max_length=500)
    emoji:       str       = Field("🏦", max_length=8)
    club_type:   ClubType  = ClubType.SAVINGS
    goal_amount: float     = Field(0.0, ge=0)
    currency:    str       = Field("INR", max_length=4)
    is_public:   bool      = False
    deadline:    Optional[datetime] = None

    @field_validator("goal_amount")
    @classmethod
    def goal_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("goal_amount must be >= 0")
        return v


class ClubUpdate(BaseModel):
    name:        Optional[str]      = Field(None, min_length=2, max_length=120)
    description: Optional[str]      = Field(None, max_length=500)
    emoji:       Optional[str]      = None
    goal_amount: Optional[float]    = None
    deadline:    Optional[datetime] = None
    is_public:   Optional[bool]     = None


class ContributionOut(BaseModel):
    id:         int
    user_id:    int
    amount:     float
    note:       str
    status:     str
    created_at: datetime

    class Config:
        from_attributes = True


class CommentOut(BaseModel):
    id:         int
    user_id:    int
    username:   str
    body:       str
    created_at: datetime

    class Config:
        from_attributes = True


class ClubOut(BaseModel):
    id:             int
    name:           str
    description:    str
    emoji:          str
    club_type:      ClubType
    goal_amount:    float
    currency:       str
    is_public:      bool
    invite_code:    str
    deadline:       Optional[datetime]
    created_by:     int
    created_at:     datetime
    # Computed
    total_pooled:   float
    member_count:   int
    progress_pct:   float
    # Nested
    latest_comment: Optional[CommentOut] = None

    class Config:
        from_attributes = True


class ClubDetail(ClubOut):
    contributions:  list[ContributionOut] = []
    comments:       list[CommentOut]      = []
    venture_bets:   list["VentureBetOut"] = []

    class Config:
        from_attributes = True


# ── Contribution ─────────────────────────────────────────────

class ContributionCreate(BaseModel):
    club_id: int
    amount:  float = Field(..., gt=0, description="Amount in INR to contribute")
    note:    str   = Field("", max_length=300)


# ── Invitation ───────────────────────────────────────────────

class InviteCreate(BaseModel):
    club_id:        int
    invitee_email:  Optional[str] = None   # null = generate open link

class InviteAccept(BaseModel):
    token: str

class InvitationOut(BaseModel):
    id:            int
    club_id:       int
    club_name:     str
    club_emoji:    str
    invited_by:    int
    status:        InviteStatus
    token:         str
    expires_at:    datetime
    created_at:    datetime

    class Config:
        from_attributes = True


# ── Comment ──────────────────────────────────────────────────

class CommentCreate(BaseModel):
    club_id: int
    body:    str = Field(..., min_length=1, max_length=1000)


# ── Venture bet ──────────────────────────────────────────────

class VentureBetCreate(BaseModel):
    club_id:        int
    title:          str   = Field(..., min_length=2, max_length=200)
    description:    str   = Field("", max_length=2000)
    target_amount:  float = Field(0.0, ge=0)
    deadline:       Optional[datetime] = None


class BetPositionCreate(BaseModel):
    bet_id: int
    amount: float = Field(..., gt=0)
    note:   str   = Field("", max_length=300)


class BetPositionOut(BaseModel):
    id:         int
    user_id:    int
    amount:     float
    note:       str
    created_at: datetime

    class Config:
        from_attributes = True


class VentureBetOut(BaseModel):
    id:               int
    club_id:          int
    title:            str
    description:      str
    target_amount:    float
    total_committed:  float
    deadline:         Optional[datetime]
    status:           BetStatus
    outcome_note:     str
    created_by:       int
    created_at:       datetime
    positions:        list[BetPositionOut] = []

    class Config:
        from_attributes = True


# ── Social feed / dashboard ───────────────────────────────────

class SocialDashboard(BaseModel):
    my_clubs:           list[ClubOut]
    open_invitations:   list[InvitationOut]
    social_net_value:   float   # sum of all my contributions across all clubs
    total_clubs:        int
    total_contributed:  float
