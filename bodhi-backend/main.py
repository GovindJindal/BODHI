from routers.oauth import router as oauth_router
from fastapi import FastAPI
from services.scheduler import scheduler
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from fastapi.security import OAuth2PasswordBearer
import asyncio

# Database & Models
from database import engine, Base
import models.portfolio
import models.social  # This ensures the Social tables get registered to the Base

# Routers
from routers import auth, trade, search, prices, simulate, social, ai
from routers.social import router as social_router
from routers import payments, insurance, wallets, expenses

import models.wallets
import models.expenses
import models.payments

# 1. Lifespan (Building the database and starting services)
async def init_db():
    print("Building database tables...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("Tables built successfully!")
    except Exception as e:
        print(f"Error building database: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fire and forget DB initialization to allow instant server startup
    asyncio.create_task(init_db())
    
    # Start the background AMO processor
    try:
        scheduler.start()
        print("🤖 Trading Scheduler Started")
    except Exception as e:
        print(f"Error starting scheduler: {e}")
        
    yield
    
    # Shutdown scheduler
    try:
        scheduler.shutdown()
        print("🤖 Trading Scheduler Shutdown")
    except Exception as e:
        print(f"Error shutting down scheduler: {e}")

# 2. CRITICAL: Create the app!
app = FastAPI(
    title="BODHI API",
    version="1.0.0",
    lifespan=lifespan,
    # This adds the global lock icon to the UI
    swagger_ui_parameters={"persistAuthorization": True} 
)

@app.get("/", tags=["Health"])
async def health_check():
    return {"status": "ok"}

# 3. Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SECURITY DEFINITION ---
# This tells FastAPI how to handle the lock icon and token injection
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# 4. NOW we attach all the routers
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(trade.router, prefix="/trade", tags=["Trade"])
app.include_router(search.router, prefix="/search", tags=["Search"])
app.include_router(prices.router, prefix="/price", tags=["Prices"])
app.include_router(simulate.router, prefix="/simulate", tags=["Simulate"])

# And here is your social router, safely placed AFTER the app exists!
app.include_router(social_router, prefix="/social", tags=["Social"])
app.include_router(payments.router)
app.include_router(insurance.router)
app.include_router(wallets.router)
app.include_router(expenses.router)
app.include_router(oauth_router, tags=["oauth"])
app.include_router(ai.router)