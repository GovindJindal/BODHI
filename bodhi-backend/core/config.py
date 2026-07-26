from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator
from typing import Optional

class StartupConfigurationError(Exception):
    """Custom exception raised when critical configuration is missing or invalid."""
    pass

class Settings(BaseSettings):
    database_url: str = Field(..., alias="DATABASE_URL")
    secret_key: str = Field(..., alias="SECRET_KEY")
    jwt_algorithm: str = Field("HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(10080, alias="ACCESS_TOKEN_EXPIRE_MINUTES") # 7 days
    
    # Optional settings that don't block startup but are centralized
    smtp_user: Optional[str] = Field(None, alias="SMTP_USER")
    smtp_password: Optional[str] = Field(None, alias="SMTP_PASSWORD")
    sender_email: Optional[str] = Field(None, alias="SENDER_EMAIL")
    sender_password: Optional[str] = Field(None, alias="SENDER_PASSWORD")
    sms_api_key: Optional[str] = Field(None, alias="SMS_API_KEY")
    sms_sender_id: Optional[str] = Field("FSTSMS", alias="SMS_SENDER_ID")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True
    )

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if not v or not v.strip():
            raise StartupConfigurationError("CRITICAL SECURITY ERROR: SECRET_KEY cannot be empty or whitespace.")
        if len(v.strip()) < 32:
            raise StartupConfigurationError("CRITICAL SECURITY ERROR: SECRET_KEY must be at least 32 characters long.")
        return v.strip()

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v or not v.strip():
            raise StartupConfigurationError("CRITICAL CONFIGURATION ERROR: DATABASE_URL cannot be empty or whitespace.")
        return v.strip()

try:
    settings = Settings()
except Exception as e:
    if isinstance(e, StartupConfigurationError):
        raise
    raise StartupConfigurationError(f"Startup configuration failed: {e}")
