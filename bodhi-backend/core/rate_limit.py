import hashlib
import logging
from fastapi import Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from core.config import settings

logger = logging.getLogger(__name__)

def get_user_or_ip(request: Request) -> str:
    """
    Extracts a unique identifier for rate limiting.
    Prefers an authenticated user identifier (via token). Falls back to IP.
    """
    # 1. Check for authenticated user in request state
    if hasattr(request.state, "user") and request.state.user:
        if hasattr(request.state.user, "id"):
            return f"user:{request.state.user.id}"
        elif isinstance(request.state.user, dict) and "id" in request.state.user:
            return f"user:{request.state.user['id']}"

    # 2. Check for Authorization header (JWT)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        # Hash the token so we don't store raw tokens in memory/redis
        hashed_token = hashlib.sha256(token.encode()).hexdigest()
        return f"token:{hashed_token}"

    # 3. Fallback to IP address
    # Note: get_remote_address relies on X-Forwarded-For if present.
    # In a production environment, the edge proxy/load balancer MUST 
    # strip untrusted X-Forwarded-For headers to prevent spoofing.
    return f"ip:{get_remote_address(request)}"

def get_storage_uri() -> str:
    if settings.rate_limit_strategy == "redis" and settings.redis_url:
        return settings.redis_url
    return "memory://"

# Initialize the Limiter with a generous global default.
# Specific high-risk endpoints will receive stricter limits via @limiter.limit(...)
limiter = Limiter(
    key_func=get_user_or_ip,
    storage_uri=get_storage_uri(),
    enabled=settings.rate_limit_enabled,
    default_limits=["100/minute"]
)

def rate_limit_custom_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """
    Custom exception handler for RateLimitExceeded.
    Logs the violation (without sensitive data) and returns 429.
    """
    client_id = get_user_or_ip(request)
    # Log the abuse attempt
    logger.warning(
        f"Rate limit exceeded: {request.method} {request.url.path} "
        f"by {client_id}. Limit: {exc.detail}"
    )
    
    from fastapi.responses import JSONResponse
    response = JSONResponse(
        {"detail": f"Rate limit exceeded: {exc.detail}"}, status_code=429
    )
    # Standard RateLimit headers
    retry_after = 60
    if hasattr(exc, 'headers') and getattr(exc, 'headers') is not None:
        retry_after = exc.headers.get("Retry-After", 60)
    response.headers["Retry-After"] = str(retry_after)
    return response
