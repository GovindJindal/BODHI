"""
routers/transfers.py
Peer-to-peer money transfers, QR code payments, and payment requests.
"""
import hashlib
import hmac
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse, parse_qs

from fastapi.concurrency import run_in_threadpool

import razorpay
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.core import Ledger, LedgerEntryType, LedgerReferenceType, Payment, PaymentStatus, User
from services.auth_service import get_current_user, verify_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/transfers", tags=["transfers"])

from core.config import settings

_RAZORPAY_KEY_ID = settings.razorpay_key_id
_RAZORPAY_KEY_SECRET = settings.razorpay_key_secret
_rz_client = razorpay.Client(auth=(_RAZORPAY_KEY_ID, _RAZORPAY_KEY_SECRET))


# ─── Schemas ─────────────────────────────────────────────────────────────────

MAX_TRANSFER_INR = 500_000.0


def _validate_amount(v: float) -> float:
    v = round(float(v), 2)
    if v <= 0:
        raise ValueError("Amount must be greater than 0")
    if v > MAX_TRANSFER_INR:
        raise ValueError(f"Amount cannot exceed ₹{MAX_TRANSFER_INR:,.0f} per transaction")
    return v


def _to_paise(amount_inr: float) -> int:
    return int(round(amount_inr * 100))


class P2PTransferRequest(BaseModel):
    recipient_identifier: str = Field(..., min_length=1, max_length=255)
    amount: float
    note: Optional[str] = Field(default=None, max_length=200)
    # When supplied, the transaction PIN is enforced server-side as well.
    u_pin: Optional[str] = None

    _amount = field_validator("amount")(_validate_amount)

class P2PTransferResponse(BaseModel):
    success: bool
    message: str
    transaction_id: str
    sender_balance: float
    recipient_name: str

class PaymentRequestCreate(BaseModel):
    requester_identifier: str = Field(..., min_length=1, max_length=255)
    amount: float
    note: Optional[str] = Field(default=None, max_length=200)

    _amount = field_validator("amount")(_validate_amount)

class PaymentRequestResponse(BaseModel):
    request_id: str
    requester_name: str
    amount: float
    note: Optional[str]
    status: str
    created_at: str

class RazorpayOrderRequest(BaseModel):
    amount: float
    currency: str = "INR"
    description: Optional[str] = Field(default="BODHI Top-up", max_length=200)

    _amount = field_validator("amount")(_validate_amount)

class RazorpayOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str

class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    amount: Optional[float] = None  # informational only – the stored order amount is credited

class QRPayRequest(BaseModel):
    qr_data: str = Field(..., min_length=1, max_length=1000)
    amount: float
    note: Optional[str] = Field(default=None, max_length=200)
    u_pin: Optional[str] = None

    _amount = field_validator("amount")(_validate_amount)

class PaymentRequestFulfillRequest(BaseModel):
    u_pin: Optional[str] = None


async def _lock_users(db: AsyncSession, *user_ids: str) -> dict[str, User]:
    """SELECT … FOR UPDATE the given users in a deterministic order (no deadlocks).

    `populate_existing` matters: the current user is already in the session's
    identity map (loaded by auth), and without it SQLAlchemy would hand back the
    stale, pre-lock balance – enabling double-spends and lost updates.
    """
    locked: dict[str, User] = {}
    for uid in sorted(set(user_ids)):
        result = await db.execute(
            select(User).where(User.id == uid).with_for_update().execution_options(populate_existing=True)
        )
        user = result.scalar_one_or_none()
        if user is not None:
            locked[uid] = user
    return locked


def _check_upin(user: User, u_pin: Optional[str]) -> None:
    if u_pin is None or not user.u_pin:
        return
    if not verify_password(u_pin.strip(), user.u_pin):
        raise HTTPException(status_code=403, detail="Incorrect U-PIN.")


# ─── Phone normalization ──────────────────────────────────────────────────────

def _normalize_phone(raw: str) -> str:
    """
    Strip all non-digit characters and return the last 10 digits.
    Handles: +91-9876543210, +91 9876543210, 09876543210, 919876543210, 9876543210
    """
    digits = re.sub(r'\D', '', raw)
    if len(digits) >= 10:
        return digits[-10:]
    return digits


