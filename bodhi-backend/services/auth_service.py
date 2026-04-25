import hashlib
from datetime import datetime, timedelta
from typing import Optional
import jwt
import os
import requests
from dotenv import load_dotenv
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models.core import User

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

# ── Bcrypt 4.0 Compatibility Patch ─────────────────────────────────────────────
# Passlib (older versions) expects bcrypt to have an __about__ attribute.
# Bcrypt 4.0+ removed this, causing AttributeErrors.
import bcrypt
if not hasattr(bcrypt, "__about__"):
    class BcryptAbout:
        def __init__(self):
            self.__version__ = getattr(bcrypt, "__version__", "4.0.0")
    bcrypt.__about__ = BcryptAbout()
# ─────────────────────────────────────────────────────────────────────────────

# ── Security config ────────────────────────────────────────────────────────────
# SECRET_KEY MUST be set in .env on production. The fallback is only for local dev.
_env_secret = os.getenv("SECRET_KEY")
if not _env_secret:
    import warnings
    warnings.warn(
        "\u26a0\ufe0f  SECRET_KEY not set in environment. Using insecure default. "
        "Set SECRET_KEY in your .env before deploying!",
        stacklevel=2,
    )
SECRET_KEY = _env_secret or "super_secret_bodhi_key_do_not_share"
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))  # 7 days

# Configuration
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = os.getenv("SENDER_EMAIL") or os.getenv("SMTP_USER")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD") or os.getenv("SMTP_PASSWORD")

# SMS Configuration (Fast2SMS)
SMS_KEY = os.getenv("SMS_API_KEY")
SMS_SENDER_ID = os.getenv("SMS_SENDER_ID", "FSTSMS")

# Using passlib context to handle multiple hashing algorithms (bcrypt and pbkdf2)
pwd_context = CryptContext(schemes=["bcrypt", "pbkdf2_sha256"], deprecated="auto")

# tokenUrl must match the actual login route: POST /auth/token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

import bcrypt

def verify_password(plain_password: str, hashed_password: str):
    if not hashed_password:
        return False
    try:
        # 1. Try standard verification (bcrypt/pbkdf2)
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # 2. Check for SHA256 fallback (used if bcrypt fails)
        import hashlib
        fallback_hash = hashlib.sha256(plain_password.encode()).hexdigest()
        if hashed_password == fallback_hash:
            return True
            
        # 3. Fallback: if it's a raw 4-digit PIN (legacy support)
        if len(hashed_password) == 4 and hashed_password == plain_password:
            return True
        return False

def get_password_hash(password: str):
    # Bcrypt limit is 72 bytes. Truncating here prevents 500 errors
    # if the frontend accidentally sends an object or giant string.
    safe_password = str(password)[:72]
    return pwd_context.hash(safe_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token_payload(token: str) -> dict:
    """Synchronously decode a JWT and return its payload. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
        
    result = await db.execute(select(User).where(User.email == username))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    return user

def send_otp_email(email_address: str, otp: str):
    try:
        # Create message
        msg = MIMEMultipart()
        msg['From'] = f"BODHI <{SENDER_EMAIL}>"
        msg['To'] = email_address
        msg['Subject'] = f"{otp} is your BODHI reset code"

        body = f"""
        <html>
            <body style="font-family: sans-serif; background-color: #000; color: #fff; padding: 20px;">
                <h2 style="color: #CCFF00;">BODHI</h2>
                <p>Use the code below to verify your account. Valid for 10 minutes.</p>
                <div style="background: #222; padding: 20px; border-radius: 10px; text-align: center;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #CCFF00;">{otp}</span>
                </div>
                <p style="font-size: 12px; color: #666; margin-top: 20px;">Your money. Alive.</p>
            </body>
        </html>
        """
        msg.attach(MIMEText(body, 'html'))

        # Connect and Send
        print(f"📧 Attempting to send mail to {email_address} via {SENDER_EMAIL}...")
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"✅ Mail sent successfully to {email_address}")
        return True
    except Exception as e:
        import traceback
        print(f"❌ Mail Error for {email_address}: {e}")
        traceback.print_exc()
        return False

def send_otp_sms(phone_number: str, otp: str):
    try:
        url = "https://www.fast2sms.com/dev/bulkV2"
        
        # Clean phone number (remove +91 and any non-digits)
        import re
        clean_phone = re.sub(r'\D', '', phone_number)
        if clean_phone.startswith('91') and len(clean_phone) > 10:
            clean_phone = clean_phone[2:]
            
        # 🔑 Ensure the key is stripped of any hidden spaces/newlines
        clean_key = str(SMS_KEY).strip() if SMS_KEY else ""
        
        payload = {
            "variables_values": otp,
            "route": "otp",
            "numbers": clean_phone
        }
        
        headers = {
            'authorization': clean_key,
            'Content-Type': "application/json",
            'Cache-Control': "no-cache",
        }

        print(f"📱 [XHR] Sending JSON OTP to {clean_phone}...")
        response = requests.post(url, json=payload, headers=headers)
        res_data = response.json()
        
        if res_data.get("return"):
            print(f"✅ SMS sent successfully to {clean_phone}")
            return True
        else:
            print(f"❌ SMS Gateway Error: {res_data.get('message')}")
            return False
            
    except Exception as e:
        import traceback
        print(f"❌ SMS System Error: {e}")
        traceback.print_exc()
        return False