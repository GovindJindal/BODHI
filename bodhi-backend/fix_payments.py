import re
with open("routers/payments.py", "r") as f:
    content = f.read()
content = re.sub(r'async def create_intent\(', r'async def create_intent(request: Request, ', content, count=1)
with open("routers/payments.py", "w") as f:
    f.write(content)
print("payments fixed")
