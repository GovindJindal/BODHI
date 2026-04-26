import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://postgres:Govindj05022008@bodhi-db.cb4aeyie8gkd.ap-south-1.rds.amazonaws.com:5432/bodhi"

async def migrate():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        print("Starting manual migration check...")
        try:
            # Check existing columns
            res = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users'"))
            cols = [r[0] for r in res.fetchall()]
            print(f"Current columns in 'users': {cols}")
            
            new_cols = [
                ("role", "VARCHAR(50) DEFAULT 'user'"),
                ("admin_hashed_password", "VARCHAR(255)"),
                ("reset_otp", "VARCHAR(20)"),
                ("reset_otp_expiry", "TIMESTAMP WITH TIME ZONE")
            ]
            
            for col_name, col_type in new_cols:
                if col_name not in cols:
                    print(f"Adding column {col_name}...")
                    await conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                else:
                    print(f"Column {col_name} already exists.")
            
            print("Migration complete!")
        except Exception as e:
            print(f"Migration failed: {e}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
