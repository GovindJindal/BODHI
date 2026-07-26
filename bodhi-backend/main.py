import os
from routers.oauth import router as oauth_router
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles
from services.scheduler import scheduler
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from fastapi.security import OAuth2PasswordBearer
import asyncio
from core.middleware import SecurityHeadersMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from core.rate_limit import limiter, rate_limit_custom_handler
import logging
from core.config import settings

logger = logging.getLogger(__name__)

# Database & Models
from database import engine, Base
import models.portfolio
import models.social        # Social Hub tables
import models.collaboration # Scoped collaboration (Chat, Polls)

# Routers
from routers import auth, trade, search, prices, simulate, social, ai, notification, travel
from routers.social import router as social_router
from routers.collaboration import router as collaboration_router
from routers import payments, insurance, wallets, expenses, users, subscriptions
from routers import transfers, admin, admin_prod

import models.wallets
import models.expenses
import models.payments
import models.notification
import models.manual_transaction  # AI voice-logged cash transactions


# ── Background DB init (non-blocking) ──────────────────────────────────────────
# We run table creation as a fire-and-forget background task so the app
# is immediately available to serve health checks. This prevents 502 errors
# during Elastic Beanstalk cold starts when RDS is slow to accept connections.
db_initialized = False

async def init_db():
    global db_initialized
    if db_initialized:
        return
        
    try:
        logger.info("⏳ Running DB table sync…")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            
            # Safe schema upgrade for 'role' string pattern and admin features
            from sqlalchemy import text
            try:
                await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user'"))
                await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_pass VARCHAR(255)"))
                await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_hashed_password VARCHAR(255)"))
                await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp VARCHAR(20)"))
                await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_expiry TIMESTAMP WITH TIME ZONE"))
                
                # Check for AuditLog table explicitly if needed, but Base.metadata.create_all does it.
            except Exception as e:
                logger.error(f"❌ Migration error: {e}")
                pass
                
        logger.info("✅ DB tables synced successfully.")
        db_initialized = True
    except Exception as e:
        logger.error(f"❌ DB init failed: {e}")


# 1. Lifespan – Lambda-compatible startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    is_lambda = os.environ.get("AWS_EXECUTION_ENV") is not None

    if is_lambda:
        # In Lambda, run synchronously to ensure it finishes before serving requests
        await init_db()
    else:
        # On local/EC2, run in background
        asyncio.create_task(init_db())
        
        # Only start APScheduler on long-running instances
        try:
            scheduler.start()
            logger.info("🤖 Trading Scheduler Started")
        except Exception as e:
            logger.warning(f"⚠️ Scheduler failed to start: {e}")

    yield  # App is now running and serving requests

    # Shutdown
    if not is_lambda:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass


# 2. CRITICAL: Create the app!
app = FastAPI(
    title="BODHI API",
    version="1.0.0",
    description="BODHI Fintech Super App – Backend API",
    lifespan=lifespan,
    docs_url=None,   # We override below with a CDN that works on restricted networks
    openapi_url="/openapi.json",
    redoc_url="/redoc",
    swagger_ui_parameters={"persistAuthorization": True},
)

# Ensure static directory exists
if not os.path.exists("static"):
    os.makedirs("static")

# Serve static files (avatars, etc.)
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# Professional Admin Panel URLs (Clean routes without .html)
from fastapi.responses import HTMLResponse

def get_admin_html(filename):
    file_path = os.path.join(BASE_DIR, "static", "admin", filename)
    # Support relative paths within static/
    if filename.startswith("../"):
        file_path = os.path.normpath(os.path.join(BASE_DIR, "static", "admin", filename))
    
    try:
        with open(file_path, "r") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(content="Not Found", status_code=404)

@app.get("/staff/login", include_in_schema=False)
async def get_login(): return get_admin_html("login.html")

@app.get("/staff/index", include_in_schema=False)
@app.get("/staff", include_in_schema=False)
async def get_index(): return get_admin_html("index.html")

@app.get("/staff/create", include_in_schema=False)
async def get_create(): return get_admin_html("create.html")

@app.get("/staff/users", include_in_schema=False)
async def get_users(): return get_admin_html("users.html")

# Pro-tier Next.js Admin Portal
@app.get("/admin-pro", include_in_schema=False)
@app.get("/admin-pro/index", include_in_schema=False)
async def get_pro_index():
    return get_admin_html("../pro-admin/index.html")

