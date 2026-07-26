from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("Testing valid origin (http://localhost:3000)")
response = client.options("/auth/token", headers={
    "Origin": "http://localhost:3000",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "Authorization"
})
print("Valid Origin Status:", response.status_code)
print("CORS Headers:", {k: v for k, v in response.headers.items() if k.startswith("access-control-")})

print("\nTesting invalid origin (http://evil.com)")
response = client.options("/auth/token", headers={
    "Origin": "http://evil.com",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "Authorization"
})
print("Invalid Origin Status:", response.status_code)
print("CORS Headers:", {k: v for k, v in response.headers.items() if k.startswith("access-control-")})
