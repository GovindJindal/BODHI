"""Trip wallets and venture clubs: membership, splits, settlement, permissions."""
import pytest

from conftest import register_user

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_trip_lifecycle_and_settlement(client, outbox):
    a = await register_user(client, outbox)
    b = await register_user(client, outbox)
    c = await register_user(client, outbox)
    outsider = await register_user(client, outbox)

    r = await client.post("/social/trips", headers=a["headers"], json={"name": "  Goa  "})
    assert r.status_code == 200, r.text
    trip_id, code = r.json()["id"], r.json()["invite_code"]

    for u in (b, c):
        r = await client.post("/social/trips/join", headers=u["headers"], json={"invite_code": code.lower()})
        assert r.status_code == 200, r.text

    # outsiders can't read, add to, settle or delete the trip
    assert (await client.get(f"/social/trips/{trip_id}", headers=outsider["headers"])).status_code == 403
    assert (await client.post(f"/social/trips/{trip_id}/expenses", headers=outsider["headers"],
                              json={"description": "x", "amount": 1})).status_code == 403
    assert (await client.get(f"/social/trips/{trip_id}/settle", headers=outsider["headers"])).status_code == 403
    assert (await client.delete(f"/social/trips/{trip_id}", headers=outsider["headers"])).status_code == 403

    r = await client.post(f"/social/trips/{trip_id}/expenses", headers=a["headers"], json={"description": "Hotel", "amount": 3000})
    assert r.status_code == 200, r.text
    r = await client.post(f"/social/trips/{trip_id}/expenses", headers=b["headers"], json={"description": "Dinner", "amount": 600})
    assert r.status_code == 200, r.text
    r = await client.post(f"/social/trips/{trip_id}/expenses", headers=b["headers"], json={"description": "bad", "amount": -1})
    assert r.status_code == 422

    details = (await client.get(f"/social/trips/{trip_id}", headers=c["headers"])).json()
    assert details["total_expenses"] == 3600
    assert {m["name"] for m in details["members"]} == {"Test User"}
    balances = sorted(m["balance"] for m in details["members"])
    # A paid 3000, B paid 600, each share is 1200 → C -1200, B -600, A +1800
    assert balances == pytest.approx([-1200, -600, 1800], abs=0.02)

    plan = (await client.get(f"/social/trips/{trip_id}/settle", headers=c["headers"])).json()["transactions"]
    assert plan and all("from_name" in t for t in plan)
    assert sorted(t["amount"] for t in plan) == pytest.approx([600, 1200], abs=0.02)

    dash = (await client.get("/social/dashboard", headers=c["headers"])).json()
    trip_card = next(t for t in dash["trips"] if t["id"] == trip_id)
    assert trip_card["you_owe_raw"] == pytest.approx(1200)  # owes 1000 to A and 200 to B

    # non-admin member can't delete, admin can
    assert (await client.delete(f"/social/trips/{trip_id}", headers=b["headers"])).status_code == 403
    assert (await client.delete(f"/social/trips/{trip_id}", headers=a["headers"])).status_code == 200


async def test_club_contribution_uses_wallet_and_rebalances_shares(client, outbox):
    a = await register_user(client, outbox)
    b = await register_user(client, outbox)
    outsider = await register_user(client, outbox)

    r = await client.post("/social/investments", headers=a["headers"], json={"name": "Moon Fund"})
    club_id, code = r.json()["id"], r.json()["invite_code"]
    await client.post("/social/investments/join", headers=b["headers"], json={"invite_code": code})

    # outsiders can no longer sneak in by contributing directly
    r = await client.post(f"/social/investments/{club_id}/contribute", headers=outsider["headers"], json={"amount": 10})
    assert r.status_code == 403

    assert (await client.post(f"/social/investments/{club_id}/contribute", headers=a["headers"], json={"amount": 3000})).status_code == 200
    r = await client.post(f"/social/investments/{club_id}/contribute", headers=b["headers"], json={"amount": 1000})
    assert r.status_code == 200, r.text
    assert r.json()["wallet_balance"] == pytest.approx(99000)

    r = await client.post(f"/social/investments/{club_id}/contribute", headers=b["headers"], json={"amount": 10_000_000})
    assert r.status_code == 400  # insufficient wallet balance

    club = (await client.get(f"/social/investments/{club_id}", headers=b["headers"])).json()
    shares = {m["is_you"]: m["share"] for m in club["members"]}
    assert shares[True] == pytest.approx(25) and shares[False] == pytest.approx(75)
    assert club["buying_power"] == pytest.approx(4000)

    r = await client.post(f"/social/investments/{club_id}/polls", headers=b["headers"],
                          json={"symbol": "reliance.ns", "quantity": 2, "type": "buy"})
    assert r.status_code == 200, r.text
    club = (await client.get(f"/social/investments/{club_id}", headers=a["headers"])).json()
    assert club["polls"][0]["symbol"] == "RELIANCE.NS" and club["polls"][0]["votes_needed"] == 2

    # club holding money can't be deleted; outsider can't see it
    assert (await client.delete(f"/social/investments/{club_id}", headers=a["headers"])).status_code == 400
    assert (await client.get(f"/social/investments/{club_id}", headers=outsider["headers"])).status_code == 403


async def test_invalid_invite_code(client, outbox):
    a = await register_user(client, outbox)
    r = await client.post("/social/trips/join", headers=a["headers"], json={"invite_code": "ZZZZZZ"})
    assert r.status_code == 404
