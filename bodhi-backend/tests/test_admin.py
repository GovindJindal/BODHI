"""Admin dashboard API (/admin-v2): login, permissions, stats, users, ledger, notifications, audit."""
import pytest
from sqlalchemy import update

from conftest import register_user
from database import AsyncSessionLocal
from models.core import User

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def make_admin(client, outbox, role):
    u = await register_user(client, outbox)
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).where(User.email == u["email"].lower()).values(role=role))
        await db.commit()
    r = await client.post("/admin-v2/login", data={"username": u["email"].upper(), "password": u["m_pin"]})
    assert r.status_code == 200, r.text
    u["admin_headers"] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    u["id"] = r.json()["user"]["id"]
    return u


async def test_admin_login_rejects_normal_users(client, outbox):
    u = await register_user(client, outbox)
    r = await client.post("/admin-v2/login", data={"username": u["email"], "password": u["m_pin"]})
    assert r.status_code == 401
    assert (await client.get("/admin-v2/stats", headers=u["headers"])).status_code == 403


async def test_admin_dashboard_endpoints(client, outbox):
    sup = await make_admin(client, outbox, "super_admin")
    victim = await register_user(client, outbox)
    h = sup["admin_headers"]

    stats = (await client.get("/admin-v2/stats", headers=h))
    assert stats.status_code == 200, stats.text
    assert stats.json()["users"]["total"] >= 2

    users = (await client.get("/admin-v2/users", headers=h, params={"search": victim["email"][:12]})).json()["users"]
    assert [x["email"] for x in users] == [victim["email"].lower()]
    assert (await client.get("/admin-v2/users", headers=h, params={"search": "%"})).status_code == 200

    victim_id = users[0]["id"]
    assert (await client.get(f"/admin-v2/users/{victim_id}/activity", headers=h)).status_code == 200
    assert (await client.get("/admin-v2/ledger", headers=h)).status_code == 200

    r = await client.post(f"/admin-v2/users/{victim_id}/toggle-status", headers=h)
    assert r.status_code == 200 and r.json()["is_active"] is False
    assert (await client.post(f"/admin-v2/users/{sup['id']}/toggle-status", headers=h)).status_code == 400

    r = await client.post("/admin-v2/notifications/bulk", headers=h,
                          json={"title": "Hi", "message": "Hello", "user_ids": [victim_id, "does-not-exist"], "type": "INFO"})
    assert r.status_code == 200, r.text
    assert r.json()["recipients"] == 1
    assert (await client.post("/admin-v2/notifications/bulk", headers=h, json={"title": "", "message": "x"})).status_code == 422

    audit = (await client.get("/admin-v2/audit", headers=h)).json()
    assert {"TOGGLE_USER_STATUS", "SEND_BULK_NOTIF"} <= {a["action"] for a in audit}
    assert all({"id", "timestamp", "actor", "action", "target"} <= set(a) for a in audit)


async def test_plain_admin_cannot_suspend_other_admins(client, outbox):
    sup = await make_admin(client, outbox, "super_admin")
    adm = await make_admin(client, outbox, "admin")
    r = await client.post(f"/admin-v2/users/{sup['id']}/toggle-status", headers=adm["admin_headers"])
    assert r.status_code == 403
    assert (await client.get("/admin-v2/audit", headers=adm["admin_headers"])).status_code == 403


async def test_create_admin_and_login(client, outbox):
    sup = await make_admin(client, outbox, "super_admin")
    body = {"full_name": "Ops Person", "email": "Ops.Person@Example.com", "password": "s3cure-pass"}
    r = await client.post("/admin-v2/create-admin", headers=sup["admin_headers"], json=body)
    assert r.status_code == 201, r.text  # used to 500: phone is NOT NULL
    assert (await client.post("/admin-v2/create-admin", headers=sup["admin_headers"], json=body)).status_code == 400
    assert (await client.post("/admin-v2/create-admin", headers=sup["admin_headers"],
                              json={**body, "email": "x@example.com", "password": "short"})).status_code == 422
    r = await client.post("/admin-v2/login", data={"username": "ops.person@example.com", "password": "s3cure-pass"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "admin"
