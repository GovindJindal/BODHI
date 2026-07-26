from fastapi import Request
from core.rate_limit import limiter
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import re

from database import get_db
from models.core import User
from services.auth_service import (
    get_password_hash, 
    verify_password, 
    create_access_token, 
    timedelta, 
    ACCESS_TOKEN_EXPIRE_MINUTES,
    send_signup_otp_email,
    send_reset_otp_email,
    send_otp_sms,
    get_current_user
)
import random
from datetime import datetime, timezone, timedelta

router = APIRouter()

def normalize_identifier(email: Optional[str] = None, phone: Optional[str] = None) -> str:
    if email:
        return email.lower().strip()
    if phone:
        # Keep only the last 10 digits to match regardless of +91 or 0 prefix
        clean = re.sub(r'\D', '', phone)
        return clean[-10:]
    return ""

class UserCreate(BaseModel):
    email: EmailStr      
    password: str
    full_name: str
    phone_number: str
    m_pin: str
    u_pin: str
    age: int
    gender: str

class PhoneCheck(BaseModel):
    phone: str

class PasswordResetRequest(BaseModel):
    email: EmailStr

class UpinVerify(BaseModel):
    u_pin: str

class OtpRequest(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

class OtpVerify(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    otp: str

# In-memory storage for registration OTPs (In prod, use Redis!)
register_otps = {}


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def register(request: Request, user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    print(f"📝 Attempting to register user: {user_data.email}")
    try:
        # Check if email or phone already exists
        result = await db.execute(
            select(User).where((User.email == user_data.email) | (User.phone == user_data.phone_number))
        )
        existing_user = result.scalar_one_or_none()
        if existing_user:
            if existing_user.email == user_data.email:
                print(f"⚠️ Registration failed: Email {user_data.email} already exists.")
                raise HTTPException(status_code=400, detail="Email already registered")
            else:
                print(f"⚠️ Registration failed: Phone {user_data.phone_number} already exists.")
                raise HTTPException(status_code=400, detail="Phone number already registered")
                
        # Create new user
        print("🔐 Hashing PINs...")
        try:
            hashed_mpin = get_password_hash(user_data.m_pin)
            hashed_upin = get_password_hash(user_data.u_pin)
        except ValueError as ve:
            print(f"⚠️ Hashing failed ({ve}), using fallback...")
            # Fallback for PINs if bcrypt is being difficult on the server
            import hashlib
            hashed_mpin = hashlib.sha256(user_data.m_pin.encode()).hexdigest()
            hashed_upin = hashlib.sha256(user_data.u_pin.encode()).hexdigest()
        
        new_user = User(
                email=user_data.email,
                full_name=user_data.full_name,
                phone=user_data.phone_number,
                hashed_password=hashed_mpin, # M-PIN is used for primary login
                m_pin=hashed_mpin,
                u_pin=hashed_upin,
                age=user_data.age,
                gender=user_data.gender,
                is_mpin_set=True,
                is_active=True,
                is_verified=True, # OTP was verified before this step
                balance=100000.0,
                paper_balance=100000.0
            )
        
        print("💾 Saving user to DB...")
        db.add(new_user)
        await db.commit()
        print(f"✅ User {user_data.email} registered successfully.")
        return {"message": "User created successfully. Welcome to BODHI!"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        # Log request payload safely (masking PINs)
        safe_payload = user_data.model_dump()
        safe_payload['m_pin'] = '********'
        safe_payload['u_pin'] = '********'
        safe_payload['password'] = '********'
        
        print(f"❌ Registration Crash for {user_data.email}: {str(e)}")
        print(f"📦 Safe Payload: {safe_payload}")
        print(f"🔍 Traceback:\n{error_trace}")
        
        raise HTTPException(
            status_code=500, 
            detail={
                "message": "Registration failed due to server error",
                "error": str(e),
                "type": type(e).__name__
            }
        )

@router.post("/check-phone")
@limiter.limit("5/minute")
async def check_phone(request: Request, data: PhoneCheck, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.phone == data.phone))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Phone number already registered")
    return {"available": True}

# Note: OAuth2PasswordRequestForm expects form data (username & password), not JSON!
@router.post("/token")
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    # Find user
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    # Verify user and password
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Generate JWT Token and Session
    from models.core import Session
    from services.auth_service import generate_opaque_token, hash_refresh_token
    
    raw_refresh_token = generate_opaque_token()
    session = Session(
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(raw_refresh_token),
        device_info=request.headers.get("User-Agent", "")[:255] if request.headers.get("User-Agent") else None,
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30)
    )
    db.add(session)
    await db.flush()

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.id, "role": user.role}, 
        expires_delta=access_token_expires,
        session_id=session.id
    )
    await db.commit()
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "full_name": user.full_name,
        "refresh_token": raw_refresh_token,
        "session_id": session.id
    }

