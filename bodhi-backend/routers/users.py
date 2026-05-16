from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

from database import get_db
from models.core import User
from models.manual_transaction import ManualTransaction
from services.auth_service import get_current_user, verify_password, get_password_hash

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
    if cleaned.startswith("http://") or cleaned.startswith("https://") or cleaned.startswith("/"):
        return cleaned
    return None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    current_password: str

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

@router.get("/me", response_model=UserProfile)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    # GAP ID = username.{first letter of domain}.gap
    # e.g. harshit@gmail.com → harshit.g.gap, harshit@chitkara.edu.in → harshit.c.gap
    gap_id = build_gap_id(current_user.email)
    display_name = (current_user.full_name or "").strip() or "User"

    user_profile = UserProfile(
        id=current_user.id,
        email=current_user.email,
        full_name=display_name,
        phone=current_user.phone,
        age=current_user.age,
        gender=current_user.gender,
        has_password=current_user.hashed_password is not None,
        avatar_url=sanitize_avatar_url(current_user.avatar_url),
        gap_id=gap_id,
        balance=current_user.balance
    )
    return user_profile

@router.put("/me", response_model=UserProfile)
async def update_my_profile(
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    print(f"DEBUG: Updating profile for user {current_user.email}")
    # Determine the target hash to verify against (M-PIN is preferred for profile edits)
    target_hash = current_user.m_pin if current_user.m_pin else current_user.hashed_password
    print(f"DEBUG: Target hash exists: {bool(target_hash)}")
    
    # Only verify if a target hash exists (local users)
    # OAuth users with no PIN yet are allowed to update
    if target_hash and not verify_password(user_data.current_password, target_hash):
        print("DEBUG: Profile update verification FAILED")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect M-PIN. Update failed.",
        )
    
    if user_data.full_name is not None:
        current_user.full_name = user_data.full_name
    if user_data.phone is not None:
        current_user.phone = user_data.phone
    if user_data.age is not None:
        current_user.age = user_data.age
    if user_data.gender is not None:
        current_user.gender = user_data.gender
        
    await db.commit()
    await db.refresh(current_user)
    
    return UserProfile(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        phone=current_user.phone,
        age=current_user.age,
        gender=current_user.gender,
        has_password=current_user.hashed_password is not None
    )

# @router.delete("/me", status_code=status.HTTP_200_OK)
# async def delete_my_account(
#     data: AccountDelete,
#     db: AsyncSession = Depends(get_db),
#     current_user: User = Depends(get_current_user)
# ):
#     # Verify password before deletion
#     if not verify_password(data.password, current_user.hashed_password):
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Incorrect password. Deletion cancelled.",
#         )
#     
#     await db.delete(current_user)
#     await db.commit()
#     return {"message": "Account deleted successfully."}

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
    print(f"DEBUG: Verifying M-PIN for user {current_user.email}")
    print(f"DEBUG: Received M-PIN: {data.password}")
    
    # Handle OAuth users who haven't set a local M-PIN/Password yet
    if not current_user.m_pin and not current_user.hashed_password:
        print("DEBUG: OAuth user with no PIN - Auto-success")
        return {"success": True, "method": "oauth"}

    target_hash = current_user.m_pin if current_user.m_pin else current_user.hashed_password
    print(f"DEBUG: Target hash exists: {bool(target_hash)}")

    if not target_hash or not verify_password(data.password, target_hash):
        print("DEBUG: Verification FAILED")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect M-PIN.",
        )
    
    print("DEBUG: Verification SUCCESS")
    return {"success": True}

from fastapi import File, UploadFile
import os
import shutil

@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # In a real app, upload to S3. For now, local storage or just a mock URL.
    # We'll save to a 'static/avatars' folder
    os.makedirs("static/avatars", exist_ok=True)
    file_path = f"static/avatars/{current_user.id}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update user in DB
    # For now, let's just use a placeholder URL or the local path if served
    avatar_url = f"/static/avatars/{current_user.id}_{file.filename}"
    current_user.avatar_url = avatar_url
    await db.commit()
    
    return {"avatar_url": avatar_url}


# ─────────────────────────────────────────────────────────────
# Manual Transactions (Voice-logged cash/offline transactions)
# ─────────────────────────────────────────────────────────────

class ManualTransactionCreate(BaseModel):
    merchant: str
    category: str
    amount: float
    type: str = "DEBIT"
    note: Optional[str] = None  # original transcript

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
        amount=data.amount,
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
    )
    return result.scalars().all()
