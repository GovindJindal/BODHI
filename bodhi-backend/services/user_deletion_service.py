import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from models.core import User, Session
from services.auth_service import get_password_hash

logger = logging.getLogger(__name__)

async def anonymize_user(user: User, db: AsyncSession) -> None:
    """
    Soft-deletes a user by scrambling their PII and permanently locking their account,
    while preserving associated ledger entries for financial integrity.
    """
    deletion_time = datetime.now(timezone.utc)
    random_uuid = str(uuid.uuid4())
    
    # 1. Scramble PII
    user.email = f"deleted_{random_uuid}@bodhi.app"
    user.phone = f"deleted_{random_uuid}"[:20]
    user.full_name = "Deleted User"
    user.avatar_url = None
    
    # 2. Scramble Authentication Secrets
    # Instead of setting to NULL, we generate a random password hash so 
    # it passes any NOT NULL constraints but remains completely unguessable.
    random_pass = str(uuid.uuid4()) + str(uuid.uuid4())
    user.hashed_password = get_password_hash(random_pass)
    
    if user.admin_hashed_password:
        user.admin_hashed_password = get_password_hash(random_pass)
        
    user.m_pin = None
    user.u_pin = None
    user.is_mpin_set = False
    
    # 3. Disable Account & Mark Deleted
    user.is_active = False
    user.deleted_at = deletion_time
    user.verify_pass = None
    user.reset_otp = None
    user.reset_otp_expiry = None
    user.provider_id = None
    
    # 4. Revoke Active Sessions
    # Explicitly physically delete all sessions associated with this user
    # so that any active tokens immediately become invalid.
    await db.execute(delete(Session).where(Session.user_id == user.id))
    
    # Financial data (ledger, payments) is preserved due to not physically deleting the user row.
    logger.info(f"User {user.id} has been securely anonymized and soft-deleted.")
    # The caller is responsible for calling db.commit()
