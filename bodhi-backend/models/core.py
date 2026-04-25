"""
/app/models/core.py
ORM models: User, Ledger, Payment.
All monetary values are stored as integers in the smallest currency unit (paise/cents).
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    Column
)

from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    PARTIAL = "PARTIAL"


class LedgerReferenceType(str, enum.Enum):
    PAYMENT = "PAYMENT"
    REFUND = "REFUND"
    ADJUSTMENT = "ADJUSTMENT"
    FEE = "FEE"


class LedgerEntryType(str, enum.Enum):
    CREDIT = "CREDIT"
    DEBIT = "DEBIT"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
import enum
from sqlalchemy import String, Boolean, DateTime, CheckConstraint, Enum, UniqueConstraint, Text
# Keep your existing imports for Mapped, mapped_column, relationship, _new_uuid, _utcnow, etc.

class AuthProvider(str, enum.Enum):
    local = "local"
    google = "google"
    apple = "apple"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    email: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    phone: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    admin_hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True) # Password exclusively for admin panel
    
    # 🟢 --- NEW OAUTH COLUMNS START --- 🟢
    auth_provider: Mapped[AuthProvider] = mapped_column(
        Enum(AuthProvider, name="auth_provider_enum"), 
        nullable=False, 
        default=AuthProvider.local, 
        index=True
    )
    provider_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    m_pin: Mapped[str | None] = mapped_column(String(255), nullable=True) # Account Password / PIN
    u_pin: Mapped[str | None] = mapped_column(String(255), nullable=True) # Transaction PIN
    is_mpin_set: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # 🟢 --- NEW OAUTH COLUMNS END --- 🟢

    balance: Mapped[float] = mapped_column(Float, nullable=False, default=100000.0)

    paper_balance = Column(Float, default=100000.0, nullable=False)
    verify_pass = Column(String, nullable=True) # Secret verification token

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="user")

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    ledger_entries: Mapped[list["Ledger"]] = relationship(
        "Ledger", back_populates="user", lazy="noload"
    )
    payments: Mapped[list["Payment"]] = relationship(
        "Payment", back_populates="user", lazy="noload"
    )

    __table_args__ = (
        CheckConstraint("length(email) >= 3", name="ck_users_email_min_len"),
        # 🟢 ADDED: Prevents a duplicate Google/Apple account from being made
        UniqueConstraint("auth_provider", "provider_id", name="uq_users_provider_provider_id"),
    )

    reset_otp = Column(String(6), nullable=True, default=None)
    reset_otp_expiry = Column(DateTime(timezone=True), nullable=True, default=None)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User id={self.id} email={self.email} role={self.role}>"

# ---------------------------------------------------------------------------
# Ledger  (immutable source-of-truth for all money movement)
# ---------------------------------------------------------------------------
class Ledger(Base):
    """
    Central, append-only ledger.

    Rules enforced here:
    - amount MUST be a positive integer (paise/cents) — direction encoded in entry_type.
    - Records are NEVER updated after creation (application-level convention;
      DB CHECK prevents amount ≤ 0).
    - Balances are derived by summing ledger rows, never stored directly.
    """

    __tablename__ = "ledger"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Direction: CREDIT (money in) or DEBIT (money out)
    entry_type: Mapped[LedgerEntryType] = mapped_column(
        SAEnum(LedgerEntryType, name="ledger_entry_type_enum"),
        nullable=False,
    )

    # Always a positive integer in smallest unit (paise, cents …)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)

    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR"
    )  # ISO 4217

    # What triggered this entry
    reference_type: Mapped[LedgerReferenceType] = mapped_column(
        SAEnum(LedgerReferenceType, name="ledger_ref_type_enum"),
        nullable=False,
    )
    reference_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )  # FK to Payment.id etc.

    status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status_enum"),
        nullable=False,
        default=PaymentStatus.PENDING,
    )

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="ledger_entries")

    __table_args__ = (
        # Prevent zero / negative amounts at the DB layer
        CheckConstraint("amount > 0", name="ck_ledger_amount_positive"),
        # One ledger entry per (reference_type, reference_id, entry_type) → prevents double-credit
        UniqueConstraint(
            "reference_type",
            "reference_id",
            "entry_type",
            name="uq_ledger_ref_entry_type",
        ),
        Index("ix_ledger_user_created", "user_id", "created_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<Ledger id={self.id} user={self.user_id} "
            f"{self.entry_type.value} {self.amount} {self.currency}>"
        )


# ---------------------------------------------------------------------------
# Payment  (Razorpay order / intent state machine)
# ---------------------------------------------------------------------------
class Payment(Base):
    """
    Tracks the lifecycle of a Razorpay payment order.

    Idempotency key is stored here; webhook handler checks this before
    creating any ledger entry.
    """

    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Razorpay identifiers
    razorpay_order_id: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    razorpay_payment_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, unique=True
    )

    # Money — always in paise (₹1 = 100 paise)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    amount_paid: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")

    status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status_enum"),
        nullable=False,
        default=PaymentStatus.PENDING,
    )

    # Idempotency: SHA-256 of the webhook payload stored after first processing
    webhook_idempotency_key: Mapped[str | None] = mapped_column(
        String(64), nullable=True, unique=True
    )

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="payments")

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
        CheckConstraint("amount_paid >= 0", name="ck_payments_amount_paid_non_negative"),
        CheckConstraint(
            "amount_paid <= amount", name="ck_payments_amount_paid_lte_amount"
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<Payment id={self.id} order={self.razorpay_order_id} "
            f"status={self.status.value}>"
        )

# ---------------------------------------------------------------------------
# Vault / Subscriptions
# ---------------------------------------------------------------------------
class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"
    PAUSED = "PAUSED"

class UserSubscription(Base):
    """
    Tracks recurring subscriptions for a user in their Vault.
    """
    __tablename__ = "user_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    platform_id: Mapped[str] = mapped_column(String(64), nullable=False)
    platform_name: Mapped[str] = mapped_column(String(128), nullable=False)
    expected_monthly_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    
    status: Mapped[SubscriptionStatus] = mapped_column(
        SAEnum(SubscriptionStatus, name="subscription_status_enum"),
        nullable=False,
        default=SubscriptionStatus.ACTIVE,
    )
    
    next_billing_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<UserSubscription id={self.id} user={self.user_id} platform={self.platform_id}>"
