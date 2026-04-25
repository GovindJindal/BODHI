import os
import jwt
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List, Dict, Any

from database import get_db
from models.core import User, Ledger, Payment
from models.notification import Notification, NotificationType
from services.auth_service import (
    create_access_token, oauth2_scheme, SECRET_KEY, ALGORITHM, pwd_context, get_password_hash, verify_password, send_otp_email
)
from pydantic import BaseModel, EmailStr
import random
from datetime import datetime, timezone

router = APIRouter(prefix="/admin", tags=["Admin System"])

# ───────────────────────────────────────────────────────────────────────
# Dependency: Admin Verification
# ───────────────────────────────────────────────────────────────────────
async def get_current_admin(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    """Validates JWT and explicitly requires the 'admin' role."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        
        if role != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: You do not have admin access.")
            
        # Verify user exists and role matches DB
        result = await db.execute(select(User).where(User.email == username))
        admin_user = result.scalar_one_or_none()
        
        if not admin_user or admin_user.role != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: Admin account invalid.")
            
        return admin_user
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# ───────────────────────────────────────────────────────────────────────
# 1. Authentication (/login)
# ───────────────────────────────────────────────────────────────────────
@router.post("/login")
async def admin_login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """Handles administrator secure login returning JWTs with embedded roles."""
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user or not user.admin_hashed_password or not verify_password(form_data.password, user.admin_hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if user.role != "admin" or not user.is_active:
        raise HTTPException(status_code=403, detail="Not authorized as an administrator.")
        
    access_token_expires = timedelta(hours=24)
    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.id, "role": user.role}, 
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

class AdminPasswordResetRequest(BaseModel):
    email: EmailStr

class AdminPasswordResetConfirm(BaseModel):
    email: EmailStr
    otp: str
    new_password: str

@router.post("/forgot-password")
async def request_admin_password_reset(request: AdminPasswordResetRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()
    
    # We only allow admin users to reset via this admin-specific endpoint
    if user and user.role == "admin":
        otp = str(random.randint(100000, 999999))
        user.reset_otp = otp
        user.reset_otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
        await db.commit()
        send_otp_email(user.email, otp)
    
    return {"message": "If an admin account exists with that email, a reset code has been sent."}

@router.post("/reset-password")
async def confirm_admin_password_reset(request: AdminPasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()
    
    if not user or user.role != "admin":
        raise HTTPException(status_code=404, detail="Admin account not found")
        
    if not user.reset_otp or user.reset_otp != request.otp:
        raise HTTPException(status_code=400, detail="Invalid reset code")
        
    if user.reset_otp_expiry and datetime.now(timezone.utc) > user.reset_otp_expiry:
        raise HTTPException(status_code=400, detail="Reset code has expired")
        
    # Update explicitly the admin_hashed_password
    user.admin_hashed_password = get_password_hash(request.new_password)
    user.reset_otp = None
    user.reset_otp_expiry = None
    
    await db.commit()
    return {"message": "Admin password updated successfully"}

# ───────────────────────────────────────────────────────────────────────
# 2. Users Management
# ───────────────────────────────────────────────────────────────────────
@router.get("/users")
async def get_all_users(skip: int = 0, limit: int = 50, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Return all users for management."""
    result = await db.execute(select(User).order_by(User.created_at.desc()).offset(skip).limit(limit))
    users = result.scalars().all()
    
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "balance": u.balance,
            "created_at": u.created_at
        } for u in users
    ]

@router.delete("/user/{user_id}")
async def delete_user(user_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Permanently delete a user."""
    if user_id == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own active admin account.")
        
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    await db.delete(user)
    await db.commit()
    return {"message": f"User {user.email} successfully deleted"}

@router.get("/user/{user_id}")
async def get_specific_user(user_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Return specific user details."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "balance": user.balance,
        "created_at": user.created_at
    }

@router.get("/users/search")
async def search_users(q: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Search users by email prefix."""
    result = await db.execute(select(User).where(User.email.ilike(f"%{q}%")).limit(20))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active
        } for u in users
    ]

# ───────────────────────────────────────────────────────────────────────
# 3. Roles and Core Admin Privileges
# ───────────────────────────────────────────────────────────────────────
@router.put("/make-admin/{user_id}")
async def promote_user(user_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Promote user → role = admin"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.role = "admin"
    await db.commit()
    return {"message": f"User {user.email} successfully promoted to administrator."}

@router.put("/remove-admin/{user_id}")
async def demote_admin(user_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Demote admin → role = user"""
    if user_id == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot strip your own admin privileges.")
        
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.role = "user"
    await db.commit()
    return {"message": f"User {user.email} stripped of administrator privileges."}

class CreateAdminRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str

@router.post("/create-admin")
async def create_admin(req: CreateAdminRequest, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Create a new root administrator directly."""
    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered in system. Use Promote action instead.")
        
    new_admin = User(
        full_name=req.full_name,
        email=req.email,
        admin_hashed_password=get_password_hash(req.password),
        role="admin",
        is_active=True
    )
    db.add(new_admin)
    await db.commit()
    
    return {"message": "Administrator natively minted.", "admin_id": new_admin.id}

# ───────────────────────────────────────────────────────────────────────
# 4. Dashboard Statistics
# ───────────────────────────────────────────────────────────────────────
@router.get("/dashboard")
async def get_dashboard_stats(admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Return summary stats."""
    std_users = await db.execute(select(func.count(User.id)).where(User.role == "user"))
    total_users = std_users.scalar()
    
    admin_users = await db.execute(select(func.count(User.id)).where(User.role == "admin"))
    total_admins = admin_users.scalar()
    
    balance_res = await db.execute(select(func.sum(User.balance)))
    total_balance = balance_res.scalar() or 0.0
    
    tx_res = await db.execute(select(func.count(Ledger.id)))
    total_txns = tx_res.scalar() or 0
    
    active_res = await db.execute(select(func.count(User.id)).where(User.is_active == True))
    active_users = active_res.scalar() or 0
    
    return {
        "total_users": total_users,
        "total_admins": total_admins,
        "total_balance_pool": total_balance,
        "total_transactions": total_txns,
        "active_users": active_users
    }

# ───────────────────────────────────────────────────────────────────────
# 5. External Utility Endpoints (Preserved)
# ───────────────────────────────────────────────────────────────────────
@router.get("/transactions")
async def list_transactions(skip: int = 0, limit: int = 50, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(select(Ledger).order_by(Ledger.created_at.desc()).offset(skip).limit(limit))
    txs = result.scalars().all()
    return [
        {
            "id": t.id, "user_id": t.user_id, "amount": t.amount / 100, 
            "status": t.status, "created_at": t.created_at
        } for t in txs
    ]

@router.put("/toggle-active/{user_id}")
async def toggle_user_active(user_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    await db.commit()
    return {"status": "success", "user": user.email, "is_active": user.is_active}

class SendNotificationRequest(BaseModel):
    user_ids: List[str] = []
    send_to_all: bool = False
    title: str
    message: str
    type: str = "INFO"

@router.post("/notifications/send")
async def send_admin_notification(req: SendNotificationRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    if req.send_to_all:
        users_result = await db.execute(select(User.id))
        target_ids = users_result.scalars().all()
    else:
        target_ids = req.user_ids

    if not target_ids:
        raise HTTPException(status_code=400, detail="No users selected.")

    notifications = [
        Notification(user_id=uid, title=req.title, message=req.message, type=NotificationType(req.type))
        for uid in target_ids
    ]
    
    db.add_all(notifications)
    await db.commit()
    return {"message": f"Successfully sent notifications to {len(target_ids)} users"}


