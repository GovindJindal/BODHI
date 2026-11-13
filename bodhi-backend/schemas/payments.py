from __future__ import annotations
from datetime import datetime
from typing import Annotated, Any
from pydantic import BaseModel, ConfigDict, Field, field_validator
from models.core import LedgerEntryType, LedgerReferenceType, PaymentStatus

_ORM_CONFIG = ConfigDict(from_attributes=True, populate_by_name=True)

PositivePaise = Annotated[int, Field(gt=0, description="Amount in paise (1 INR = 100 paise)")]
Currency = Annotated[str, Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")]

class LedgerEntryRead(BaseModel):
    model_config = _ORM_CONFIG
    id: str
    user_id: str
    entry_type: LedgerEntryType
    amount: PositivePaise
    currency: Currency
    reference_type: LedgerReferenceType
    reference_id: str
    status: PaymentStatus
    description: str | None
    created_at: datetime

class BalanceSummary(BaseModel):
    user_id: str
    currency: str
    total_credits: int = Field(ge=0)
    total_debits: int = Field(ge=0)
    net_balance: int 

class PaymentIntentCreate(BaseModel):
    user_id: str | int | None = Field(default=None, description="Ignored – the logged-in user is always used")
    amount: PositivePaise = Field(description="Amount in paise")
    currency: Currency = Field(default="INR")
    description: str | None = Field(default=None, max_length=512)
    metadata: dict[str, Any] | None = Field(default=None)

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, v: str) -> str:
        return v.upper()

class PaymentIntentResponse(BaseModel):
    payment_id: str 
    razorpay_order_id: str
    amount: PositivePaise
    currency: Currency
    status: PaymentStatus
    key_id: str 

class PaymentRead(BaseModel):
    model_config = _ORM_CONFIG
    id: str
    user_id: str
    razorpay_order_id: str
    razorpay_payment_id: str | None
    amount: int
    amount_paid: int
    currency: str
    status: PaymentStatus
    description: str | None
    created_at: datetime
    updated_at: datetime

class RazorpayWebhookPayload(BaseModel):
    model_config = ConfigDict(extra="allow")
    event: str 
    payload: dict[str, Any]

    @field_validator("event")
    @classmethod
    def event_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("event field must not be blank")
        return v

class WebhookAck(BaseModel):
    status: str = "ok"
    message: str = "processed"

class ErrorDetail(BaseModel):
    code: str
    message: str
    field: str | None = None

class ErrorResponse(BaseModel):
    errors: list[ErrorDetail]