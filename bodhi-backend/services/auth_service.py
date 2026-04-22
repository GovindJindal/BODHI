from datetime import datetime, timedelta
from typing import Optional
import jwt
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

import os
from dotenv import load_dotenv

load_dotenv()

# Production configuration from environment variables
SECRET_KEY = os.environ.get("SECRET_KEY", "your_super_secret_random_hex_key")
ALGORITHM = os.environ.get("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 10080))  # Default 7 days

# Email Configuration
SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "govindjindal7808@gmail.com")
SENDER_PASSWORD = os.environ.get("SENDER_PASSWORD", "cebm qeiq dllk xkwo")

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# This tells FastAPI where the frontend should send the login request
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- THE LOCK ON THE DOOR ---
# We will use this function to protect our trade endpoints
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
                <p>Use the code below to reset your password. Valid for 15 minutes.</p>
                <div style="background: #222; padding: 20px; border-radius: 10px; text-align: center;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #CCFF00;">{otp}</span>
                </div>
                <p style="font-size: 12px; color: #666; margin-top: 20px;">Your money. Alive.</p>
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
        print(f"❌ Mail Error: {e}")
        return False