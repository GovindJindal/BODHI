from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
SECRET_KEY = os.getenv("SECRET_KEY", "fallback_secret")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD", "")

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
        # RDS SSL handling
        if "rds.amazonaws.com" in DATABASE_URL:
            import ssl
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            connect_args["ssl"] = ssl_context
            
        engine = create_async_engine(
            DATABASE_URL, 
            echo=False,  # Turn off echo to avoid bloating logs
            pool_pre_ping=True,
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
