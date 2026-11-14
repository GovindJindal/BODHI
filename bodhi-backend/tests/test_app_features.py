"""Profile, avatar, notifications, manual transactions, paper trading, collaboration, deletion."""
import pytest

from conftest import register_user
from core.rate_limit import limiter

pytestmark = pytest.mark.asyncio(loop_scope="session")

PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)


async def test_profile_update_and_avatar(client, outbox):
    u = await register_user(client, outbox)
    other = await register_user(client, outbox)
    h = u["headers"]

    r = await client.put("/users/me", headers=h, json={"full_name": "New Name", "age": 30, "current_password": "0000"})
    assert r.status_code == 401
    r = await client.put("/users/me", headers=h, json={"full_name": "New Name", "age": 30, "current_password": u["m_pin"]})
    assert r.status_code == 200, r.text
    assert r.json()["full_name"] == "New Name" and r.json()["gap_id"] and r.json()["balance"] == 100000

    r = await client.put("/users/me", headers=h, json={"phone": other["phone"], "current_password": u["m_pin"]})
    assert r.status_code == 400  # phone already taken – used to be an unhandled 500

    r = await client.post("/users/avatar", headers=h, files={"file": ("../../../evil.png", PNG_1PX, "image/png")})
    assert r.status_code == 200, r.text
    assert r.json()["avatar_url"].startswith("data:image/png;base64,")
    assert (await client.get("/users/me", headers=h)).json()["avatar_url"].startswith("data:image/png")

    r = await client.post("/users/avatar", headers=h, files={"file": ("x.png", b"not an image", "image/png")})
    assert r.status_code == 415


async def test_verify_endpoints(client, outbox):
    u = await register_user(client, outbox)
    assert (await client.post("/users/verify-mpin", headers=u["headers"], json={"password": u["m_pin"]})).status_code == 200
    assert (await client.post("/users/verify-mpin", headers=u["headers"], json={"password": "0000"})).status_code == 401
    assert (await client.post("/users/verify", headers=u["headers"], json={"password": u["m_pin"]})).status_code == 200


async def test_manual_transactions(client, outbox):
    u = await register_user(client, outbox)
    r = await client.post("/users/transactions", headers=u["headers"],
                          json={"merchant": "Zomato", "category": "Food", "amount": 250, "type": "debit", "note": "x" * 900})
    assert r.status_code == 201, r.text
    assert r.json()["type"] == "DEBIT"
    r = await client.post("/users/transactions", headers=u["headers"], json={"merchant": "X", "category": "Food", "amount": -1})
    assert r.status_code == 422
    rows = (await client.get("/users/transactions", headers=u["headers"])).json()
    assert len(rows) == 1 and rows[0]["merchant"] == "Zomato"


async def test_notifications(client, outbox):
    u = await register_user(client, outbox)
    r = await client.get("/notifications/", headers=u["headers"])
    assert r.status_code == 200, r.text
    assert (await client.post("/notifications/read-all", headers=u["headers"])).status_code == 200


async def test_paper_trading(client, outbox, monkeypatch):
    import routers.trade as trade

    async def fake_price(symbol):
        return {"symbol": symbol.upper(), "price": 100.0, "change_pct": 1.0}

    monkeypatch.setattr(trade, "get_live_price", fake_price)
    monkeypatch.setattr(trade, "market_status", lambda: {"open": True, "label": "open"})
    u = await register_user(client, outbox)
    h = u["headers"]

    r = await client.post("/trade/buy", headers=h, json={"symbol": "reliance", "amount_inr": 1050})
    assert r.status_code == 200, r.text
    assert r.json()["quantity"] == 10
    r = await client.post("/trade/buy", headers=h, json={"symbol": "RELIANCE.NS", "amount_inr": 500})
    assert r.status_code == 200

    pf = (await client.get("/trade/portfolio", headers=h)).json()
    assert pf["cash"] == pytest.approx(100000 - 1500)
    assert len(pf["holdings"]) == 1 and pf["holdings"][0]["qty"] == 15  # one normalised holding

    r = await client.post("/trade/sell", headers=h, json={"symbol": "RELIANCE", "quantity": 20})
    assert r.status_code == 400
    r = await client.post("/trade/sell", headers=h, json={"symbol": "RELIANCE", "quantity": 15})
    assert r.status_code == 200, r.text

    hist = (await client.get("/trade/history?limit=50", headers=h)).json()["transactions"]
    assert sorted(t["type"] for t in hist) == ["BUY", "BUY", "SELL"]

    r = await client.post("/trade/buy", headers=h, json={"symbol": "TCS", "amount_inr": 50})
    assert r.status_code == 400  # can't afford 1 share

    assert (await client.post("/trade/reset", headers=h)).status_code == 200
    assert (await client.get("/trade/portfolio", headers=h)).json()["cash"] == 100000


