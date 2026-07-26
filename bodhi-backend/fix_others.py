for filepath in ["routers/ai.py", "routers/payments.py"]:
    with open(filepath, "r") as f:
        content = f.read()
    content = content.replace("http_request: Request", "request: Request")
    with open(filepath, "w") as f:
        f.write(content)
print("others fixed")
