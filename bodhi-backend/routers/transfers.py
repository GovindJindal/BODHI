"""
routers/transfers.py
Peer-to-peer money transfers, QR code payments, and payment requests.
"""
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse, parse_qs

import razorpay
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.core import Ledger, LedgerEntryType, LedgerReferenceType, Payment, PaymentStatus, User
from services.auth_service import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/transfers", tags=["transfers"])

_RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
_RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
_rz_client = razorpay.Client(auth=(_RAZORPAY_KEY_ID, _RAZORPAY_KEY_SECRET))


# ─── Schemas ─────────────────────────────────────────────────────────────────

class P2PTransferRequest(BaseModel):
    recipient_identifier: str
    amount: float
    note: Optional[str] = None

class P2PTransferResponse(BaseModel):
    success: bool
    message: str
    transaction_id: str
    sender_balance: float
    recipient_name: str

class PaymentRequestCreate(BaseModel):
    requester_identifier: str
    amount: float
    note: Optional[str] = None

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
    description: Optional[str] = "BODHI Top-up"

class RazorpayOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str

class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    amount: float

class QRPayRequest(BaseModel):
    qr_data: str
    amount: float
    note: Optional[str] = None

class PaymentRequestFulfillRequest(BaseModel):
    request_id: str


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
            select(User).where(User.email == raw.lower())
        )
        user = result.scalar_one_or_none()
        if user:
            return user

    # 2. Phone number — normalize and compare last 10 digits
    normalized_input = _normalize_phone(raw)
    if len(normalized_input) >= 8:
        result = await db.execute(select(User).where(User.phone.isnot(None)))
        all_users = result.scalars().all()
        for u in all_users:
            if u.phone and _normalize_phone(u.phone) == normalized_input:
                return u

    # 3. UPI ID (user@bank — no dot after @, so not a real email)
    if "@" in raw and "." not in raw.split("@")[-1]:
        upi_prefix = raw.split("@")[0].strip().lower()
        # Could be a phone like "9876543210@paytm"
        norm = _normalize_phone(upi_prefix)
        if len(norm) >= 8:
            result = await db.execute(select(User).where(User.phone.isnot(None)))
            all_users = result.scalars().all()
            for u in all_users:
                if u.phone and _normalize_phone(u.phone) == norm:
                    return u
        # Could be an email username like "johndoe@okaxis"
        result = await db.execute(
            select(User).where(User.email.like(f"{upi_prefix}@%"))
        )
        user = result.scalar_one_or_none()
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


# ─── Debug: lookup without payment ───────────────────────────────────────────

