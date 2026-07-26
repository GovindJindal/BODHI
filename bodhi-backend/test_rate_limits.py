import time
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("1. Testing Rate Limits on /auth/token (limit: 5/minute)")
for i in range(1, 8):
    try:
        resp = client.post("/auth/token", data={"username": "fake", "password": "fake"})
        print(f"Request {i}: Status {resp.status_code}")
        if resp.status_code == 429:
            print("   Rate Limit headers:", {k: v for k, v in resp.headers.items() if k.lower().startswith('retry-') or k.lower().startswith('x-ratelimit')})
    except Exception as e:
        print(f"Request {i}: Failed with exception (expected since DB is down): {type(e).__name__}")

print("\n2. Testing /health exemption (should succeed 100 times)")
success_count = 0
for i in range(100):
    try:
        resp = client.get("/")
        if resp.status_code == 200:
            success_count += 1
    except Exception:
        pass
print(f"Health check succeeded {success_count} times.")

print("\n3. Testing global fallback limit on /price/market-status (limit: 100/minute)")
fallback_success = 0
fallback_429 = 0
for i in range(105):
    try:
        resp = client.get("/price/market-status")
        if resp.status_code == 429:
            fallback_429 += 1
        else:
            fallback_success += 1
    except Exception as e:
        fallback_success += 1 # We count it as success if it reached business logic
print(f"Market status: {fallback_success} successes (or db errors), {fallback_429} rate limits (429s).")