@app.get("/admin-pro/login", include_in_schema=False)
async def get_pro_login():
    return get_admin_html("../pro-admin/login.html")

@app.get("/admin-pro/users", include_in_schema=False)
async def get_pro_users():
    return get_admin_html("../pro-admin/users.html")

@app.get("/admin-pro/ledger", include_in_schema=False)
async def get_pro_ledger():
    return get_admin_html("../pro-admin/ledger.html")

@app.get("/admin-pro/audit", include_in_schema=False)
async def get_pro_audit():
    return get_admin_html("../pro-admin/audit.html")

@app.get("/admin-pro/notifications", include_in_schema=False)
async def get_pro_notifications():
    return get_admin_html("../pro-admin/notifications.html")

# Mount /_next and other assets for the pro-admin dashboard
app.mount("/_next", StaticFiles(directory=os.path.join(BASE_DIR, "static", "pro-admin", "_next")), name="pro_next")
app.mount("/admin-pro/static", StaticFiles(directory=os.path.join(BASE_DIR, "static", "pro-admin")), name="pro_static")

# Mount /staff for assets (CSS/JS are passed through since they don't match the explicit routes above)
app.mount("/staff", StaticFiles(directory=os.path.join(BASE_DIR, "static", "admin")), name="staff_assets")

import time
import json
from fastapi import Request

@app.middleware("http")
async def json_logging_middleware(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    latency_ms = round((time.time() - start_time) * 1000, 2)
    
    # Exclude health endpoints from clogging CloudWatch
    if request.url.path not in ["/health/live", "/health/ready", "/"]:
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "latency_ms": latency_ms,
            "ip": request.client.host if request.client else "unknown"
        }
        if response.status_code >= 500:
            logger.error(json.dumps(log_data))
        elif response.status_code >= 400:
            logger.warning(json.dumps(log_data))
        else:
            logger.info(json.dumps(log_data))
            
    return response

# 3. Standard Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_custom_handler)

# --- SECURITY DEFINITION ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

# Custom /docs endpoint using unpkg.com CDN
@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="BODHI API – Swagger UI",
        swagger_js_url="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js",
        swagger_css_url="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css",
        swagger_ui_parameters={"persistAuthorization": True},
    )

# Health check endpoints for ALB/API Gateway
@app.get("/", tags=["Health"])
@limiter.exempt
async def health_check(request: Request):
    user_agent = request.headers.get("user-agent", "")
    if "ELB-HealthChecker" in user_agent or "curl" in user_agent.lower() or "postman" in user_agent.lower() or "AmazonAPIGateway" in user_agent:
        return {"status": "alive", "message": "BODHI API is running"}
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/staff/login")

@app.get("/health/live", tags=["Health"], include_in_schema=False)
@limiter.exempt
async def health_live():
    return {"status": "ok"}

@app.get("/health/ready", tags=["Health"], include_in_schema=False)
@limiter.exempt
async def health_ready():
    # Robust check: Try querying the DB using the active engine
    if engine:
        try:
            from sqlalchemy import text
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return {"status": "ready", "db": "connected"}
        except Exception as e:
            logger.error(f"Health check DB failure: {e}")
            return {"status": "unavailable", "db": "error"}, 503
    return {"status": "unavailable"}, 503


# 4. Attach all routers
app.include_router(auth.router,         prefix="/auth",          tags=["Authentication"])
app.include_router(trade.router,        prefix="/trade",         tags=["Trade"])
app.include_router(search.router,       prefix="/search",        tags=["Search"])
app.include_router(prices.router,       prefix="/price",         tags=["Prices"])
app.include_router(simulate.router,     prefix="/simulate",      tags=["Simulate"])
app.include_router(social_router,       prefix="/social",        tags=["Social"])
app.include_router(payments.router)
app.include_router(insurance.router)
app.include_router(wallets.router)
app.include_router(expenses.router)
app.include_router(subscriptions.router)
app.include_router(oauth_router,                                 tags=["OAuth"])
app.include_router(ai.router)
app.include_router(notification.router, prefix="/notifications", tags=["Notifications"])
app.include_router(users.router,        prefix="/users",         tags=["Users"])
app.include_router(travel.router,       prefix="/travel",        tags=["Travel"])
app.include_router(transfers.router)
app.include_router(collaboration_router, prefix="/collaboration", tags=["Collaboration"])
app.include_router(admin.router)
app.include_router(admin_prod.router)
