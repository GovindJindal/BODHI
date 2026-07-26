from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
from core.config import settings

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Prevent MIME-sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # Prevent Clickjacking (complementary to frame-ancestors)
        response.headers["X-Frame-Options"] = "DENY"
        
        # Modern framing protection without breaking inline scripts
        response.headers["Content-Security-Policy"] = "frame-ancestors 'none';"
        
        # Prevent leaking path/queries to external domains
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Restrict browser features (configurable via settings)
        response.headers["Permissions-Policy"] = settings.permissions_policy
        
        # HSTS is only emitted for HTTPS requests
        # We check the scheme directly (which respects proxy headers if forwarded correctly)
        # or explicitly look for the X-Forwarded-Proto header.
        scheme = request.url.scheme
        forwarded_proto = request.headers.get("x-forwarded-proto", "")
        if scheme == "https" or forwarded_proto == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            
        return response
