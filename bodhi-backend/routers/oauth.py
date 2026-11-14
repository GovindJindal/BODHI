"""
BODHI Fintech App – Phase 3: FastAPI OAuth Endpoints
POST /auth/google  and  POST /auth/apple

Security contract
─────────────────
• We NEVER trust the email or name that the frontend sends.
• We ONLY trust what the verified token payload contains.
• Google  → verify id_token with google-auth library (checks sig + aud + exp).
• Apple   → verify identityToken with PyJWT + Apple's public JWKS endpoint.
"""

# ─────────────────────────────────────────────────────────────────────────────
# requirements to add to requirements.txt
# ─────────────────────────────────────────────────────────────────────────────
REQUIREMENTS = """
# Existing deps (assumed)
fastapi>=0.110.0
sqlalchemy[asyncio]>=2.0
asyncpg
python-jose[cryptography]       # your existing JWT lib
pydantic>=2.0
uvicorn

# NEW for OAuth
google-auth>=2.28.0             # verifies Google id_token
PyJWT>=2.8.0                    # verifies Apple identityToken
cryptography>=42.0              # PyJWT RS256 support
httpx>=0.27.0                   # async HTTP – fetch Apple JWKS
cachetools>=5.3.0               # cache Apple public keys (avoid hammering Apple)
"""

# ─────────────────────────────────────────────────────────────────────────────
# Imports
# ─────────────────────────────────────────────────────────────────────────────

import uuid
from typing import Any, Optional

import httpx
import jwt as pyjwt
from cachetools import TTLCache
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# ── YOUR ACTUAL PROJECT IMPORTS ─────────────────────────────
from database import get_db
from models.core import AuthProvider, User
from services.auth_service import issue_session_tokens

router = APIRouter(prefix="/auth", tags=["auth"])

# ─────────────────────────────────────────────────────────────────────────────
# Pydantic I/O schemas
# ─────────────────────────────────────────────────────────────────────────────
class GoogleSignInRequest(BaseModel):
    id_token: str

class AppleSignInRequest(BaseModel):
    identity_token: str
    full_name: Optional[str] = None

class OAuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_new_user: bool
    refresh_token: Optional[str] = None
    session_id: Optional[str] = None
    full_name: Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# Settings expected in your config (add these to your .env / Settings class)
# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
# Settings – read from environment (set these in .env / EB config)
# ─────────────────────────────────────────────────────────────────────────────
from core.config import settings
GOOGLE_CLIENT_ID_IOS      = settings.google_client_id_ios or ""
GOOGLE_CLIENT_ID_ANDROID  = settings.google_client_id_android or ""
GOOGLE_CLIENT_ID_WEB      = settings.google_client_id or ""   # primary web/backend client
APPLE_APP_BUNDLE_ID       = settings.apple_app_bundle_id


# ─────────────────────────────────────────────────────────────────────────────
# Google token verification
# ─────────────────────────────────────────────────────────────────────────────

# Re-used transport: google-auth caches Google's signing certs per transport.
_GOOGLE_REQUEST = google_requests.Request()


def _get_google_audience_ids() -> list[str]:
    """
    Collect every valid Client ID that might appear as `aud` in a Google token.
    """
    ids = [
        GOOGLE_CLIENT_ID_IOS,
        GOOGLE_CLIENT_ID_ANDROID,
        GOOGLE_CLIENT_ID_WEB
    ]
    return [i for i in ids if i]   # strip empty strings


def verify_google_token(raw_id_token: str) -> dict[str, Any]:
    """
    Verify a Google id_token.

    google-auth performs:
      • RS256 signature check against Google's public keys
      • `aud`  check (must match one of our client IDs)
      • `exp`  check
      • `iss`  check (accounts.google.com or https://accounts.google.com)

    Returns the decoded token claims or raises HTTPException.
    """
    audiences = _get_google_audience_ids()
    if not audiences:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sign-In is not configured on the server.",
        )
    try:
        # One verification against every accepted client id (a single cert fetch).
        claims = google_id_token.verify_oauth2_token(
            raw_id_token,
            _GOOGLE_REQUEST,
            audience=audiences,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google id_token is invalid or expired.",
        ) from None

    # Extra safety: email must be marked as verified by Google
    if not claims.get("email_verified", False) or not claims.get("email"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified.",
        )
    return claims


