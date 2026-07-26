import hashlib
import hmac
import json
import logging
import os
from typing import Any

import razorpay 
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Updated BODHI Imports
from models.core import Ledger, LedgerEntryType, LedgerReferenceType, Payment, PaymentStatus
from models.core import User
from schemas.payments import PaymentIntentCreate, PaymentIntentResponse, WebhookAck

logger = logging.getLogger(__name__)

_RAZORPAY_KEY_ID: str = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_CHANGEME")
_RAZORPAY_KEY_SECRET: str = os.environ.get("RAZORPAY_KEY_SECRET", "CHANGEME")
_RAZORPAY_WEBHOOK_SECRET: str = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "CHANGEME")
_rz_client = razorpay.Client(auth=(_RAZORPAY_KEY_ID, _RAZORPAY_KEY_SECRET))

class PaymentServiceError(Exception): pass
class UserNotFoundError(PaymentServiceError): pass
class DuplicateWebhookError(PaymentServiceError): pass
class InvalidSignatureError(PaymentServiceError): pass
class PaymentNotFoundError(PaymentServiceError): pass

def _compute_idempotency_key(raw_body: bytes) -> str:
    return hashlib.sha256(raw_body).hexdigest()

def _verify_razorpay_signature(raw_body: bytes, signature: str) -> None:
    expected = hmac.new(_RAZORPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise InvalidSignatureError("Razorpay signature mismatch")

async def _get_user_for_update(db: AsyncSession, user_id: int) -> User: # Changed to int
    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user = result.scalar_one_or_none()
    if user is None: raise UserNotFoundError(f"User {user_id} not found")
    return user

async def _get_payment_for_update(db: AsyncSession, razorpay_order_id: str) -> Payment:
    result = await db.execute(select(Payment).where(Payment.razorpay_order_id == razorpay_order_id).with_for_update())
    payment = result.scalar_one_or_none()
    if payment is None: raise PaymentNotFoundError(f"Payment not found for order {razorpay_order_id}")
    return payment

def _write_ledger_entry(db: AsyncSession, *, user_id: int, entry_type: LedgerEntryType, amount: int, currency: str, reference_type: LedgerReferenceType, reference_id: str, status: PaymentStatus, description: str | None = None) -> Ledger:
    entry = Ledger(user_id=user_id, entry_type=entry_type, amount=amount, currency=currency, reference_type=reference_type, reference_id=reference_id, status=status, description=description)
    db.add(entry)
    return entry

async def create_payment_intent(db: AsyncSession, payload: PaymentIntentCreate) -> PaymentIntentResponse:
    user_result = await db.execute(select(User).where(User.id == payload.user_id))
    user = user_result.scalar_one_or_none()
    if user is None: raise UserNotFoundError(f"User {payload.user_id} not found")

    try:
        rz_order: dict[str, Any] = _rz_client.order.create({"amount": payload.amount, "currency": payload.currency, "payment_capture": 1, "notes": payload.metadata or {}})
    except Exception as exc:
        logger.exception("Razorpay order creation failed")
        raise PaymentServiceError("Failed to create Razorpay order") from exc

    razorpay_order_id: str = rz_order["id"]

    payment = Payment(user_id=payload.user_id, razorpay_order_id=razorpay_order_id, amount=payload.amount, amount_paid=0, currency=payload.currency, status=PaymentStatus.PENDING, description=payload.description, metadata_json=json.dumps(payload.metadata) if payload.metadata else None)
    db.add(payment)
    await db.flush() 

    _write_ledger_entry(db, user_id=payload.user_id, entry_type=LedgerEntryType.CREDIT, amount=payload.amount, currency=payload.currency, reference_type=LedgerReferenceType.PAYMENT, reference_id=payment.id, status=PaymentStatus.PENDING, description=f"Intent for order {razorpay_order_id}")
    return PaymentIntentResponse(payment_id=payment.id, razorpay_order_id=razorpay_order_id, amount=payload.amount, currency=payload.currency, status=PaymentStatus.PENDING, key_id=_RAZORPAY_KEY_ID)

async def process_webhook(db: AsyncSession, raw_body: bytes, signature: str) -> WebhookAck:
    _verify_razorpay_signature(raw_body, signature)
    idem_key = _compute_idempotency_key(raw_body)
    existing = await db.execute(select(Payment).where(Payment.webhook_idempotency_key == idem_key))
    if existing.scalar_one_or_none() is not None:
        raise DuplicateWebhookError("Duplicate webhook")

    try: event_data: dict[str, Any] = json.loads(raw_body)
    except json.JSONDecodeError as exc: raise PaymentServiceError("Invalid JSON in webhook body") from exc

    event_name: str = event_data.get("event", "")
    payload: dict[str, Any] = event_data.get("payload", {})

    if event_name in ("payment.captured", "order.paid"): await _handle_payment_captured(db, payload, idem_key)
    elif event_name == "payment.failed": await _handle_payment_failed(db, payload, idem_key)
    return WebhookAck(status="ok", message=f"event '{event_name}' processed")

async def settle_payment(db: AsyncSession, razorpay_order_id: str, razorpay_payment_id: str, amount_paid: int, currency: str, idem_key: str | None = None) -> Payment:
    payment = await _get_payment_for_update(db, razorpay_order_id)
    if payment.status == PaymentStatus.SUCCESS:
        return payment

    # Lock user deterministically to prevent balance race conditions
    user = await _get_user_for_update(db, int(payment.user_id))

    new_amount_paid = payment.amount_paid + amount_paid
    if new_amount_paid > payment.amount: new_amount_paid = payment.amount
    new_status = PaymentStatus.SUCCESS if new_amount_paid >= payment.amount else PaymentStatus.PARTIAL

    payment.status = new_status
    payment.amount_paid = new_amount_paid
    payment.razorpay_payment_id = razorpay_payment_id
    if idem_key:
        payment.webhook_idempotency_key = idem_key

    # Safely update user balance with precision rounding
    amount_inr = round(float(amount_paid) / 100.0, 2)
    user.balance = round(user.balance + amount_inr, 2)

    _write_ledger_entry(
        db,
        user_id=int(payment.user_id),
        entry_type=LedgerEntryType.CREDIT,
        amount=amount_paid,
        currency=currency,
        reference_type=LedgerReferenceType.PAYMENT,
        reference_id=payment.id,
        status=new_status,
        description=f"Razorpay capture {razorpay_payment_id} for order {razorpay_order_id}"
    )

    return payment

async def _handle_payment_captured(db: AsyncSession, payload: dict[str, Any], idem_key: str) -> None:
    payment_entity: dict[str, Any] = payload.get("payment", {}).get("entity", {}) or payload.get("order", {}).get("entity", {})
    order_entity: dict[str, Any] = payload.get("order", {}).get("entity", {})
    razorpay_order_id: str = order_entity.get("id") or payment_entity.get("order_id", "")
    razorpay_payment_id: str = payment_entity.get("id", "")
    amount_paid: int = int(payment_entity.get("amount", 0))  
    currency: str = payment_entity.get("currency", "INR")

    if not razorpay_order_id: raise PaymentServiceError("Missing order_id in webhook payload")
    
    # Delegate to unified settlement to ensure atomicity
    await settle_payment(db, razorpay_order_id, razorpay_payment_id, amount_paid, currency, idem_key)

async def _handle_payment_failed(db: AsyncSession, payload: dict[str, Any], idem_key: str) -> None:
    payment_entity: dict[str, Any] = payload.get("payment", {}).get("entity", {})
    razorpay_order_id: str = payment_entity.get("order_id", "")
    razorpay_payment_id: str = payment_entity.get("id", "")
    currency: str = payment_entity.get("currency", "INR")

    if not razorpay_order_id: raise PaymentServiceError("Missing order_id in failed payment webhook")
    payment = await _get_payment_for_update(db, razorpay_order_id)
    if payment.status != PaymentStatus.PENDING: return

    payment.status = PaymentStatus.FAILED
    payment.razorpay_payment_id = razorpay_payment_id
    payment.webhook_idempotency_key = idem_key

    _write_ledger_entry(db, user_id=payment.user_id, entry_type=LedgerEntryType.CREDIT, amount=payment.amount, currency=currency, reference_type=LedgerReferenceType.PAYMENT, reference_id=payment.id, status=PaymentStatus.FAILED, description=f"Failed payment {razorpay_payment_id} for order {razorpay_order_id}")