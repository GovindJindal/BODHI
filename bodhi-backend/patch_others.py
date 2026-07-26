import re
import os

def patch_file(filepath, limits):
    with open(filepath, "r") as f:
        content = f.read()

    if "from core.rate_limit import limiter" not in content:
        import_stmt = "from fastapi import Request\nfrom core.rate_limit import limiter\n"
        content = content.replace("from fastapi import APIRouter", import_stmt + "from fastapi import APIRouter")

    for path, limit, func_name in limits:
        # Add @limiter.limit
        pattern = r'(@router\.\w+\("' + re.escape(path) + r'".*?\)\n)'
        replacement = r'\1@limiter.limit("' + limit + r'")\n'
        content = re.sub(pattern, replacement, content, count=1, flags=re.DOTALL)
        
        # Add http_request: Request to signature
        sig_pattern = r'(async def ' + func_name + r'\()'
        sig_replacement = r'\1http_request: Request, '
        content = re.sub(sig_pattern, sig_replacement, content, count=1)
        
    with open(filepath, "w") as f:
        f.write(content)
    print(f"{filepath} patched")

patch_file("routers/ai.py", [
    ("/chat", "5/minute", "chat_with_gemini")
])