# ─────────────────────────────────────────────────────────────────────────────
# Apple token verification
# ─────────────────────────────────────────────────────────────────────────────

APPLE_JWKS_URL  = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER    = "https://appleid.apple.com"

# Cache Apple's public keys for 1 hour to avoid hammering their endpoint
_apple_jwks_cache: TTLCache = TTLCache(maxsize=1, ttl=3600)


async def _fetch_apple_jwks() -> dict:
    if "jwks" in _apple_jwks_cache:
        return _apple_jwks_cache["jwks"]

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(APPLE_JWKS_URL)
        resp.raise_for_status()
        jwks = resp.json()

    _apple_jwks_cache["jwks"] = jwks
    return jwks


async def verify_apple_token(raw_identity_token: str) -> dict[str, Any]:
    """
    Verify an Apple identityToken (JWT, RS256).

    Apple does NOT provide a convenience library like google-auth, so we:
      1. Fetch Apple's public JWKS (cached).
      2. Select the key that matches the token's `kid` header.
      3. Use PyJWT to verify signature + exp + iss + aud.

    Returns decoded claims or raises HTTPException.
    """
    # ── Step 1: decode the header to find `kid` ──────────────────────────────
    try:
        unverified_header = pyjwt.get_unverified_header(raw_identity_token)
    except pyjwt.DecodeError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Apple identity_token is malformed.",
        )

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Apple identity_token missing 'kid' header.",
        )

    # ── Step 2: fetch & match Apple's public key ─────────────────────────────
    try:
        jwks = await _fetch_apple_jwks()
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not reach Apple to verify sign-in. Please try again.",
        )

    matching_key = next(
        (k for k in jwks.get("keys", []) if k.get("kid") == kid),
        None,
    )
    if not matching_key:
        # Apple rotated keys – bust the cache and retry once
        _apple_jwks_cache.clear()
        jwks = await _fetch_apple_jwks()
        matching_key = next(
            (k for k in jwks.get("keys", []) if k.get("kid") == kid),
            None,
        )
    if not matching_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No matching Apple public key found for this token.",
        )

    # ── Step 3: build the RSA public key object ───────────────────────────────
    try:
        public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(matching_key)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not verify Apple sign-in.",
        )

    # ── Step 4: verify signature + standard claims ────────────────────────────
    try:
        claims = pyjwt.decode(
            raw_identity_token,
            public_key,
            algorithms=["RS256"],
            audience=APPLE_APP_BUNDLE_ID,   # your bundle ID, e.g. com.yourcompany.bodhi
            issuer=APPLE_ISSUER,
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Apple identity_token has expired.",
        )
    except pyjwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Apple identity_token is invalid.",
        )

    return claims


# ─────────────────────────────────────────────────────────────────────────────
# Shared DB helper – find-or-create
# ─────────────────────────────────────────────────────────────────────────────

