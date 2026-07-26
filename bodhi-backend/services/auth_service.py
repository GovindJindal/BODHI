








import hashlib
from datetime import datetime, timedelta
from typing import Optional
import jwt
import os
import requests
import logging
import uuid
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

from core.config import settings

# ── Security config ────────────────────────────────────────────────────────────
SECRET_KEY = settings.secret_key
ALGORITHM = settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes

# Configuration
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = settings.sender_email or settings.smtp_user
SENDER_PASSWORD = settings.sender_password or settings.smtp_password

# SMS Configuration (Fast2SMS)
SMS_KEY = settings.sms_api_key
SMS_SENDER_ID = settings.sms_sender_id

import passlib.handlers.bcrypt
def patched_detect_wrap_bug(ident):
    return False
passlib.handlers.bcrypt.detect_wrap_bug = patched_detect_wrap_bug

pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")

# tokenUrl must match the actual login route: POST /auth/token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

import bcrypt

def verify_password(plain_password: str, hashed_password: str):
    if not hashed_password:
        return False
    
    # 1. First, try the modern way (Pre-hashed with SHA256)
    try:
        pre_hashed = hashlib.sha256(plain_password.encode()).hexdigest()
        if pwd_context.verify(pre_hashed, hashed_password):
            return True
    except Exception:
        pass

    # 2. Fallback: Try raw password verification (for existing non-pre-hashed passwords)
    try:
        # Avoid crashing if the raw password is > 72 bytes
        safe_plain = str(plain_password)[:72]
        if pwd_context.verify(safe_plain, hashed_password):
            return True
    except Exception:
        pass

    # 3. Fallback: Manual SHA256 check (some legacy systems)
    try:
        user_hash = hashlib.sha256(plain_password.encode()).hexdigest()
        if hashed_password == user_hash:
            return True
    except Exception:
        pass

    # 4. Fallback: Raw 4-digit PIN
    if len(hashed_password) == 4 and hashed_password == plain_password:
        return True
        
    return False

def get_password_hash(password: str):
    # Support for very strong/long passwords via SHA-256 pre-hashing
    pre_hashed = hashlib.sha256(str(password).encode()).hexdigest()
    
    # Final safety check before passing to bcrypt
    final_input = pre_hashed.encode('utf-8')
    if len(final_input) > 71:
        final_input = final_input[:71]
        
    print(f"🔒 Hashing password fingerprint (length: {len(final_input)} bytes)")
    return pwd_context.hash(final_input.decode('utf-8'))

