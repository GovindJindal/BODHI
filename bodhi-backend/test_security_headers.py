from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("1. Testing 200 OK (/docs) with HTTP:")
resp1 = client.get("/docs")
print("Status:", resp1.status_code)
for k, v in resp1.headers.items():
    if k.lower() in ["x-content-type-options", "x-frame-options", "content-security-policy", "referrer-policy", "permissions-policy", "strict-transport-security"]:
        print(f"  {k}: {v}")
print(f"  HSTS present: {'strict-transport-security' in resp1.headers}")

print("\n2. Testing 200 OK (/docs) with HTTPS mock (x-forwarded-proto):")
resp2 = client.get("/docs", headers={"x-forwarded-proto": "https"})
for k, v in resp2.headers.items():
    if k.lower() == "strict-transport-security":
        print(f"  {k}: {v}")

print("\n3. Testing 404 Not Found (/nonexistent):")
resp3 = client.get("/nonexistent")
print("Status:", resp3.status_code)
print(f"  X-Frame-Options present: {'x-frame-options' in resp3.headers}")

print("\n4. Testing CORS Preflight (OPTIONS /auth/token):")
resp4 = client.options("/auth/token", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
print("Status:", resp4.status_code)
print(f"  X-Frame-Options present: {'x-frame-options' in resp4.headers}")
print(f"  CORS headers present: {'access-control-allow-methods' in resp4.headers}")

print("\n5. Testing 500 error (if any available). Skipping for now to avoid breaking app state.")

