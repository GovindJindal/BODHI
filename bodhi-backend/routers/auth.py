import hashlib
import hmac
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import delete, func, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.config import settings
from core.rate_limit import limiter
from database import get_db
from models.core import Session, User
from models.otp import OtpCode
from services.auth_service import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    generate_opaque_token,
    generate_otp,
    get_current_user,
    get_password_hash,
    hash_refresh_token,
    issue_session_tokens,
    otp_matches,
    send_otp_sms,
    send_reset_otp_email,
    send_signup_otp_email,
    verify_password,
    verify_refresh_token,
)

logger = logging.getLogger(__name__)
router = APIRouter()

OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5
# After the OTP is verified the user has this long to finish the signup wizard.
SIGNUP_VERIFIED_WINDOW = timedelta(minutes=30)
IS_LAMBDA = os.environ.get("AWS_EXECUTION_ENV") is not None


def normalize_identifier(email: Optional[str] = None, phone: Optional[str] = None) -> str:
    if email:
        return email.lower().strip()
    if phone:
        # Keep only the last 10 digits to match regardless of +91 or 0 prefix
        return re.sub(r"\D", "", phone)[-10:]
    return ""


def _hash_otp(identifier: str, code: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"{identifier}:{code.strip()}".encode(), hashlib.sha256).hexdigest()


PIN_PATTERN = re.compile(r"^\d{4,6}$")


