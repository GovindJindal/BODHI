import re

with open("routers/auth.py", "r") as f:
    content = f.read()

# Add imports
import_stmt = "from fastapi import Request\nfrom core.rate_limit import limiter\n"
if "from core.rate_limit import limiter" not in content:
    content = content.replace("from fastapi import APIRouter, Depends, HTTPException, status", 
                              import_stmt + "from fastapi import APIRouter, Depends, HTTPException, status")

# Helper to patch
def patch_endpoint(content, endpoint_path, limit, func_name, param_str):
    # Find the router decorator
    pattern = r'(@router\.\w+\("' + re.escape(endpoint_path) + r'".*?\)\n)'
    # Add @limiter.limit
    replacement = r'\1@limiter.limit("' + limit + r'")\n'
    content = re.sub(pattern, replacement, content, count=1, flags=re.DOTALL)
    
    # Add http_request: Request to signature
    sig_pattern = r'(async def ' + func_name + r'\()'
    sig_replacement = r'\1http_request: Request, '
    content = re.sub(sig_pattern, sig_replacement, content, count=1)
    
    return content

content = patch_endpoint(content, "/register", "3/minute", "register", "user_data: UserCreate")
content = patch_endpoint(content, "/check-phone", "5/minute", "check_phone", "data: PhoneCheck")
content = patch_endpoint(content, "/token", "5/minute", "login_for_access_token", "form_data: OAuth2PasswordRequestForm")
content = patch_endpoint(content, "/forgot-password", "3/minute", "forgot_password", "")
content = patch_endpoint(content, "/reset-password", "3/minute", "reset_password_endpoint", "")
content = patch_endpoint(content, "/send-register-otp", "3/minute", "send_register_otp", "")
content = patch_endpoint(content, "/verify-register-otp", "5/minute", "verify_register_otp", "")
content = patch_endpoint(content, "/verify-upin", "5/minute", "verify_upin", "")

with open("routers/auth.py", "w") as f:
    f.write(content)
print("auth.py patched")
