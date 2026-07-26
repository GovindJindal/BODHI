import logging
from fastapi import Request
from core.rate_limit import limiter
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

# Updated BODHI Imports
from database import get_db
from services.auth_service import get_current_user # Injected Auth!
from schemas.payments import PaymentIntentCreate, PaymentIntentResponse, WebhookAck
from services.payments_service import (
    DuplicateWebhookError, InvalidSignatureError, PaymentNotFoundError,
    PaymentServiceError, UserNotFoundError, create_payment_intent, process_webhook
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])

@router.post("/intent", response_model=PaymentIntentResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_intent(request: Request, 
    body: PaymentIntentCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user) # Enforcing login!
) -> PaymentIntentResponse:
    try:
        # Override payload ID with actual logged-in user to prevent spoofing
        body.user_id = current_user.id 
        return await create_payment_intent(db, body)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PaymentServiceError as exc:
        logger.exception("PaymentServiceError in create_intent")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Payment gateway error; please retry") from exc

@router.post("/webhook", response_model=WebhookAck, status_code=status.HTTP_200_OK)
@limiter.exempt
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(..., alias="X-Razorpay-Signature"),
    db: AsyncSession = Depends(get_db),
) -> WebhookAck:
    raw_body: bytes = await request.body()
    try:
        return await process_webhook(db, raw_body, x_razorpay_signature)
    except DuplicateWebhookError:
        return WebhookAck(status="ok", message="duplicate event ignored")
    except InvalidSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature") from exc
    except PaymentNotFoundError as exc:
        return WebhookAck(status="ok", message="order not found; event noted")
    except PaymentServiceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc