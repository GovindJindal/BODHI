import base64
import re
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models.core import User
from models.manual_transaction import ManualTransaction
from services.auth_service import get_current_user, verify_password

router = APIRouter()


def build_gap_id(email: str) -> str:
    parts = (email or "").lower().split("@")
    username = parts[0] if parts and parts[0] else "user"
    domain_initial = parts[1][0] if len(parts) > 1 and parts[1] else "x"
    return f"{username}.{domain_initial}.gap"


def sanitize_avatar_url(avatar_url: Optional[str]) -> Optional[str]:
    if not avatar_url or not isinstance(avatar_url, str):
        return None
    cleaned = avatar_url.strip()
    if not cleaned:
        return None
    if cleaned.startswith(("http://", "https://", "/", "data:image/")):
        return cleaned
    return None


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=20)
    age: Optional[int] = Field(default=None, ge=13, le=120)
    gender: Optional[str] = Field(default=None, max_length=20)
    current_password: str

    @field_validator("full_name")
    @classmethod
    def _name(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip() if v else v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        if v is not None and len(re.sub(r"\D", "", v)) < 10:
            raise ValueError("Enter a valid 10-digit phone number")
        return v.strip() if v else v

class AccountDelete(BaseModel):
    password: str

class VerifyPasswordRequest(BaseModel):
    password: str

class UserProfile(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    phone: Optional[str]
    age: Optional[int]
    gender: Optional[str]
    has_password: bool
    avatar_url: Optional[str] = None
    gap_id: Optional[str] = None
    balance: float = 0.0

def _profile(user: User) -> UserProfile:
    # GAP ID = username.{first letter of domain}.gap
    # e.g. harshit@gmail.com → harshit.g.gap, harshit@chitkara.edu.in → harshit.c.gap
    phone = user.phone if user.phone and not user.phone.startswith("oauth-") else None
    return UserProfile(
        id=user.id,
        email=user.email,
        full_name=(user.full_name or "").strip() or "User",
        phone=phone,
        age=user.age,
        gender=user.gender,
        has_password=user.hashed_password is not None,
        avatar_url=sanitize_avatar_url(user.avatar_url),
        gap_id=build_gap_id(user.email),
        balance=user.balance,
    )


@router.get("/me", response_model=UserProfile)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    return _profile(current_user)

@router.put("/me", response_model=UserProfile)
async def update_my_profile(
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Determine the target hash to verify against (M-PIN is preferred for profile edits)
    target_hash = current_user.m_pin if current_user.m_pin else current_user.hashed_password
    # Only verify if a target hash exists (local users)
    # OAuth users with no PIN yet are allowed to update
    if target_hash and not verify_password(user_data.current_password, target_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect M-PIN. Update failed.",
        )
    
    if user_data.full_name is not None:
        current_user.full_name = user_data.full_name
    if user_data.phone is not None and user_data.phone != current_user.phone:
        digits = re.sub(r"\D", "", user_data.phone)[-10:]
        taken = await db.scalar(
            select(User.id).where(
                or_(User.phone == user_data.phone, User.phone.like(f"%{digits}")),
                User.id != current_user.id,
            ).limit(1)
        )
        if taken:
            raise HTTPException(status_code=400, detail="That phone number is already registered.")
        current_user.phone = user_data.phone
    if user_data.age is not None:
        current_user.age = user_data.age
    if user_data.gender is not None:
        current_user.gender = user_data.gender
        
    await db.commit()
    await db.refresh(current_user)
    return _profile(current_user)

@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_my_account(
    data: AccountDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Soft-delete your own account. Irreversible.
    Requires password confirmation.
    """
    # OAuth-only accounts have no PIN; their valid session is the proof of identity.
    if current_user.hashed_password and not verify_password(data.password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect M-PIN.")
        
    from services.user_deletion_service import anonymize_user
    await anonymize_user(current_user, db)
    await db.commit()
    return {"message": "Account successfully deleted and anonymized."}

@router.post("/verify")
async def verify_user_password(
    data: VerifyPasswordRequest,
    current_user: User = Depends(get_current_user)
):
    """Simple endpoint to verify the current user's password."""
    if current_user.hashed_password is None:
        # OAuth user: auto-succeed because they have a valid session and no set password
        return {"success": True, "method": "oauth"}

    if not verify_password(data.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password.",
        )
    return {"success": True}

@router.post("/verify-mpin")
async def verify_mpin(
    data: VerifyPasswordRequest,
    current_user: User = Depends(get_current_user)
):
    """Specific endpoint to verify M-PIN."""
    # OAuth users who haven't set a local M-PIN yet
    if not current_user.m_pin and not current_user.hashed_password:
        return {"success": True, "method": "oauth"}

    target_hash = current_user.m_pin or current_user.hashed_password
    if not verify_password(data.password, target_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect M-PIN.")
    return {"success": True}


MAX_AVATAR_BYTES = 1024 * 1024  # 1 MB
_IMAGE_SIGNATURES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"RIFF": "image/webp",
}


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Store the avatar inline as a data URI.

    Works on Lambda (read-only filesystem) and never touches the disk, which
    also removes the old path-traversal risk from user-supplied filenames.
    """
    data = await file.read(MAX_AVATAR_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="Image must be smaller than 1 MB")
    mime = next((m for sig, m in _IMAGE_SIGNATURES.items() if data.startswith(sig)), None)
    if mime is None:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG or WebP images are supported")

    avatar_url = f"data:{mime};base64,{base64.b64encode(data).decode()}"
    current_user.avatar_url = avatar_url
    await db.commit()
    return {"avatar_url": avatar_url}


# ─────────────────────────────────────────────────────────────
# Manual Transactions (Voice-logged cash/offline transactions)
# ─────────────────────────────────────────────────────────────

class ManualTransactionCreate(BaseModel):
    merchant: str = Field(..., min_length=1, max_length=100)
    category: str = Field(..., min_length=1, max_length=50)
    amount: float = Field(..., gt=0, le=10_000_000)
    type: Literal["DEBIT", "CREDIT"] = "DEBIT"
    note: Optional[str] = None  # original transcript (truncated to the 500-char column)

    @field_validator("note")
    @classmethod
    def _truncate_note(cls, v):
        return v[:500] if v else v

    @field_validator("merchant", "category", mode="before")
    @classmethod
    def _clip(cls, v):
        return str(v).strip()[:100] if v is not None else v

    @field_validator("type", mode="before")
    @classmethod
    def _upper(cls, v):
        return str(v).upper() if v else "DEBIT"

class ManualTransactionRead(BaseModel):
    id: str
    merchant: str
    category: str
    amount: float
    type: str
    note: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("/transactions", response_model=ManualTransactionRead, status_code=status.HTTP_201_CREATED)
async def add_manual_transaction(
    data: ManualTransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a cash/offline transaction that was voice-logged via the AI agent."""
    tx = ManualTransaction(
        user_id=current_user.id,
        merchant=data.merchant,
        category=data.category,
        amount=round(data.amount, 2),
        type=data.type,
        note=data.note,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return tx


@router.get("/transactions", response_model=List[ManualTransactionRead])
async def list_manual_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch all manually-logged transactions for the current user (newest first)."""
    result = await db.execute(
        select(ManualTransaction)
        .where(ManualTransaction.user_id == current_user.id)
        .order_by(ManualTransaction.created_at.desc())
        .limit(500)
    )
    return result.scalars().all()