async def test_collaboration_chat_and_polls(client, outbox):
    a = await register_user(client, outbox)
    b = await register_user(client, outbox)
    outsider = await register_user(client, outbox)
    trip = (await client.post("/social/trips", headers=a["headers"], json={"name": "Ladakh"})).json()
    await client.post("/social/trips/join", headers=b["headers"], json={"invite_code": trip["invite_code"]})
    base = f"/collaboration/trip/{trip['id']}"

    r = await client.post(f"{base}/messages", headers=a["headers"], json={"message": "Hello team"})
    assert r.status_code in (200, 201), r.text
    msgs = (await client.get(f"{base}/messages", headers=b["headers"])).json()
    assert "Hello team" in str(msgs)
    assert (await client.get(f"{base}/messages", headers=outsider["headers"])).status_code == 403

    r = await client.post(f"{base}/polls", headers=a["headers"], json={"question": "Hotel?", "options": ["A", "B"]})
    assert r.status_code == 201, r.text
    polls = (await client.get(f"{base}/polls", headers=b["headers"])).json()
    assert "Hotel?" in str(polls)
    assert (await client.get(f"{base}/activity", headers=b["headers"])).status_code == 200


async def test_delete_account(client, outbox):
    u = await register_user(client, outbox)
    r = await client.request("DELETE", "/users/me", headers=u["headers"], json={"password": "0000"})
    assert r.status_code == 400
    r = await client.request("DELETE", "/users/me", headers=u["headers"], json={"password": u["m_pin"]})
    assert r.status_code == 200, r.text
    assert (await client.get("/users/me", headers=u["headers"])).status_code == 401
    limiter.reset()
    assert (await client.post("/auth/token", data={"username": u["email"], "password": u["m_pin"]})).status_code == 401


async def test_ai_routes_require_login(client):
    for path in ("/ai/chat", "/ai/speak"):
        assert (await client.post(path, json={"message": "hi", "text": "hi"})).status_code == 401


async def test_ai_chat_normalises_llm_output(client, outbox, monkeypatch):
    import services.brain_service as brain
    import routers.ai as ai

    class FakeModel:
        async def generate_content_async(self, *a, **k):
            class R:
                text = '{"intent": "add_transaction", "text_response": "Done!", "transaction_data": {"amount": "1,200", "merchant": "Kirana", "category": "food"}}'
            return R()

    monkeypatch.setattr(brain, "_get_model", lambda prompt: FakeModel())
    from core.config import settings
    monkeypatch.setattr(settings, "gemini_api_key", "x")

    async def no_tts(text):
        raise RuntimeError("tts down")

    monkeypatch.setattr(ai, "generate_bodhi_speech", no_tts)
    u = await register_user(client, outbox)
    r = await client.post("/ai/chat", headers=u["headers"], json={"message": "spent 1200 at kirana"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["audio_base64"] is None  # TTS failure no longer breaks the reply
    assert body["transaction_data"] == {"amount": 1200.0, "merchant": "Kirana", "category": "Food", "type": "DEBIT"}
