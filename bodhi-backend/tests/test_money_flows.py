"""Wallet transfers, payment requests, QR pay and Razorpay top-ups."""
import asyncio
import hashlib
import hmac

import pytest

from conftest import register_user
from core.config import settings

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def balance(client, user):
    r = await client.get("/transfers/balance", headers=user["headers"])
    assert r.status_code == 200, r.text
    return r.json()["balance"]


async def test_send_money_moves_balance_and_writes_ledger(client, outbox):
    a = await register_user(client, outbox)
    b = await register_user(client, outbox)
    r = await client.post("/transfers/send", headers=a["headers"],
                          json={"recipient_identifier": b["email"], "amount": 150.254, "note": "chai", "u_pin": a["u_pin"]})
    assert r.status_code == 200, r.text
    assert await balance(client, a) == pytest.approx(100000 - 150.25, abs=1e-6)
    assert await balance(client, b) == pytest.approx(100000 + 150.25, abs=1e-6)

    hist = (await client.get("/transfers/history", headers=b["headers"])).json()["transactions"]
    assert hist[0]["type"] == "CREDIT" and hist[0]["amount"] == pytest.approx(150.25, abs=1e-6)


async def test_send_by_phone_and_gap_id(client, outbox):
    a = await register_user(client, outbox)
    b = await register_user(client, outbox)
    r = await client.post("/transfers/send", headers=a["headers"], json={"recipient_identifier": "+91 " + b["phone"], "amount": 10})
    assert r.status_code == 200, r.text
    local, domain = b["email"].split("@")
    r = await client.post("/transfers/send", headers=a["headers"], json={"recipient_identifier": f"{local}.{domain[0]}.gap", "amount": 10})
    assert r.status_code == 200, r.text


async def test_send_rejects_bad_requests(client, outbox):
    a = await register_user(client, outbox)
    b = await register_user(client, outbox)
    cases = [
        ({"recipient_identifier": b["email"], "amount": 0}, 422),
        ({"recipient_identifier": b["email"], "amount": -5}, 422),
        ({"recipient_identifier": b["email"], "amount": 10_000_000}, 422),
        ({"recipient_identifier": b["email"], "amount": 200_000}, 400),  # more than balance
        ({"recipient_identifier": a["email"], "amount": 1}, 400),  # self
        ({"recipient_identifier": "nobody@nowhere.example", "amount": 1}, 404),
        ({"recipient_identifier": b["email"], "amount": 1, "u_pin": "0000"}, 403),
    ]
    for payload, code in cases:
        r = await client.post("/transfers/send", headers=a["headers"], json=payload)
        assert r.status_code == code, (payload, r.text)
    assert await balance(client, a) == 100000


async def test_concurrent_transfers_do_not_lose_money(client, outbox):
    a = await register_user(client, outbox)
    b = await register_user(client, outbox)
    c = await register_user(client, outbox)

    async def send(src, dst, amt):
        return await client.post("/transfers/send", headers=src["headers"],
                                 json={"recipient_identifier": dst["email"], "amount": amt})

    results = await asyncio.gather(*[send(a, b, 100) for _ in range(5)], *[send(c, b, 50) for _ in range(5)])
    assert all(r.status_code == 200 for r in results), [r.text for r in results if r.status_code != 200]
    total = await balance(client, a) + await balance(client, b) + await balance(client, c)
    assert total == pytest.approx(300000)
    assert await balance(client, b) == pytest.approx(100000 + 750)


async def test_qr_pay_with_upi_uri(client, outbox):
    a = await register_user(client, outbox)
    b = await register_user(client, outbox)
    qr = f"upi://pay?pa={b['phone']}@bodhi&pn=Test&cu=INR"
    r = await client.post("/transfers/qr-pay", headers=a["headers"], json={"qr_data": qr, "amount": 42})
    assert r.status_code == 200, r.text
    assert await balance(client, b) == pytest.approx(100042)


async def test_payment_request_lifecycle(client, outbox):
    requester = await register_user(client, outbox)
    payer = await register_user(client, outbox)
    r = await client.post("/transfers/request", headers=requester["headers"],
                          json={"requester_identifier": payer["email"], "amount": 300, "note": "dinner"})
    assert r.status_code == 200, r.text
    req_id = r.json()["request_id"]

    pending = (await client.get("/transfers/requests/pending", headers=payer["headers"])).json()["requests"]
    assert [p["request_id"] for p in pending] == [req_id]
    assert pending[0]["note"] == "dinner"

    # requester cannot pay their own request
    r = await client.post(f"/transfers/requests/{req_id}/fulfill", headers=requester["headers"])
    assert r.status_code == 404

    r = await client.post(f"/transfers/requests/{req_id}/fulfill", headers=payer["headers"], json={"u_pin": payer["u_pin"]})
    assert r.status_code == 200, r.text
    assert await balance(client, requester) == pytest.approx(100300)
    r = await client.post(f"/transfers/requests/{req_id}/fulfill", headers=payer["headers"])
    assert r.status_code == 400  # already paid


async def test_razorpay_topup_flow(client, outbox, monkeypatch):
    import routers.transfers as transfers

    user = await register_user(client, outbox)
    monkeypatch.setattr(transfers._rz_client.order, "create", lambda data: {"id": "order_TEST123" + user["session_id"][:8], **data})

    r = await client.post("/transfers/razorpay/create-order", headers=user["headers"], json={"amount": 500})
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["amount"] == 50000

    payment_id = "pay_TEST"
    sig = hmac.new(settings.razorpay_key_secret.encode(), f"{order['order_id']}|{payment_id}".encode(), hashlib.sha256).hexdigest()

    # wrong signature
    r = await client.post("/transfers/razorpay/verify-and-credit", headers=user["headers"], json={
        "razorpay_order_id": order["order_id"], "razorpay_payment_id": payment_id, "razorpay_signature": "bad", "amount": 500})
    assert r.status_code == 400

    # client lies about the amount → still only the ordered ₹500 is credited, and only once
    for _ in range(2):
        r = await client.post("/transfers/razorpay/verify-and-credit", headers=user["headers"], json={
            "razorpay_order_id": order["order_id"], "razorpay_payment_id": payment_id, "razorpay_signature": sig, "amount": 99999})
        assert r.status_code == 200, r.text
    assert await balance(client, user) == pytest.approx(100500)