class UserCreate(BaseModel):
    email: EmailStr
    password: Optional[str] = None  # legacy field – the M-PIN is the login secret
    full_name: str
    phone_number: str
    m_pin: str
    u_pin: str
    age: int
    gender: str

    @field_validator("email")
    @classmethod
    def _lower_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name is required")
        return v[:255]

    @field_validator("phone_number")
    @classmethod
    def _phone(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            raise ValueError("Enter a valid 10-digit phone number")
        return v.strip()[:20]

    @field_validator("m_pin", "u_pin")
    @classmethod
    def _pin(cls, v: str) -> str:
        v = v.strip()
        if not PIN_PATTERN.match(v):
            raise ValueError("PIN must be 4 to 6 digits")
        return v

    @field_validator("age")
    @classmethod
    def _age(cls, v: int) -> int:
        if v < 13 or v > 120:
            raise ValueError("Age must be between 13 and 120")
        return v


class PhoneCheck(BaseModel):
    phone: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    otp: str
    new_password: str


class UpinVerify(BaseModel):
    u_pin: str


class OtpRequest(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


class OtpVerify(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    otp: str


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def register(request: Request, user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    if user_data.m_pin == user_data.u_pin:
        raise HTTPException(status_code=400, detail="M-PIN and U-PIN must be different")

    # The email must have passed OTP verification recently.
    verified = await db.scalar(
        select(OtpCode.id).where(
            OtpCode.identifier == user_data.email,
            OtpCode.purpose == "register",
            OtpCode.verified_at.is_not(None),
            OtpCode.verified_at > datetime.now(timezone.utc) - SIGNUP_VERIFIED_WINDOW,
        ).limit(1)
    )
    if not verified:
        raise HTTPException(status_code=400, detail="Please verify your email with the OTP before signing up")

    phone_digits = normalize_identifier(phone=user_data.phone_number)
    existing_user = (await db.execute(
        select(User).where(
            or_(func.lower(User.email) == user_data.email, User.phone == user_data.phone_number,
                User.phone.like(f"%{phone_digits}"))
        ).limit(1)
    )).scalar_one_or_none()
    if existing_user:
        if (existing_user.email or "").lower() == user_data.email:
            raise HTTPException(status_code=400, detail="Email already registered")
        raise HTTPException(status_code=400, detail="Phone number already registered")

    hashed_mpin = get_password_hash(user_data.m_pin)
    new_user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        phone=user_data.phone_number,
        hashed_password=hashed_mpin,  # M-PIN is used for primary login
        m_pin=hashed_mpin,
        u_pin=get_password_hash(user_data.u_pin),
        age=user_data.age,
        gender=user_data.gender,
        is_mpin_set=True,
        is_active=True,
        is_verified=True,
        email_verified=True,
        balance=100000.0,
        paper_balance=100000.0,
    )
    db.add(new_user)
    # The verified OTP is single-use.
    await db.execute(delete(OtpCode).where(OtpCode.identifier == user_data.email, OtpCode.purpose == "register"))
    try:
        await db.commit()
    except Exception as e:  # unique-constraint race or DB outage
        await db.rollback()
        logger.error(f"Registration failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Registration failed due to a server error. Please try again.") from None
    return {"message": "User created successfully. Welcome to BODHI!"}


@router.post("/check-phone")
@limiter.limit("5/minute")
async def check_phone(request: Request, data: PhoneCheck, db: AsyncSession = Depends(get_db)):
    digits = normalize_identifier(phone=data.phone)
    if not digits:
        raise HTTPException(status_code=400, detail="Phone number is required")
    exists = await db.scalar(
        select(User.id).where(or_(User.phone == data.phone, User.phone.like(f"%{digits}"))).limit(1)
    )
    if exists:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    return {"available": True}


# Note: OAuth2PasswordRequestForm expects form data (username & password), not JSON!
@router.post("/token")
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    username = form_data.username.strip().lower()
    result = await db.execute(select(User).where(func.lower(User.email) == username))
    user = result.scalar_one_or_none()

    if not user or user.deleted_at is not None or not verify_password(form_data.password.strip(), user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or M-PIN",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended or inactive.")

    tokens = await issue_session_tokens(db, user, request)
    await db.commit()
    return tokens


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def request_password_reset(request: Request, payload: PasswordResetRequest, db: AsyncSession = Depends(get_db)):
    email = payload.email.strip().lower()
    result = await db.execute(select(User).where(func.lower(User.email) == email))
    user = result.scalar_one_or_none()

    if user and user.deleted_at is None:
        otp = generate_otp()
        user.reset_otp = otp
        user.reset_otp_expiry = datetime.now(timezone.utc) + OTP_TTL
        user.reset_otp_attempts = 0
        await db.commit()
        sent = await run_in_threadpool(send_reset_otp_email, user.email, otp, user.full_name)
        if not sent:
            if not IS_LAMBDA:
                logger.warning(f"[DEV] Reset OTP for {email}: {otp}")
            else:
                raise HTTPException(status_code=503, detail="Could not send the reset code right now. Please try again shortly.")

    # Same answer whether or not the account exists (prevents email enumeration).
    return {"message": "If that account exists, a reset code has been sent."}


@router.post("/reset-password")
@limiter.limit("5/minute")
async def confirm_password_reset(request: Request, payload: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    email = payload.email.strip().lower()
    new_pin = payload.new_password.strip()
    if not PIN_PATTERN.match(new_pin):
        raise HTTPException(status_code=400, detail="New M-PIN must be 4 to 6 digits")

    result = await db.execute(select(User).where(func.lower(User.email) == email))
    user = result.scalar_one_or_none()
    invalid = HTTPException(status_code=400, detail="Invalid or expired reset code")
    if not user or not user.reset_otp:
        raise invalid

    if user.reset_otp_expiry and datetime.now(timezone.utc) > user.reset_otp_expiry:
        user.reset_otp = None
        user.reset_otp_expiry = None
        await db.commit()
        raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")

    if not otp_matches(payload.otp, user.reset_otp):
        user.reset_otp_attempts = (user.reset_otp_attempts or 0) + 1
        if user.reset_otp_attempts >= OTP_MAX_ATTEMPTS:
            user.reset_otp = None
            user.reset_otp_expiry = None
            await db.commit()
            raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new code.")
        await db.commit()
        raise invalid

    now = datetime.now(timezone.utc)
    new_hash = get_password_hash(new_pin)
    # The M-PIN is both the login secret and the in-app confirmation PIN.
    user.hashed_password = new_hash
    user.m_pin = new_hash
    user.is_mpin_set = True
    user.reset_otp = None
    user.reset_otp_expiry = None
    user.reset_otp_attempts = 0
    user.password_changed_at = now

    await db.execute(
        update(Session)
        .where(Session.user_id == user.id, Session.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await db.commit()
    return {"message": "M-PIN updated successfully. All previous sessions have been signed out."}


@router.post("/send-register-otp")
@limiter.limit("3/minute")
async def send_register_otp(request: Request, payload: OtpRequest, db: AsyncSession = Depends(get_db)):
    identifier = normalize_identifier(payload.email, payload.phone)
    if not identifier:
        raise HTTPException(status_code=400, detail="Email or Phone is required")

    if payload.email:
        taken = await db.scalar(select(User.id).where(func.lower(User.email) == identifier).limit(1))
        if taken:
            raise HTTPException(status_code=400, detail="Email already registered. Please log in instead.")

    otp = generate_otp()
    now = datetime.now(timezone.utc)
    await db.execute(delete(OtpCode).where(OtpCode.identifier == identifier, OtpCode.purpose == "register"))
    # Opportunistic cleanup of stale rows.
    await db.execute(delete(OtpCode).where(OtpCode.expires_at < now - timedelta(days=1)))
    db.add(OtpCode(identifier=identifier, purpose="register", code_hash=_hash_otp(identifier, otp), expires_at=now + OTP_TTL))
    await db.commit()

    if payload.email:
        success = await run_in_threadpool(send_signup_otp_email, identifier, otp)
    else:
        success = await run_in_threadpool(send_otp_sms, payload.phone, otp)

    if not success:
        if IS_LAMBDA:
            raise HTTPException(status_code=503, detail="Could not send the OTP right now. Please try again shortly.")
        # Local development without SMTP/SMS credentials: surface the code in the server log only.
        logger.warning(f"[DEV] Signup OTP for {identifier}: {otp}")
        return {"message": "OTP generated (dev mode – check the backend console)."}

    return {"message": "OTP sent successfully"}


@router.post("/verify-register-otp")
@limiter.limit("10/minute")
async def verify_register_otp(request: Request, payload: OtpVerify, db: AsyncSession = Depends(get_db)):
    identifier = normalize_identifier(payload.email, payload.phone)
    if not identifier:
        raise HTTPException(status_code=400, detail="Email or Phone is required")

    record = (await db.execute(
        select(OtpCode)
        .where(OtpCode.identifier == identifier, OtpCode.purpose == "register")
        .order_by(OtpCode.created_at.desc())
        .limit(1)
        .with_for_update()
    )).scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=400, detail="No OTP sent to this recipient. Please request a new code.")
    if record.verified_at is not None:
        return {"message": "OTP verified successfully"}
    if datetime.now(timezone.utc) > record.expires_at:
        await db.delete(record)
        await db.commit()
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new code.")
    if not hmac.compare_digest(record.code_hash, _hash_otp(identifier, payload.otp or "")):
        record.attempts += 1
        if record.attempts >= OTP_MAX_ATTEMPTS:
            await db.delete(record)
            await db.commit()
            raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new code.")
        await db.commit()
        raise HTTPException(status_code=400, detail="Invalid OTP")

    record.verified_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "OTP verified successfully"}


@router.post("/verify-upin")
@limiter.limit("5/minute")
async def verify_upin(request: Request, payload: UpinVerify, user: User = Depends(get_current_user)):
    if not user.u_pin:
        return {"success": True, "message": "No U-PIN set for this user."}
        
    if not verify_password(payload.u_pin, user.u_pin):
        raise HTTPException(status_code=400, detail="Invalid U-PIN")
        
    return {"success": True, "message": "U-PIN verified"}

# ---------------------------------------------------------------------------
# Session Management & Refresh Tokens
# ---------------------------------------------------------------------------

class RefreshRequest(BaseModel):
    refresh_token: str
    session_id: str

@router.post("/refresh")
@limiter.limit("20/minute")
async def refresh_token(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    # Lock the session row to prevent concurrent refresh races
    result = await db.execute(select(Session).where(Session.id == body.session_id).with_for_update())
    session = result.scalar_one_or_none()
    
    if not session or session.revoked_at or session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid, expired, or revoked session")
        
    # Verify the provided refresh token against the stored hash
    if not verify_refresh_token(body.refresh_token, session.refresh_token_hash):
        # TOKEN THEFT DETECTED: A valid session exists but the token was wrong/old.
        logger.warning(f"Refresh token replay detected for session {session.id}; revoking.")
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid refresh token. Session revoked for security.")
        
    # Rotate token
    new_raw_refresh = generate_opaque_token()
    session.refresh_token_hash = hash_refresh_token(new_raw_refresh)
    session.last_used_at = datetime.now(timezone.utc)
    
    # We need the user to generate access token
    user = await db.get(User, session.user_id)
    if not user or not user.is_active or user.deleted_at is not None:
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(status_code=401, detail="Account is no longer active")

    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.id, "role": user.role}, 
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        session_id=session.id
    )
    
    await db.commit()
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "refresh_token": new_raw_refresh,
        "session_id": session.id,
        "full_name": user.full_name,
    }

class LogoutRequest(BaseModel):
    session_id: str

@router.post("/logout")
async def logout(request: Request, body: LogoutRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == body.session_id))
    session = result.scalar_one_or_none()
    if session and not session.revoked_at:
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()
    return {"message": "Logged out successfully"}

@router.get("/sessions")
async def get_active_sessions(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # List active sessions for user
    result = await db.execute(
        select(Session).where(
            (Session.user_id == current_user.id) & 
            (Session.revoked_at.is_(None)) & 
            (Session.expires_at > datetime.now(timezone.utc))
        ).order_by(Session.last_used_at.desc())
    )
    sessions = result.scalars().all()
    
    # Extract current session id if available
    auth_header = request.headers.get("Authorization")
    current_sid = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            from services.auth_service import verify_token_payload
            payload = verify_token_payload(token)
            current_sid = payload.get("sid")
        except Exception:
            pass
            
    return {
        "sessions": [
            {
                "session_id": s.id,
                "device_info": s.device_info,
                "ip_address": s.ip_address,
                "last_used_at": s.last_used_at.isoformat(),
                "created_at": s.created_at.isoformat(),
                "is_current": s.id == current_sid
            }
            for s in sessions
        ]
    }

@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Session).where((Session.id == session_id) & (Session.user_id == current_user.id)))
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    session.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Session revoked successfully"}
