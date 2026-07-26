import re

with open("routers/auth.py", "r") as f:
    content = f.read()

# First, rename existing request: Model to payload: Model
# We need to find `request: OtpRequest`, `request: OtpVerify`, `request: UpinVerify`
content = re.sub(r'request:\s*(OtpRequest|OtpVerify|UpinVerify)', r'payload: \1', content)
# Update usages of request.field to payload.field inside these functions
content = re.sub(r'request\.(phone_number|code|upin|session_id|email)', r'payload.\1', content)

# Now rename http_request: Request to request: Request
content = content.replace("http_request: Request", "request: Request")

with open("routers/auth.py", "w") as f:
    f.write(content)
print("auth fixed")
