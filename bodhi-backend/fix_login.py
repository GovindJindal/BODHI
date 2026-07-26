import re
with open("routers/auth.py", "r") as f:
    content = f.read()
# Replace `async def login(` with `async def login(request: Request, `
content = re.sub(r'async def login\(', r'async def login(request: Request, ', content, count=1)
with open("routers/auth.py", "w") as f:
    f.write(content)
print("login fixed")
