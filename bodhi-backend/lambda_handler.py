import os

# Ensure the Lambda runtime knows we are inside AWS
os.environ["AWS_EXECUTION_ENV"] = os.environ.get("AWS_EXECUTION_ENV", "AWS_Lambda_Python")

from mangum import Mangum
from main import app

# Create the handler
# We fixed the lifespan natively in main.py, so Mangum's default lifespan handling ("auto") is safe.
handler = Mangum(app, lifespan="auto")
