"""Shared fixtures for the BODHI backend integration tests.

The tests run against a real (throwaway) PostgreSQL database because the app
relies on Postgres-only features (row locks, enums, ALTER ... IF NOT EXISTS).

    export DATABASE_URL=postgresql+asyncpg://postgres@127.0.0.1:5432/bodhi_test
    export SECRET_KEY=$(python -c "import secrets;print(secrets.token_hex(32))")
    export RAZORPAY_KEY_ID=rzp_test_x RAZORPAY_KEY_SECRET=x RAZORPAY_WEBHOOK_SECRET=x CRON_SECRET=x
    pytest -q

NEVER point DATABASE_URL at a production database: tables are dropped first.
"""
import os
import sys
import uuid

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if "bodhi_test" not in os.environ.get("DATABASE_URL", ""):
    pytest.skip("Set DATABASE_URL to a database named bodhi_test to run integration tests", allow_module_level=True)

import httpx  # noqa: E402

import main  # noqa: E402
from core.rate_limit import limiter  # noqa: E402
from database import Base, engine  # noqa: E402


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def app():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    main.db_initialized = False
    await main.init_db()
    yield main.app
    await engine.dispose()


@pytest_asyncio.fixture(loop_scope="session")
async def client(app):
    limiter.reset()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def outbox(monkeypatch):
    """Capture OTP emails instead of sending them."""
    sent: list[dict] = []
    import routers.auth as auth_router

    def fake_signup(email, otp):
        sent.append({"kind": "signup", "email": email, "otp": otp})
        return True

    def fake_reset(email, otp, name=None):
        sent.append({"kind": "reset", "email": email, "otp": otp})
        return True

    monkeypatch.setattr(auth_router, "send_signup_otp_email", fake_signup)
    monkeypatch.setattr(auth_router, "send_reset_otp_email", fake_reset)
    return sent


def unique_email() -> str:
    return f"user_{uuid.uuid4().hex[:10]}@Example.com"


def unique_phone() -> str:
    return "9" + str(uuid.uuid4().int)[:9]


async def register_user(client, outbox, *, email=None, phone=None, m_pin="1234", u_pin="5678"):
    """Run the full signup wizard (send OTP → verify → register) and log in."""
    email = email or unique_email()
    phone = phone or unique_phone()
    r = await client.post("/auth/send-register-otp", json={"email": email})
    assert r.status_code == 200, r.text
    otp = outbox[-1]["otp"]
    r = await client.post("/auth/verify-register-otp", json={"email": email, "otp": otp})
    assert r.status_code == 200, r.text
    r = await client.post("/auth/register", json={
        "email": email, "password": m_pin, "full_name": "Test User", "phone_number": phone,
        "m_pin": m_pin, "u_pin": u_pin, "age": 25, "gender": "Other",
    })
    assert r.status_code == 201, r.text
    limiter.reset()
    r = await client.post("/auth/token", data={"username": email, "password": m_pin})
    assert r.status_code == 200, r.text
    tokens = r.json()
    return {"email": email.lower(), "phone": phone, "m_pin": m_pin, "u_pin": u_pin, **tokens,
            "headers": {"Authorization": f"Bearer {tokens['access_token']}"}}
