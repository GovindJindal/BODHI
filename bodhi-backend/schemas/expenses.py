from __future__ import annotations
from datetime import datetime
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, model_validator
from models.expenses import DebtStatus, ExpenseStatus, SplitMethod

_ORM = ConfigDict(from_attributes=True, populate_by_name=True)

PositivePaise = Annotated[int, Field(gt=0)]
NonNegPaise = Annotated[int, Field(ge=0)]
Currency = Annotated[str, Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")]

class SplitParticipant(BaseModel):
    user_id: str
    exact_amount: NonNegPaise | None = None
    percentage_bps: Annotated[int | None, Field(ge=0, le=10_000)] = None

class ExpenseCreate(BaseModel):
    paid_by: str
    description: str = Field(min_length=1, max_length=512)
    category: str | None = Field(default=None, max_length=64)
    total_amount: PositivePaise
    currency: Currency = "INR"
    split_method: SplitMethod
    participants: list[SplitParticipant] = Field(min_length=2)

    group_id: str | None = None
    trip_id: str | None = None

    @model_validator(mode="after")
    def validate_split_inputs(self) -> "ExpenseCreate":
        method = self.split_method
        parts = self.participants

        if method == SplitMethod.EXACT:
            total = sum(p.exact_amount or 0 for p in parts)
            if total != self.total_amount:
                raise ValueError(
                    f"EXACT split amounts sum to {total} paise "
                    f"but expense total is {self.total_amount} paise"
                )

        elif method == SplitMethod.PERCENTAGE:
            total_bps = sum(p.percentage_bps or 0 for p in parts)
            if total_bps != 10_000:
                raise ValueError(
                    f"PERCENTAGE split basis points sum to {total_bps} "
                    f"but must equal 10000 (100 %)"
                )
        return self

class ExpenseSplitRead(BaseModel):
    model_config = _ORM
    id: str
    expense_id: str
    user_id: str
    owed_amount: int
    percentage_bps: int | None
    is_settled: bool
    created_at: datetime

class ExpenseRead(BaseModel):
    model_config = _ORM
    id: str
    paid_by: str
    group_id: str | None
    trip_id: str | None
    description: str
    category: str | None
    total_amount: int
    currency: str
    split_method: SplitMethod
    status: ExpenseStatus
    splits: list[ExpenseSplitRead] = []
    created_at: datetime
    updated_at: datetime

class DebtRead(BaseModel):
    model_config = _ORM
    id: str
    debtor_id: str
    creditor_id: str
    currency: str
    net_amount: int
    status: DebtStatus
    updated_at: datetime

class NetDebtGraph(BaseModel):
    debts: list[DebtRead]
    total_outstanding_paise: int

class SettlementCreate(BaseModel):
    debt_id: str
    paid_by: str
    paid_to: str
    amount: PositivePaise
    currency: Currency = "INR"
    note: str | None = Field(default=None, max_length=512)

class SettlementRead(BaseModel):
    model_config = _ORM
    id: str
    debt_id: str
    paid_by: str
    paid_to: str
    amount: int
    currency: str
    note: str | None
    created_at: datetime