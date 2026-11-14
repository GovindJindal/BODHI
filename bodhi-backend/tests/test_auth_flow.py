"""End-to-end tests for signup, login, forgot/reset M-PIN, refresh and logout."""
import pytest

from conftest import register_user, unique_email, unique_phone
from core.rate_limit import limiter

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_health(client):
    assert (await client.get("/health/live")).json() == {"status": "ok"}
    r = await client.get("/health/ready")
    assert r.json()["status"] == "ready"


async def test_signup_requires_verified_otp(client, outbox):
    r = await client.post("/auth/register", json={
        "email": unique_email(), "full_name": "X", "phone_number": unique_phone(),
        "m_pin": "1234", "u_pin": "5678", "age": 25, "gender": "Male",
    })
    assert r.status_code == 400
    assert "verify your email" in r.json()["detail"]


async def test_wrong_otp_is_rejected_and_locked_out(client, outbox):
    email = unique_email()
    await client.post("/auth/send-register-otp", json={"email": email})
    for _ in range(4):
        r = await client.post("/auth/verify-register-otp", json={"email": email, "otp": "000000" if outbox[-1]["otp"] != "000000" else "111111"})
        assert r.status_code == 400
    r = await client.post("/auth/verify-register-otp", json={"email": email, "otp": "999999" if outbox[-1]["otp"] != "999999" else "111111"})
    assert "Too many" in r.json()["detail"]
    # the real code no longer works after lock-out
    r = await client.post("/auth/verify-register-otp", json={"email": email, "otp": outbox[-1]["otp"]})
    assert r.status_code == 400


async def test_full_signup_login_profile(client, outbox):
    user = await register_user(client, outbox)
    assert user["refresh_token"] and user["session_id"]
    r = await client.get("/users/me", headers=user["headers"])
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["email"] == user["email"]
    assert me["balance"] == 100000.0


async def test_duplicate_email_and_phone(client, outbox):
    user = await register_user(client, outbox)
    limiter.reset()
    r = await client.post("/auth/send-register-otp", json={"email": user["email"]})
    assert r.status_code == 400 and "already registered" in r.json()["detail"]
    r = await client.post("/auth/check-phone", json={"phone": "+91" + user["phone"]})
    assert r.status_code == 400


async def test_login_is_case_insensitive_and_rejects_bad_pin(client, outbox):
    user = await register_user(client, outbox)
    r = await client.post("/auth/token", data={"username": user["email"].upper(), "password": user["m_pin"]})
    assert r.status_code == 200
    r = await client.post("/auth/token", data={"username": user["email"], "password": "0000"})
    assert r.status_code == 401


async def test_forgot_and_reset_pin(client, outbox):
    user = await register_user(client, outbox)
    r = await client.post("/auth/forgot-password", json={"email": user["email"]})
    assert r.status_code == 200, r.text
    reset = [m for m in outbox if m["kind"] == "reset"][-1]
    assert reset["email"] == user["email"]

    # unknown email gives the same answer (no enumeration)
    r = await client.post("/auth/forgot-password", json={"email": unique_email()})
    assert r.status_code == 200

    wrong = "000000" if reset["otp"] != "000000" else "111111"
    r = await client.post("/auth/reset-password", json={"email": user["email"], "otp": wrong, "new_password": "4321"})
    assert r.status_code == 400

    r = await client.post("/auth/reset-password", json={"email": user["email"], "otp": reset["otp"], "new_password": "12"})
    assert r.status_code == 400  # PIN format validated

    r = await client.post("/auth/reset-password", json={"email": user["email"], "otp": reset["otp"], "new_password": "4321"})
    assert r.status_code == 200, r.text

    # old session is revoked, old PIN rejected, new PIN works (also as the in-app M-PIN)
    assert (await client.get("/users/me", headers=user["headers"])).status_code == 401
    limiter.reset()
    assert (await client.post("/auth/token", data={"username": user["email"], "password": "1234"})).status_code == 401
    r = await client.post("/auth/token", data={"username": user["email"], "password": "4321"})
    assert r.status_code == 200
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert (await client.get("/users/me", headers=headers)).status_code == 200
    r = await client.post("/users/verify-mpin", json={"password": "4321"}, headers=headers)
    assert r.status_code == 200, r.text

    # the reset code is single-use
    r = await client.post("/auth/reset-password", json={"email": user["email"], "otp": reset["otp"], "new_password": "9999"})
    assert r.status_code == 400


async def test_refresh_rotation_and_logout(client, outbox):
    user = await register_user(client, outbox)
    r = await client.post("/auth/refresh", json={"refresh_token": user["refresh_token"], "session_id": user["session_id"]})
    assert r.status_code == 200, r.text
    rotated = r.json()
    assert rotated["refresh_token"] != user["refresh_token"]

    # replaying the old refresh token revokes the session (theft detection)
    r = await client.post("/auth/refresh", json={"refresh_token": user["refresh_token"], "session_id": user["session_id"]})
    assert r.status_code == 401
    r = await client.post("/auth/refresh", json={"refresh_token": rotated["refresh_token"], "session_id": user["session_id"]})
    assert r.status_code == 401


async def test_logout_revokes_access_token(client, outbox):
    user = await register_user(client, outbox)
    assert (await client.get("/users/me", headers=user["headers"])).status_code == 200
    r = await client.post("/auth/logout", json={"session_id": user["session_id"]})
    assert r.status_code == 200
    assert (await client.get("/users/me", headers=user["headers"])).status_code == 401


async def test_upin_verification(client, outbox):
    user = await register_user(client, outbox)
    r = await client.post("/auth/verify-upin", json={"u_pin": user["u_pin"]}, headers=user["headers"])
    assert r.status_code == 200
    r = await client.post("/auth/verify-upin", json={"u_pin": "0000"}, headers=user["headers"])
    assert r.status_code == 400


async def test_oauth_user_creation_and_token(client, monkeypatch):
    import routers.oauth as oauth

    email = unique_email()
    monkeypatch.setattr(oauth, "verify_google_token", lambda tok: {
        "sub": "google-" + email, "email": email, "email_verified": True, "name": "Gee User",
    })
    r = await client.post("/auth/google", json={"id_token": "fake"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_new_user"] is True and body["refresh_token"]
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    r = await client.get("/users/me", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["full_name"] == "Gee User"

    # second sign-in finds the same user
    r = await client.post("/auth/google", json={"id_token": "fake"})
    assert r.json()["is_new_user"] is False
