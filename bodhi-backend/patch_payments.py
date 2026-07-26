import re

with open("routers/payments.py", "r") as f:
    content = f.read()

import_stmt = "from fastapi import Request\nfrom core.rate_limit import limiter\n"
if "from core.rate_limit import limiter" not in content:
    content = content.replace("from fastapi import APIRouter", import_stmt + "from fastapi import APIRouter")

# Patch intent
pattern_intent = r'(@router\.\w+\("/intent".*?\)\n)'
replacement_intent = r'\1@limiter.limit("10/minute")\n'
content = re.sub(pattern_intent, replacement_intent, content, count=1, flags=re.DOTALL)
sig_intent = r'(async def create_payment_intent\()'
sig_rep_intent = r'\1http_request: Request, '
content = re.sub(sig_intent, sig_rep_intent, content, count=1)

# Patch webhook
pattern_webhook = r'(@router\.\w+\("/webhook".*?\)\n)'
replacement_webhook = r'\1@limiter.exempt\n'
content = re.sub(pattern_webhook, replacement_webhook, content, count=1, flags=re.DOTALL)

with open("routers/payments.py", "w") as f:
    f.write(content)

print("payments.py patched")