def _parse_qr_identifier(qr_data: str) -> str:
    """
    Parse a QR code into a usable identifier.
    UPI QR: upi://pay?pa=user@bank&pn=Name  →  extracts 'pa' param
    Everything else returned as-is.
    """
    qr_data = qr_data.strip()
    if qr_data.lower().startswith("upi://"):
        try:
            parsed = urlparse(qr_data)
            params = parse_qs(parsed.query)
            pa_list = params.get("pa") or params.get("PA") or []
            if pa_list:
                return pa_list[0].strip()
        except Exception:
            pass
    return qr_data


# ─── User lookup ──────────────────────────────────────────────────────────────

async def _find_user_by_identifier(db: AsyncSession, identifier: str) -> Optional[User]:
    """
    Find a BODHI user by email, phone number (any format), or UPI ID.
    """
    if not identifier:
        return None

    raw = identifier.strip()

    # 1. Proper email (has @ and a dot in the domain part)
    if "@" in raw and "." in raw.split("@")[-1]:
        result = await db.execute(
            select(User).where(func.lower(User.email) == raw.lower(), User.deleted_at.is_(None))
        )
        user = result.scalar_one_or_none()
        if user:
            return user

    # 2. Phone number — normalize and compare last 10 digits
    normalized_input = _normalize_phone(raw)
    if len(normalized_input) >= 8:
        # Instead of pulling all users, use a LIKE query for the normalized digits.
        # This prevents an O(N) memory leak on large datasets.
        result = await db.execute(
            select(User).where(User.phone.like(f"%{normalized_input}"))
        )
        user = result.scalars().first()
        if user:
            return user

    # 3. UPI ID (user@bank — no dot after @, so not a real email)
    if "@" in raw and "." not in raw.split("@")[-1]:
        upi_prefix = raw.split("@")[0].strip().lower()
        # Could be a phone like "9876543210@paytm"
        norm = _normalize_phone(upi_prefix)
        if len(norm) >= 8:
            result = await db.execute(
                select(User).where(User.phone.like(f"%{norm}"))
            )
            user = result.scalars().first()
            if user:
                return user
        # Could be an email username like "johndoe@okaxis"
        result = await db.execute(
            select(User).where(User.email.like(f"{upi_prefix}@%"))
        )
        user = result.scalars().first()
        if user:
            return user

    # 4. GAP ID (username.{domain_initial}.gap)
    if raw.lower().endswith(".gap"):
        # Parse: "harshit.g.gap" → username="harshit", domain_initial="g"
        gap_str = raw.lower()[:-4]  # strip ".gap"
        dot_pos = gap_str.rfind(".")
        if dot_pos > 0:
            username_part = gap_str[:dot_pos]
            domain_initial = gap_str[dot_pos + 1:]
            # Search for user whose email = username@{domain starting with domain_initial}
            result = await db.execute(
                select(User).where(
                    User.email.like(f"{username_part}@{domain_initial}%")
                )
            )
            user = result.scalars().first()
            if user:
                return user

    return None


# ─── Ledger helper ────────────────────────────────────────────────────────────

