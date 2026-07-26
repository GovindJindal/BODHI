from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

response = client.get("/docs")
print("Headers for /docs (Swagger UI):")
for k, v in response.headers.items():
    print(f"{k}: {v}")

response = client.get("/admin-pro/login", follow_redirects=False)
print("\nHeaders for /admin-pro/login (Next.js Admin):")
for k, v in response.headers.items():
    print(f"{k}: {v}")

