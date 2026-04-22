from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")

<<<<<<< Updated upstream
engine = create_async_engine(DATABASE_URL, echo=True)
=======
engine = create_async_engine(DATABASE_URL, echo=True, pool_pre_ping=True, connect_args={"timeout": 60})
>>>>>>> Stashed changes
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

# Dependency to get the database session in your routers
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