def _write_ledger(db: AsyncSession, *, user_id: str, entry_type: LedgerEntryType,
                  amount_paise: int, ref_id: str, description: str) -> None:
    entry = Ledger(
        user_id=user_id,
        entry_type=entry_type,
        amount=amount_paise,
        currency="INR",
        reference_type=LedgerReferenceType.PAYMENT,
        reference_id=ref_id,
        status=PaymentStatus.SUCCESS,
        description=description,
    )
    db.add(entry)


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/send", response_model=P2PTransferResponse)
async def send_money(
    body: P2PTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Transfer money to another BODHI user. Identifier can be email, phone, UPI ID or GAP ID."""
    recipient = await _find_user_by_identifier(db, body.recipient_identifier)
    if recipient is None or recipient.deleted_at is not None or not recipient.is_active:
        raise HTTPException(status_code=404, detail="No active BODHI user found for that email, phone or UPI ID.")
    if recipient.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot send money to yourself.")

    _check_upin(current_user, body.u_pin)

    locked = await _lock_users(db, current_user.id, recipient.id)
    sender, recip = locked[current_user.id], locked.get(recipient.id)
    if recip is None:
        raise HTTPException(status_code=404, detail="Recipient not found.")
    if sender.balance + 1e-9 < body.amount:
        raise HTTPException(status_code=400, detail=f"Insufficient balance. Your balance: ₹{sender.balance:,.2f}")

    txn_id = str(uuid.uuid4())
    amount_paise = _to_paise(body.amount)
    note = f" — {body.note.strip()}" if body.note and body.note.strip() else ""

    sender.balance = round(sender.balance - body.amount, 2)
    recip.balance = round(recip.balance + body.amount, 2)
    _write_ledger(db, user_id=sender.id, entry_type=LedgerEntryType.DEBIT,
                  amount_paise=amount_paise, ref_id=txn_id,
                  description=f"Sent ₹{body.amount:,.2f} to {recip.full_name}{note}")
    _write_ledger(db, user_id=recip.id, entry_type=LedgerEntryType.CREDIT,
                  amount_paise=amount_paise, ref_id=txn_id,
                  description=f"Received ₹{body.amount:,.2f} from {sender.full_name}{note}")
    await db.commit()

    return P2PTransferResponse(
        success=True,
        message=f"₹{body.amount:,.2f} sent to {recip.full_name} successfully!",
        transaction_id=txn_id,
        sender_balance=sender.balance,
        recipient_name=recip.full_name,
    )


@router.post("/qr-pay", response_model=P2PTransferResponse)
async def qr_pay(
    body: QRPayRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pay via scanned QR code. Handles full UPI QR URLs automatically."""
    # Parse out the actual identifier from the QR (handles upi://pay?pa=... format)
    parsed_identifier = _parse_qr_identifier(body.qr_data)

    return await send_money(
        P2PTransferRequest(
            recipient_identifier=parsed_identifier,
            amount=body.amount,
            note=body.note,
            u_pin=body.u_pin,
        ),
        db=db,
        current_user=current_user,
    )


@router.post("/request", response_model=PaymentRequestResponse)
async def create_payment_request(
    body: PaymentRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a payment request directed at another user or an external identifier."""
    target_user = await _find_user_by_identifier(db, body.requester_identifier)
    if target_user is None or target_user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="No BODHI user found for that email, phone or UPI ID.")
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot request money from yourself.")

    request_id = str(uuid.uuid4())
    amount_paise = _to_paise(body.amount)
    description = f"REQUEST_FROM:{target_user.id}|NOTE:{(body.note or '').replace('|', ' ')}"

    payment_req = Payment(
        id=request_id,
        user_id=current_user.id,
        razorpay_order_id=f"REQ_{request_id[:20]}",
        amount=amount_paise,
        amount_paid=0,
        currency="INR",
        status=PaymentStatus.PENDING,
        description=description,
    )
    db.add(payment_req)
    await db.commit()

    return PaymentRequestResponse(
        request_id=request_id,
        requester_name=current_user.full_name,
        amount=body.amount,
        note=body.note,
        status="PENDING",
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/requests/pending")
async def get_pending_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all pending payment requests where the current user is the payer."""
    result = await db.execute(
        select(Payment).where(
            and_(
                Payment.status == PaymentStatus.PENDING,
                Payment.razorpay_order_id.like("REQ_%"),
                Payment.description.like(f"%REQUEST_FROM:{current_user.id}%"),
            )
        )
    )
    requests = result.scalars().all()
    requester_ids = {r.user_id for r in requests}
    requesters: dict[str, User] = {}
    if requester_ids:
        rows = await db.execute(select(User).where(User.id.in_(requester_ids)))
        requesters = {u.id: u for u in rows.scalars()}

    pending = []
    for req in requests:
        requester = requesters.get(req.user_id)
        note = ""
        if req.description and "NOTE:" in req.description:
            note = req.description.split("NOTE:")[-1]
        pending.append({
            "request_id": req.id,
            "requester_name": requester.full_name if requester else "Unknown",
            "requester_email": requester.email if requester else "",
            "amount": req.amount / 100,
            "note": note,
            "created_at": req.created_at.isoformat(),
        })

    return {"requests": pending}


@router.post("/requests/{request_id}/fulfill")
async def fulfill_payment_request(
    request_id: str,
    body: Optional[PaymentRequestFulfillRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pay off a pending payment request directed at the current user."""
    _check_upin(current_user, body.u_pin if body else None)
    result = await db.execute(
        select(Payment).where(Payment.id == request_id).with_for_update().execution_options(populate_existing=True)
    )
    req = result.scalar_one_or_none()

    if not req or not req.description or f"REQUEST_FROM:{current_user.id}" not in req.description:
        raise HTTPException(status_code=404, detail="Payment request not found.")
    if req.status != PaymentStatus.PENDING:
        raise HTTPException(status_code=400, detail="This request has already been fulfilled or cancelled.")

    amount_inr = req.amount / 100

    locked = await _lock_users(db, req.user_id, current_user.id)
    payer, requester = locked[current_user.id], locked.get(req.user_id)

    if not requester:
        raise HTTPException(status_code=404, detail="Requester not found.")

    if payer.balance < amount_inr:
        raise HTTPException(status_code=400, detail=f"Insufficient balance. You need ₹{amount_inr:.2f}.")

    payer.balance = round(payer.balance - amount_inr, 2)
    requester.balance = round(requester.balance + amount_inr, 2)
    req.status = PaymentStatus.SUCCESS
    req.amount_paid = req.amount

    txn_id = str(uuid.uuid4())
    _write_ledger(db, user_id=payer.id, entry_type=LedgerEntryType.DEBIT,
                  amount_paise=req.amount, ref_id=txn_id,
                  description=f"Paid request ₹{amount_inr:.2f} to {requester.full_name}")
    _write_ledger(db, user_id=requester.id, entry_type=LedgerEntryType.CREDIT,
                  amount_paise=req.amount, ref_id=txn_id,
                  description=f"Received ₹{amount_inr:.2f} from {payer.full_name} (request fulfilled)")

    await db.commit()

    return {"success": True, "message": f"₹{amount_inr:.2f} sent to {requester.full_name}"}


@router.post("/razorpay/create-order", response_model=RazorpayOrderResponse)
async def create_razorpay_order(
    body: RazorpayOrderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    amount_paise = _to_paise(body.amount)
    currency = (body.currency or "INR").upper()
    try:
        order = await run_in_threadpool(_rz_client.order.create, {
            "amount": amount_paise,
            "currency": currency,
            "payment_capture": 1,
            "notes": {"user_id": current_user.id, "description": body.description or "BODHI Top-up"},
        })
    except Exception as exc:
        logger.exception("Razorpay order creation failed")
        raise HTTPException(status_code=502, detail="Payment gateway error. Please try again.") from exc

    # Persist the order so verify/webhook can settle it against the right user & amount.
    db.add(Payment(
        user_id=current_user.id,
        razorpay_order_id=order["id"],
        amount=amount_paise,
        amount_paid=0,
        currency=currency,
        status=PaymentStatus.PENDING,
        description=body.description or "BODHI Top-up",
    ))
    await db.commit()

    return RazorpayOrderResponse(
        order_id=order["id"],
        amount=amount_paise,
        currency=currency,
        key_id=_RAZORPAY_KEY_ID,
    )


@router.post("/razorpay/verify-and-credit")
async def verify_and_credit_wallet(
    body: RazorpayVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expected_sig = hmac.new(
        _RAZORPAY_KEY_SECRET.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_sig, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature. Payment not credited.")

    from services.payments_service import settle_payment, PaymentServiceError

    order = await db.scalar(select(Payment).where(Payment.razorpay_order_id == body.razorpay_order_id))
    if order is None or order.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Payment order not found.")

    try:
        payment = await settle_payment(
            db,
            razorpay_order_id=body.razorpay_order_id,
            razorpay_payment_id=body.razorpay_payment_id,
            amount_paid=order.amount - order.amount_paid,  # credit what was ordered, never the client's number
            currency=order.currency,
        )
        await db.commit()
    except PaymentServiceError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from None

    await db.refresh(current_user)
    credited = payment.amount / 100
    return {"success": True, "new_balance": current_user.balance, "message": f"₹{credited:,.2f} added to your BODHI Wallet!"}


@router.get("/balance")
async def get_balance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"balance": current_user.balance, "email": current_user.email, "full_name": current_user.full_name}


@router.get("/history")
async def get_transfer_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the user's full ledger (wallet credits & debits) in reverse chronological order."""
    result = await db.execute(
        select(Ledger)
        .where(Ledger.user_id == current_user.id)
        .order_by(Ledger.created_at.desc())
        .limit(100)
    )
    entries = result.scalars().all()

    return {
        "transactions": [
            {
                "id": e.id,
                "type": e.entry_type.value,
                "amount": e.amount / 100,  # paise → rupees
                "description": e.description or "",
                "status": e.status.value,
                "created_at": e.created_at.isoformat(),
            }
            for e in entries
        ]
    }