logger = logging.getLogger(__name__)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    now = datetime.utcnow()
    expire = now + (expires_delta if expires_delta else timedelta(minutes=15))
    to_encode.update({
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4())
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token_payload(token: str) -> dict:
    """Synchronously decode a JWT and return its payload. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError as exc:
        logger.warning("Token Validation Failed: Expired signature")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        ) from exc
    except jwt.PyJWTError as exc:
        logger.warning("Token Validation Failed: Invalid signature or malformed token")
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
            logger.warning("Token Validation Failed: Missing 'sub' claim")
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        logger.warning("Token Validation Failed: Expired signature in get_current_user")
        raise credentials_exception
    except jwt.PyJWTError as exc:
        logger.warning(f"Token Validation Failed: {str(exc)}")
        raise credentials_exception
        
    result = await db.execute(select(User).where(User.email == username))
    user = result.scalar_one_or_none()
    
    if user is None:
        logger.warning(f"Token Validation Failed: Unknown user ID/email referenced in valid token ({username})")
        raise credentials_exception
        
    if not user.is_active:
        logger.warning(f"Access Denied: Attempted access by disabled/inactive user ({username})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended or inactive."
        )
        
    return user

def _format_otp_for_display(otp: str) -> str:
    return " ".join(otp.strip())


def _deliver_html_email(email_address: str, subject: str, html_body: str) -> bool:
    try:
        msg = MIMEMultipart()
        msg['From'] = f"BODHI <{SENDER_EMAIL}>"
        msg['To'] = email_address
        msg['Subject'] = subject
        msg.attach(MIMEText(html_body, 'html'))

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


def send_signup_otp_email(email_address: str, otp: str):
    greeting_name = email_address.split('@')[0].replace('.', ' ').title() if '@' in email_address else 'there'
    otp_display = _format_otp_for_display(otp)

    body = f"""
    <html>
        <body style="margin:0;padding:0;background-color:#F5F3EE;font-family:Arial,Helvetica,sans-serif;color:#1C1C1E;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F5F3EE;padding:32px 16px;">
                <tr>
                    <td align="center">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#FFFFFF;border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:32px 28px;">
                            <tr>
                                <td style="font-size:24px;font-weight:800;letter-spacing:1px;color:#1A1A4E;padding-bottom:24px;">BODHI</td>
                            </tr>
                            <tr>
                                <td style="font-size:16px;line-height:1.6;padding-bottom:12px;">Hi {greeting_name},</td>
                            </tr>
                            <tr>
                                <td style="font-size:16px;line-height:1.6;padding-bottom:20px;">Use the code below to verify your account.</td>
                            </tr>
                            <tr>
                                <td align="center" style="padding-bottom:24px;">
                                    <div style="display:inline-block;background-color:#F5F3EE;border:1px solid rgba(0,0,0,0.08);border-radius:12px;padding:18px 24px;">
                                        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1A1A4E;font-family:'Courier New',Courier,monospace;">{otp_display}</span>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td style="font-size:14px;line-height:1.6;color:rgba(0,0,0,0.65);padding-bottom:24px;">This code expires in 10 minutes. If you did not request this, please ignore this email.</td>
                            </tr>
                            <tr>
                                <td style="font-size:14px;line-height:1.6;padding-bottom:4px;">— The BODHI Team</td>
                            </tr>
                            <tr>
                                <td style="font-size:13px;color:rgba(0,0,0,0.45);">Your money. Alive.</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>
    """
    return _deliver_html_email(email_address, "[OTP] Verify your BODHI account", body)


def send_reset_otp_email(email_address: str, otp: str, user_name: Optional[str] = None):
    greeting_name = (user_name or '').strip()
    if not greeting_name:
        greeting_name = email_address.split('@')[0].replace('.', ' ').title() if '@' in email_address else 'there'
    otp_display = _format_otp_for_display(otp)

    body = f"""
    <html>
        <body style="margin:0;padding:0;background-color:#F5F3EE;font-family:Arial,Helvetica,sans-serif;color:#1C1C1E;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F5F3EE;padding:32px 16px;">
                <tr>
                    <td align="center">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#FFFFFF;border:1px solid rgba(0,0,0,0.08);border-radius:16px;padding:32px 28px;">
                            <tr>
                                <td style="font-size:24px;font-weight:800;letter-spacing:1px;color:#1A1A4E;padding-bottom:24px;">BODHI</td>
                            </tr>
                            <tr>
                                <td style="font-size:16px;line-height:1.6;padding-bottom:12px;">Hi {greeting_name},</td>
                            </tr>
                            <tr>
                                <td style="font-size:16px;line-height:1.6;padding-bottom:20px;">Use the code below to reset your password.</td>
                            </tr>
                            <tr>
                                <td align="center" style="padding-bottom:24px;">
                                    <div style="display:inline-block;background-color:#F5F3EE;border:1px solid rgba(0,0,0,0.08);border-radius:12px;padding:18px 24px;">
                                        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1A1A4E;font-family:'Courier New',Courier,monospace;">{otp_display}</span>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td style="font-size:14px;line-height:1.6;color:rgba(0,0,0,0.65);padding-bottom:24px;">This code expires in 10 minutes. If you did not request this, please ignore this email.</td>
                            </tr>
                            <tr>
                                <td style="font-size:14px;line-height:1.6;padding-bottom:4px;">— The BODHI Team</td>
                            </tr>
                            <tr>
                                <td style="font-size:13px;color:rgba(0,0,0,0.45);">Your money. Alive.</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>
    """
    return _deliver_html_email(email_address, "[OTP] Reset your BODHI password", body)


def send_role_update_email(email_address: str, new_role: str):
    try:
        msg = MIMEMultipart()
        msg['From'] = f"BODHI Team <{SENDER_EMAIL}>"
        msg['To'] = email_address
        
        status_action = "Promoted" if new_role == "admin" else "Demoted"
        msg['Subject'] = f"Action Required: Your BODHI Account Access Level Has Changed"

        body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="background-color: #5d3fd3; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">Access Level Update</h1>
                </div>
                <div style="padding: 20px;">
                    <p>Hello,</p>
                    <p>This is a formal notification from the BODHI System Administration team regarding your account access level.</p>
                    <div style="background-color: #f4f4f4; border-left: 4px solid #5d3fd3; padding: 15px; margin: 20px 0;">
                        <strong>Updated Role:</strong> {new_role.upper()}<br>
                        <strong>Status:</strong> {status_action}
                    </div>
                    <p>{"As an Administrator, you now have access to core system controls. Please ensure you follow security protocols." if new_role == "admin" else "Your administrative privileges have been revoked. This action may have been part of a standard audit or team reorganization."}</p>
                    <p>If you believe this change was made in error, please contact your supervisor immediately.</p>
                </div>
                <p style="font-size: 12px; color: #666; padding: 20px;">Your money. Alive. - BODHI Security Protocol</p>
            </body>
        </html>
        """
        msg.attach(MIMEText(body, 'html'))

        # Connect and Send
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"❌ Role Update Mail Error: {e}")
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