@router.post("/forgot-password")
@limiter.limit("3/minute")
async def request_password_reset(request: PasswordResetRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()
    
    if user:
        otp = str(random.randint(100000, 999999))
        user.reset_otp = otp
        user.reset_otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
        await db.commit()
        
        # 🚀 FIRE THE REAL EMAIL
        send_reset_otp_email(user.email, otp, user.full_name)
    
    return {"message": "If that account exists, a reset code has been sent."}

class PasswordResetConfirm(BaseModel):
    email: EmailStr
    otp: str
    new_password: str

@router.post("/reset-password")
@limiter.limit("3/minute")
async def confirm_password_reset(request: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    # 1. Find the user
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # 2. Check if OTP exists and matches
    if not user.reset_otp or user.reset_otp != request.otp:
        raise HTTPException(status_code=400, detail="Invalid reset code")
        
    # 3. Check if OTP has expired
    if user.reset_otp_expiry and datetime.now(timezone.utc) > user.reset_otp_expiry:
        raise HTTPException(status_code=400, detail="Reset code has expired")
        
    # 4. Update password, clear OTP fields, and invalidate existing sessions
    from sqlalchemy import update
    from models.core import Session
    
    user.hashed_password = get_password_hash(request.new_password)
    user.reset_otp = None
    user.reset_otp_expiry = None
    user.password_changed_at = datetime.now(timezone.utc)
    
    # Revoke all active sessions immediately
    await db.execute(
        update(Session)
        .where((Session.user_id == user.id) & (Session.revoked_at.is_(None)))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    
    await db.commit()
    return {"message": "Password updated successfully. All previous sessions have been signed out."}

@router.post("/send-register-otp")
@limiter.limit("3/minute")
async def send_register_otp(request: Request, payload: OtpRequest):
    identifier = normalize_identifier(payload.email, request.phone)
    if not identifier:
        raise HTTPException(status_code=400, detail="Email or Phone is required")
        
    otp = str(random.randint(100000, 999999))
    register_otps[identifier] = {
        "otp": otp,
        "expiry": datetime.now(timezone.utc) + timedelta(minutes=10)
    }
    
    print(f"\n🚀 [OTP DEBUG] Code for {identifier}: {otp}\n")
    
    if payload.email:
        # 🚀 SEND EMAIL
        success = send_signup_otp_email(payload.email, otp)
    else:
        # 🚀 SEND SMS
        success = send_otp_sms(request.phone, otp)
        
    if not success:
        # 🧪 DEV BYPASS: Log it but don't fail the request.
        # This allows the user to use the code from the terminal.
        print("\n⚠️ [DEV NOTICE] OTP could not be sent. USE THIS CODE FROM THE TERMINAL TO PROCEED.\n")
        return {"message": "OTP logic active. Please check the backend console for the code (Dev Mode)."}
        
    return {"message": "OTP sent successfully"}

@router.post("/verify-register-otp")
@limiter.limit("5/minute")
async def verify_register_otp(request: Request, payload: OtpVerify):
    identifier = normalize_identifier(payload.email, request.phone)
    if not identifier:
        raise HTTPException(status_code=400, detail="Email or Phone is required")
        
    stored_data = register_otps.get(identifier)
    
    if not stored_data:
        raise HTTPException(status_code=400, detail="No OTP sent to this recipient")
        
    if datetime.now(timezone.utc) > stored_data["expiry"]:
        del register_otps[identifier]
        raise HTTPException(status_code=400, detail="OTP has expired")
        
    if stored_data["otp"] != request.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
        
    # Valid! Clean up
    del register_otps[identifier]
    return {"message": "OTP verified successfully"}
@router.post("/verify-upin")
@limiter.limit("5/minute")
async def verify_upin(request: Request, payload: UpinVerify, user: User = Depends(get_current_user)):
    if not user.u_pin:
        return {"success": True, "message": "No U-PIN set for this user."}
        
    if not verify_password(request.u_pin, user.u_pin):
        raise HTTPException(status_code=400, detail="Invalid U-PIN")
        
    return {"success": True, "message": "U-PIN verified"}

# ---------------------------------------------------------------------------
# Session Management & Refresh Tokens
# ---------------------------------------------------------------------------

class RefreshRequest(BaseModel):
    refresh_token: str
    session_id: str

@router.post("/refresh")
@limiter.limit("5/minute")
async def refresh_token(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    from models.core import Session
    from services.auth_service import hash_refresh_token, verify_refresh_token, generate_opaque_token, create_access_token
    
    # Lock the session row to prevent concurrent refresh races
    result = await db.execute(select(Session).where(Session.id == body.session_id).with_for_update())
    session = result.scalar_one_or_none()
    
    if not session or session.revoked_at or session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid, expired, or revoked session")
        
    # Verify the provided refresh token against the stored hash
    if not verify_refresh_token(body.refresh_token, session.refresh_token_hash):
        # TOKEN THEFT DETECTED: A valid session exists but the token was wrong/old.
        print(f"🚨 Token theft/replay detected for session {session.id}. Revoking immediately.")
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid refresh token. Session revoked for security.")
        
    # Rotate token
    new_raw_refresh = generate_opaque_token()
    session.refresh_token_hash = hash_refresh_token(new_raw_refresh)
    session.last_used_at = datetime.now(timezone.utc)
    
    # We need the user to generate access token
    result_u = await db.execute(select(User).where(User.id == session.user_id))
    user = result_u.scalar_one()
    
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
        "session_id": session.id
    }

class LogoutRequest(BaseModel):
    session_id: str

@router.post("/logout")
async def logout(request: Request, body: LogoutRequest, db: AsyncSession = Depends(get_db)):
    from models.core import Session
    result = await db.execute(select(Session).where(Session.id == body.session_id))
    session = result.scalar_one_or_none()
    if session and not session.revoked_at:
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()
    return {"message": "Logged out successfully"}

@router.get("/sessions")
async def get_active_sessions(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from models.core import Session
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
    from models.core import Session
    result = await db.execute(select(Session).where((Session.id == session_id) & (Session.user_id == current_user.id)))
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    session.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Session revoked successfully"}
