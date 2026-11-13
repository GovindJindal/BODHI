from __future__ import annotations
from datetime import datetime
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from models.wallets import GroupWalletStatus, MemberRole, ProposalStatus
from models.social import TripStatus as TripWalletStatus

_ORM = ConfigDict(from_attributes=True, populate_by_name=True)
PositivePaise = Annotated[int, Field(gt=0, description="Amount in paise")]
NonNegPaise = Annotated[int, Field(ge=0, description="Amount in paise (≥ 0)")]
Currency = Annotated[str, Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")]

class GroupWalletCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    currency: Currency = "INR"
    target_amount: NonNegPaise = Field(default=0, description="0 = no hard cap")
    created_by: int  # UPDATED to int

    @field_validator("currency")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.upper()

class GroupWalletRead(BaseModel):
    model_config = _ORM
    id: str
    name: str
    description: str | None
    currency: str
    status: GroupWalletStatus
    target_amount: int
    total_contributed: int
    created_by: int # UPDATED
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None

class GroupWalletStatusUpdate(BaseModel):
    status: GroupWalletStatus

class GroupJoinRequest(BaseModel):
    user_id: int  # UPDATED
    role: MemberRole = MemberRole.MEMBER

class GroupMemberRead(BaseModel):
    model_config = _ORM
    id: str
    group_id: str
    user_id: int # UPDATED
    role: MemberRole
    contributed_amount: int
    ownership_bps: int
    joined_at: datetime
    updated_at: datetime

class GroupContributeRequest(BaseModel):
    user_id: int # UPDATED
    amount: PositivePaise

    @model_validator(mode="after")
    def check_positive(self) -> "GroupContributeRequest":
        if self.amount <= 0:
            raise ValueError("amount must be positive paise")
        return self

class GroupContributeResponse(BaseModel):
    group_id: str
    user_id: int # UPDATED
    contributed_amount: int
    ownership_bps: int
    group_total: int
    ledger_entry_id: str

class ProposalCreate(BaseModel):
    proposed_by: int # UPDATED
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    amount: NonNegPaise = 0
    destination: str | None = Field(default=None, max_length=512)
    voting_deadline: datetime | None = None

class ProposalRead(BaseModel):
    model_config = _ORM
    id: str
    group_id: str
    proposed_by: int # UPDATED
    title: str
    description: str | None
    amount: int
    destination: str | None
    status: ProposalStatus
    votes_for: int
    votes_against: int
    voting_deadline: datetime | None
    created_at: datetime
    resolved_at: datetime | None

class TripWalletCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    currency: Currency = "INR"
    created_by: int # UPDATED

    @field_validator("currency")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.upper()

class TripWalletRead(BaseModel):
    model_config = _ORM
    id: str
    name: str
    description: str | None
    currency: str
    status: TripWalletStatus
    total_contributed: int
    total_expenses: int
    remaining_balance: int
    created_by: int # UPDATED
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None

class TripWalletActivate(BaseModel):
    requested_by: int # UPDATED

class TripJoinRequest(BaseModel):
    user_id: int # UPDATED
    role: MemberRole = MemberRole.MEMBER

class TripMemberRead(BaseModel):
    model_config = _ORM
    id: str
    trip_id: str
    user_id: int # UPDATED
    role: MemberRole
    contributed_amount: int
    refunded_amount: int
    joined_at: datetime
    updated_at: datetime

class TripContributeRequest(BaseModel):
    user_id: int # UPDATED
    amount: PositivePaise

class TripContributeResponse(BaseModel):
    trip_id: str
    user_id: int # UPDATED
    contributed_amount: int
    trip_total: int
    ledger_entry_id: str

class TripExpenseCreate(BaseModel):
    recorded_by: int # UPDATED
    amount: PositivePaise
    description: str = Field(min_length=1, max_length=512)
    category: str | None = Field(default=None, max_length=64)

class TripExpenseRead(BaseModel):
    model_config = _ORM
    id: str
    trip_id: str
    recorded_by: int # UPDATED
    amount: int
    currency: str
    description: str
    category: str | None
    created_at: datetime

class MemberRefundDetail(BaseModel):
    user_id: int # UPDATED
    contributed_amount: int
    refund_amount: int
    ownership_bps: int

class TripCloseResponse(BaseModel):
    trip_id: str
    status: TripWalletStatus
    total_contributed: int
    total_expenses: int
    remaining_balance: int
    refunds: list[MemberRefundDetail]
    closed_at: datetime

# Rebuild to resolve any forward references (required with `from __future__ import annotations`)
TripWalletRead.model_rebuild()
TripCloseResponse.model_rebuild()