async def _find_or_create_oauth_user(
    *,
    session:       AsyncSession,
    provider:      AuthProvider,
    provider_id:   str,
    email:         str,
    display_name:  Optional[str],
    avatar_url:    Optional[str],
) -> tuple[User, bool]:
    """
    Returns (user, is_new_user).

    Lookup order:
      1. provider + provider_id   → existing OAuth account (fastest path)
      2. email                    → account created via another provider or locally
         If found, we attach the new provider to that account (link accounts).
      3. Neither found            → create a fresh user.
    """
    # 1. Look up by provider + provider_id
    result = await session.execute(
        select(User).where(
            User.auth_provider == provider,
            User.provider_id   == provider_id,
        )
    )
    user = result.scalar_one_or_none()
    if user:
        # Refresh avatar in case it changed on the provider
        if not (user.full_name or "").strip() and display_name:
            user.full_name = display_name
        user.avatar_url = avatar_url or user.avatar_url
        return user, False

    # 2. Look up by email (account linking)
    email = email.strip().lower()
    result = await session.execute(
        select(User).where(func.lower(User.email) == email)
    )
    user = result.scalar_one_or_none()
    if user:
        # Link this OAuth provider to the existing account
        user.auth_provider  = provider
        user.provider_id    = provider_id
        user.email_verified = True
        if not (user.full_name or "").strip() and display_name:
            user.full_name = display_name
        user.avatar_url     = avatar_url or user.avatar_url
        return user, False

    # 3. Create brand-new user. `phone` is NOT NULL + UNIQUE, so OAuth users get
    # a unique placeholder until they add a real number in their profile.
    new_id = str(uuid.uuid4())
    new_user = User(
        id              = new_id,
        email           = email,
        phone           = f"oauth-{new_id.replace('-', '')[:14]}",
        full_name       = (display_name or email.split("@")[0]).strip()[:255] or "BODHI User",
        hashed_password = None,           # no password for OAuth users
        auth_provider   = provider,
        provider_id     = provider_id,
        avatar_url      = avatar_url,
        email_verified  = True,
        is_verified     = True,
        is_active       = True,
    )
    session.add(new_user)
    await session.flush()
    return new_user, True


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/google",
    response_model=OAuthTokenResponse,
    summary="Sign in with Google",
    description=(
        "Accepts a Google id_token obtained by the mobile app via the native "
        "Google Sign-In SDK.  The token is verified server-side; we never trust "
        "any user-supplied email or identity data."
    ),
)
async def google_sign_in(
    request: Request,
    body:    GoogleSignInRequest,
    session: AsyncSession = Depends(get_db),
) -> OAuthTokenResponse:
    # 1. Verify the token with Google's servers (blocking I/O → threadpool)
    claims = await run_in_threadpool(verify_google_token, body.id_token)

    # 2. Extract trusted fields from the verified payload ONLY
    provider_id  = claims["sub"]                    # stable Google user ID
    email        = claims["email"]                  # already verified by Google
    display_name = claims.get("name")
    avatar_url   = claims.get("picture")

    # 3. Find or create the user
    user, is_new = await _find_or_create_oauth_user(
        session      = session,
        provider     = AuthProvider.google,
        provider_id  = provider_id,
        email        = email,
        display_name = display_name,
        avatar_url   = avatar_url,
    )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    # 4. Issue our own JWT + refresh session (same shape as password login)
    tokens = await issue_session_tokens(session, user, request)
    await session.commit()
    return OAuthTokenResponse(is_new_user=is_new, **tokens)


@router.post(
    "/apple",
    response_model=OAuthTokenResponse,
    summary="Sign in with Apple",
    description=(
        "Accepts an Apple identityToken obtained by the mobile app via the native "
        "Apple Authentication SDK.  The token is verified against Apple's public "
        "JWKS endpoint; we never trust user-supplied identity data."
    ),
)
async def apple_sign_in(
    request: Request,
    body:    AppleSignInRequest,
    session: AsyncSession = Depends(get_db),
) -> OAuthTokenResponse:
    # 1. Verify the token against Apple's public keys
    claims = await verify_apple_token(body.identity_token)

    # 2. Extract trusted fields from the verified payload ONLY
    provider_id = claims["sub"]                     # stable Apple user ID
    email       = claims.get("email")               # may be a relay address – still valid

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Apple did not return an email address. "
                "The user may have chosen to hide their email and "
                "this is their first sign-in with that option. "
                "Please ask them to sign in again without hiding the email."
            ),
        )

    # Apple supplies full_name ONLY on the very first sign-in; accept it
    # from the request body (the client gathered it from the native SDK)
    # but we do NOT use it for authentication – only for profile display.
    display_name = body.full_name   # could be None on subsequent sign-ins

    # 3. Find or create the user
    user, is_new = await _find_or_create_oauth_user(
        session      = session,
        provider     = AuthProvider.apple,
        provider_id  = provider_id,
        email        = email,
        display_name = display_name,
        avatar_url   = None,       # Apple never provides an avatar URL
    )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    # 4. Issue our own JWT + refresh session (same shape as password login)
    tokens = await issue_session_tokens(session, user, request)
    await session.commit()
    return OAuthTokenResponse(is_new_user=is_new, **tokens)