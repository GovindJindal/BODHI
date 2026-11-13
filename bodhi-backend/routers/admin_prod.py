import jwt
import json
from datetime import timedelta, datetime, timezone
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, desc, or_
from pydantic import BaseModel, Field

from core.rate_limit import limiter

from database import get_db
from models.core import User, Ledger, Payment, AuditLog
from models.notification import Notification, NotificationType
from models.social import InvestmentGroup, TripWallet
from models.portfolio import Transaction as TradingTransaction
import uuid

from pydantic import EmailStr
from services.auth_service import (
    create_access_token, oauth2_scheme, SECRET_KEY, ALGORITHM,
    verify_password, get_password_hash,
)

router = APIRouter(prefix="/admin-v2", tags=["BODHI Production Admin"])

ADMIN_ROLES = ("super_admin", "admin", "support")


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None

# ── Dependencies ──

async def get_current_admin(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    """Verifies JWT and ensures the user has administrative privileges."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        if not user or user.deleted_at is not None or user.role not in ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="Access denied: Administrative privileges required")
            
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account suspended")
            
        return user
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

async def log_audit(db: AsyncSession, admin_id: str, action: str, target_id: Optional[str] = None, details: Optional[Dict] = None, ip: Optional[str] = None):
    """Internal helper to log administrative actions."""
    audit = AuditLog(
        admin_id=admin_id,
        action=action,
        target_id=target_id,
        details=json.dumps(details) if details else None,
        ip_address=ip
    )
    db.add(audit)
    await db.commit()

# ── Authentication ──

@router.post("/login")
@limiter.limit("10/minute")
async def admin_login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    email = form_data.username.strip().lower()
    result = await db.execute(select(User).where(func.lower(User.email) == email))
    user = result.scalar_one_or_none()

    stored_password = (user.admin_hashed_password or user.hashed_password) if user else None
    # Same message for unknown user / wrong role / wrong password, so emails can't be enumerated.
    if (
        not user
        or user.role not in ADMIN_ROLES
        or user.deleted_at is not None
        or not stored_password
        or not verify_password(form_data.password, stored_password)
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials or access level")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account suspended")
        
    access_token = create_access_token(
        data={"sub": user.email, "user_id": user.id, "role": user.role},
        expires_delta=timedelta(hours=12)
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "full_name": user.full_name
        }
    }

# ── Admin provisioning ──

class CreateAdminRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


@router.post("/create-admin", status_code=201)
async def create_admin(req: CreateAdminRequest, request: Request, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Create a dashboard-only admin account (super admins and admins only)."""
    if admin.role not in ("super_admin", "admin"):
        raise HTTPException(status_code=403, detail="Only admins can provision administrators")
    email = req.email.strip().lower()
    exists = await db.execute(select(User.id).where(func.lower(User.email) == email))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered. Promote the existing user instead.")

    new_admin = User(
        id=str(uuid.uuid4()),
        full_name=req.full_name.strip(),
        email=email,
        phone=f"admin-{uuid.uuid4().hex[:14]}",  # phone is required & unique; admins sign in by email
        admin_hashed_password=get_password_hash(req.password),
        role="admin",
        is_active=True,
    )
    db.add(new_admin)
    await log_audit(db, admin.id, "CREATE_ADMIN", target_id=new_admin.id, details={"email": email}, ip=_client_ip(request))
    return {"message": "Administrator created.", "admin_id": new_admin.id}

# ── Dashboard Statistics ──

@router.get("/stats")
async def get_system_stats(admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    """Aggregation endpoint for high-level dashboard telemetry."""
    users_count = await db.execute(select(func.count(User.id)))
    active_24h = await db.execute(select(func.count(User.id)).where(User.updated_at >= datetime.now(timezone.utc) - timedelta(days=1)))
    
    total_ledger = await db.execute(select(func.sum(Ledger.amount)))
    failed_payments = await db.execute(select(func.count(Payment.id)).where(Payment.status == "FAILED"))
    successful_payments_vol = await db.execute(select(func.sum(Payment.amount_paid)).where(Payment.status == "SUCCESS"))
    
    trip_count = await db.execute(select(func.count(TripWallet.id)))
    club_count = await db.execute(select(func.count(InvestmentGroup.id)))
    
    return {
        "users": {
            "total": users_count.scalar() or 0,
            "active_24h": active_24h.scalar() or 0
        },
        "financials": {
            "ledger_volume_paise": total_ledger.scalar() or 0,
            "failed_payments_count": failed_payments.scalar() or 0,
            "success_volume_paise": successful_payments_vol.scalar() or 0
        },
        "features": {
            "active_trips": trip_count.scalar() or 0,
            "venture_clubs": club_count.scalar() or 0
        }
    }

# ── User Management ──

@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    role: Optional[str] = None,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    query = select(User).where(User.deleted_at.is_(None)).order_by(desc(User.created_at))
    if search and search.strip():
        term = "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.where(or_(User.email.ilike(term), User.full_name.ilike(term), User.phone.ilike(term)))
    if role:
        query = query.where(User.role == role)
        
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()
    
    result = await db.execute(query.offset((page - 1) * limit).limit(limit))
    users = result.scalars().all()
    
    return {
        "total": total,
        "users": [
            {
                "id": u.id, "email": u.email, "full_name": u.full_name, 
                "role": u.role, "is_active": u.is_active, 
                "balance": u.balance, "created_at": u.created_at
            } for u in users
        ]
    }

@router.get("/users/{user_id}/activity")
async def get_user_activity(user_id: str, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    ledger_res = await db.execute(select(Ledger).where(Ledger.user_id == user_id).order_by(desc(Ledger.created_at)).limit(50))
    ledger_items = ledger_res.scalars().all()
    
    trading_res = await db.execute(select(TradingTransaction).where(TradingTransaction.user_id == user_id).order_by(desc(TradingTransaction.timestamp)).limit(20))
    trading_items = trading_res.scalars().all()
    
    return {
        "ledger": [
            {"id": l.id, "type": l.entry_type, "amount": l.amount, "ref": l.reference_type, "time": l.created_at} 
            for l in ledger_items
        ],
        "trading": [
            {"id": t.id, "type": t.type, "symbol": t.symbol, "val": t.total_value, "time": t.timestamp} 
            for t in trading_items
        ]
    }

@router.post("/users/{user_id}/toggle-status")
async def toggle_user_status(user_id: str, request: Request, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot change your own account status")
    if admin.role == "support":
        raise HTTPException(status_code=403, detail="Support staff cannot suspend accounts")
    if user.role in ADMIN_ROLES and admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only a super admin can change another admin's status")

    user.is_active = not user.is_active
    await log_audit(db, admin.id, "TOGGLE_USER_STATUS", target_id=user_id, details={"new_status": user.is_active}, ip=_client_ip(request))
    return {"id": user_id, "is_active": user.is_active}

# ── Transaction Ledger ──

@router.get("/ledger")
async def view_global_ledger(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    user_id: Optional[str] = None,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    query = select(Ledger).order_by(desc(Ledger.created_at))
    if user_id:
        query = query.where(Ledger.user_id == user_id)
        
    result = await db.execute(query.offset((page - 1) * limit).limit(limit))
    items = result.scalars().all()
    
    return [
        {
            "id": i.id, "user_id": i.user_id, "type": i.entry_type, 
            "amount": i.amount, "ref": i.reference_type, "status": i.status, 
            "time": i.created_at
        } for i in items
    ]

# ── Notifications ──

class BulkNotificationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=2000)
    target_role: Optional[str] = None
    user_ids: Optional[List[str]] = Field(None, max_length=10000)
    type: NotificationType = NotificationType.INFO

@router.post("/notifications/bulk")
async def send_bulk_notif(req: BulkNotificationRequest, r: Request, admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    if admin.role == "support":
        raise HTTPException(status_code=403, detail="Support staff cannot send bulk messages")
        
 
    # Only notify accounts that actually exist (unknown ids used to fail the FK and 500).
    query = select(User.id).where(User.deleted_at.is_(None))
    if req.user_ids:
        query = query.where(User.id.in_(set(req.user_ids)))
    elif req.target_role:
        query = query.where(User.role == req.target_role)
    target_ids = (await db.execute(query)).scalars().all()

    notifications = [
        Notification(user_id=uid, title=req.title, message=req.message, type=req.type)
        for uid in target_ids
    ]
    
    db.add_all(notifications)
    await log_audit(db, admin.id, "SEND_BULK_NOTIF", details={"count": len(target_ids), "title": req.title}, ip=_client_ip(r))
    return {"message": "Notifications queued", "recipients": len(target_ids)}

# ── Audit Logs ──

@router.get("/audit")
async def get_audit_logs(admin: User = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    if admin.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super-admin access required for audit logs")
        
    result = await db.execute(select(AuditLog).order_by(desc(AuditLog.created_at)).limit(100))
    logs = result.scalars().all()
    actor_ids = {log.admin_id for log in logs}
    actors = {}
    if actor_ids:
        rows = await db.execute(select(User.id, User.full_name, User.email).where(User.id.in_(actor_ids)))
        actors = {uid: (name or email) for uid, name, email in rows.all()}

    def _details(raw):
        if not raw:
            return None
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return {"text": raw}

    return [
        {
            "id": log.id,
            "timestamp": log.created_at,
            "actor": actors.get(log.admin_id, log.admin_id),
            "action": log.action,
            "target": log.target_id,
            "details": _details(log.details),
            "ip": log.ip_address,
        }
        for log in logs
    ]