@router.get("/debug/lookup")
async def debug_lookup(
    identifier: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parsed = _parse_qr_identifier(identifier)
    user = await _find_user_by_identifier(db, parsed)
    return {
        "input": identifier,
        "parsed": parsed,
        "normalized_phone": _normalize_phone(identifier),
        "found": user is not None,
        "user": {"name": user.full_name, "email": user.email, "phone": user.phone} if user else None,
    }


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/send", response_model=P2PTransferResponse)
async def send_money(
    body: P2PTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Transfer money to another BODHI user or an external user. Identifier can be email, phone, or UPI ID."""
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    if body.amount > current_user.balance:
        raise HTTPException(status_code=400, detail=f"Insufficient balance. Your balance: ₹{current_user.balance:.2f}")

    recipient = await _find_user_by_identifier(db, body.recipient_identifier)
    if recipient and recipient.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot send money to yourself.")

    txn_id = str(uuid.uuid4())
    amount_paise = int(body.amount * 100)

    result = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    sender = result.scalar_one()
    if sender.balance < body.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance.")

    sender.balance -= body.amount

    if recipient:
        result2 = await db.execute(select(User).where(User.id == recipient.id).with_for_update())
        recip = result2.scalar_one()
        recip.balance += body.amount

        _write_ledger(db, user_id=sender.id, entry_type=LedgerEntryType.DEBIT,
                      amount_paise=amount_paise, ref_id=txn_id,
                      description=f"Sent ₹{body.amount:.2f} to {recip.full_name}{f' — {body.note}' if body.note else ''}")
        _write_ledger(db, user_id=recip.id, entry_type=LedgerEntryType.CREDIT,
                      amount_paise=amount_paise, ref_id=f"{txn_id}_rcv",
                      description=f"Received ₹{body.amount:.2f} from {sender.full_name}{f' — {body.note}' if body.note else ''}")
        recipient_name = recip.full_name
    else:
        # External payment (user not on BODHI)
        _write_ledger(db, user_id=sender.id, entry_type=LedgerEntryType.DEBIT,
                      amount_paise=amount_paise, ref_id=txn_id,
                      description=f"Sent ₹{body.amount:.2f} to external user ({body.recipient_identifier}){f' — {body.note}' if body.note else ''}")
        recipient_name = str(body.recipient_identifier)

    await db.commit()
    await db.refresh(sender)

    return P2PTransferResponse(
        success=True,
        message=f"₹{body.amount:.2f} sent to {recipient_name} successfully!",
        transaction_id=txn_id,
        sender_balance=sender.balance,
        recipient_name=recipient_name,
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
    logger.info(f"QR pay: raw={body.qr_data!r} → parsed={parsed_identifier!r}")

    return await send_money(
        P2PTransferRequest(
            recipient_identifier=parsed_identifier,
            amount=body.amount,
            note=body.note,
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
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    target_user = await _find_user_by_identifier(db, body.requester_identifier)
    if target_user and target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot request money from yourself.")

    request_id = str(uuid.uuid4())
    amount_paise = int(body.amount * 100)
    
    if target_user:
        description = f"REQUEST_FROM:{target_user.id}|NOTE:{body.note or ''}"
    else:
        description = f"REQUEST_FROM_EXTERNAL:{body.requester_identifier}|NOTE:{body.note or ''}"

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

    pending = []
    for req in requests:
        requester_result = await db.execute(select(User).where(User.id == req.user_id))
        requester = requester_result.scalar_one_or_none()
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pay off a pending payment request directed at the current user."""
    result = await db.execute(select(Payment).where(Payment.id == request_id).with_for_update())
    req = result.scalar_one_or_none()

    if not req or not req.description or f"REQUEST_FROM:{current_user.id}" not in req.description:
        raise HTTPException(status_code=404, detail="Payment request not found.")
    if req.status != PaymentStatus.PENDING:
        raise HTTPException(status_code=400, detail="This request has already been fulfilled or cancelled.")

    amount_inr = req.amount / 100
    if current_user.balance < amount_inr:
        raise HTTPException(status_code=400, detail=f"Insufficient balance. You need ₹{amount_inr:.2f}.")

    requester_result = await db.execute(select(User).where(User.id == req.user_id).with_for_update())
    requester = requester_result.scalar_one_or_none()
    if not requester:
        raise HTTPException(status_code=404, detail="Requester not found.")

    payer_result = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    payer = payer_result.scalar_one()

    payer.balance -= amount_inr
    requester.balance += amount_inr
    req.status = PaymentStatus.SUCCESS
    req.amount_paid = req.amount

    txn_id = str(uuid.uuid4())
    _write_ledger(db, user_id=payer.id, entry_type=LedgerEntryType.DEBIT,
                  amount_paise=req.amount, ref_id=txn_id,
                  description=f"Paid request ₹{amount_inr:.2f} to {requester.full_name}")
    _write_ledger(db, user_id=requester.id, entry_type=LedgerEntryType.CREDIT,
                  amount_paise=req.amount, ref_id=f"{txn_id}_rcv",
                  description=f"Received ₹{amount_inr:.2f} from {payer.full_name} (request fulfilled)")

    await db.commit()

    return {"success": True, "message": f"₹{amount_inr:.2f} sent to {requester.full_name}"}


@router.post("/razorpay/create-order", response_model=RazorpayOrderResponse)
async def create_razorpay_order(
    body: RazorpayOrderRequest,
    current_user: User = Depends(get_current_user),
):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    amount_paise = int(body.amount * 100)
    try:
        order = _rz_client.order.create({
            "amount": amount_paise,
            "currency": body.currency,
            "payment_capture": 1,
            "notes": {"user_id": current_user.id, "description": body.description},
        })
    except Exception as exc:
        logger.exception("Razorpay order creation failed")
        raise HTTPException(status_code=502, detail="Payment gateway error. Please try again.") from exc

    return RazorpayOrderResponse(
        order_id=order["id"],
        amount=amount_paise,
        currency=body.currency,
        key_id=_RAZORPAY_KEY_ID,
    )


@router.post("/razorpay/verify-and-credit")
async def verify_and_credit_wallet(
    body: RazorpayVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import hmac as _hmac
    import hashlib as _hashlib

    expected_sig = _hmac.new(
        _RAZORPAY_KEY_SECRET.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        _hashlib.sha256,
    ).hexdigest()

    if not _hmac.compare_digest(expected_sig, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature. Payment not credited.")

    amount_paise = int(body.amount * 100)
    result = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    user = result.scalar_one()
    user.balance += body.amount

    txn_id = str(uuid.uuid4())
    _write_ledger(db, user_id=user.id, entry_type=LedgerEntryType.CREDIT,
                  amount_paise=amount_paise, ref_id=txn_id,
                  description=f"Wallet top-up via Razorpay {body.razorpay_payment_id}")

    await db.commit()
    await db.refresh(user)

    return {"success": True, "new_balance": user.balance, "message": f"₹{body.amount:.2f} added to your BODHI Wallet!"}


@router.get("/balance")
async def get_balance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    return {"balance": user.balance, "email": user.email, "full_name": user.full_name}
