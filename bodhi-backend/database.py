from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
import os
from dotenv import load_dotenv
from core.config import settings

load_dotenv()

DATABASE_URL = settings.database_url
SENDER_PASSWORD = settings.sender_password or settings.smtp_password or ""

try:
    if DATABASE_URL:
        # Mask password for logging
        masked_url = DATABASE_URL
        if "@" in DATABASE_URL:
            parts = DATABASE_URL.split("@")
            prefix = parts[0].split(":")[0] + ":****" if ":" in parts[0] else "****"
            masked_url = prefix + "@" + parts[1]
        print(f"📡 Connecting to: {masked_url}")
        
        connect_args = {}
        # Generic Managed PostgreSQL SSL handling (RDS, Neon, Supabase, Render)
        if "sslmode=require" in DATABASE_URL or ("localhost" not in DATABASE_URL and "127.0.0.1" not in DATABASE_URL):
            import ssl
            # Use the default context which securely verifies certificates
            ssl_context = ssl.create_default_context()
            connect_args["ssl"] = ssl_context
            
            # Remove sslmode=require from the URL so SQLAlchemy doesn't complain
            DATABASE_URL = DATABASE_URL.replace("?sslmode=require", "").replace("&sslmode=require", "")
            
        # Lambda specific connection pooling
        is_lambda = os.environ.get("AWS_EXECUTION_ENV") is not None
        
        if is_lambda:
            engine = create_async_engine(
                DATABASE_URL, 
                echo=False,
                pool_pre_ping=True,
                pool_size=1,
                max_overflow=0,
                pool_recycle=300,
                connect_args=connect_args
            )
        else:
            engine = create_async_engine(
                DATABASE_URL, 
                echo=False,
                pool_pre_ping=True,
                pool_size=settings.db_pool_size,
                max_overflow=settings.db_max_overflow,
                pool_recycle=settings.db_pool_recycle,
                connect_args=connect_args
            )
        AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    else:
        print("⚠️ WARNING: DATABASE_URL is missing!")
        engine = None
        AsyncSessionLocal = None
except Exception as e:
    print(f"❌ Failed to create engine: {e}")
    engine = None
    AsyncSessionLocal = None

Base = declarative_base()

# Dependency to get the database session in your routers
async def get_db():
    if AsyncSessionLocal is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Database uninitialized. Missing DATABASE_URL environment variable.")
    async with AsyncSessionLocal() as session:
        yield session
