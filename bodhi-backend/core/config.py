from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator
from typing import Optional

class StartupConfigurationError(Exception):
    """Custom exception raised when critical configuration is missing or invalid."""
    pass

class Settings(BaseSettings):
    # Database & Redis Settings
    database_url: str = Field(..., alias="DATABASE_URL")
    db_pool_size: int = Field(20, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(50, alias="DB_MAX_OVERFLOW")
    db_pool_recycle: int = Field(1800, alias="DB_POOL_RECYCLE")
    redis_url: Optional[str] = Field(None, alias="REDIS_URL")
    
    secret_key: str = Field(..., alias="SECRET_KEY")
    jwt_algorithm: str = Field("HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(10080, alias="ACCESS_TOKEN_EXPIRE_MINUTES") # 7 days
    
    # CORS Configuration
    allowed_origins: str = Field(
        "",
        alias="ALLOWED_ORIGINS"
    )

    # Security Headers Configuration
    permissions_policy: str = Field(
        "geolocation=(), microphone=(), camera=()", 
        alias="PERMISSIONS_POLICY"
    )

    # Rate Limiting Configuration
    rate_limit_enabled: bool = Field(True, alias="RATE_LIMIT_ENABLED")
    rate_limit_strategy: str = Field("memory", alias="RATE_LIMIT_STRATEGY")
    redis_url: Optional[str] = Field(None, alias="REDIS_URL")

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]
    
    # Optional settings that don't block startup but are centralized
    smtp_user: Optional[str] = Field(None, alias="SMTP_USER")
    smtp_password: Optional[str] = Field(None, alias="SMTP_PASSWORD")
    sender_email: Optional[str] = Field(None, alias="SENDER_EMAIL")
    sender_password: Optional[str] = Field(None, alias="SENDER_PASSWORD")
    sms_api_key: Optional[str] = Field(None, alias="SMS_API_KEY")
    sms_sender_id: Optional[str] = Field("FSTSMS", alias="SMS_SENDER_ID")

    # Payment / FinTech Settings (Required)
    razorpay_key_id: str = Field(..., alias="RAZORPAY_KEY_ID")
    razorpay_key_secret: str = Field(..., alias="RAZORPAY_KEY_SECRET")
    razorpay_webhook_secret: str = Field(..., alias="RAZORPAY_WEBHOOK_SECRET")

    # AI Integration Settings (Optional)
    gemini_api_key: Optional[str] = Field(None, alias="GEMINI_API_KEY")
    sarvam_api_key: Optional[str] = Field(None, alias="SARVAM_API_KEY")

    # OAuth Integration Settings (Optional)
    google_client_id_ios: Optional[str] = Field(None, alias="GOOGLE_CLIENT_ID_IOS")
    google_client_id_android: Optional[str] = Field(None, alias="GOOGLE_CLIENT_ID_ANDROID")
    google_client_id: Optional[str] = Field(None, alias="GOOGLE_CLIENT_ID")
    apple_app_bundle_id: str = Field("com.bodhi.app", alias="APPLE_APP_BUNDLE_ID")

    # RAG Settings (Optional)
    rag_chunk_size: int = Field(600, alias="RAG_CHUNK_SIZE")
    rag_chunk_overlap: int = Field(80, alias="RAG_CHUNK_OVERLAP")
    rag_top_k: int = Field(5, alias="RAG_TOP_K")
    rag_conf_high: float = Field(0.75, alias="RAG_CONF_HIGH")
    rag_conf_med: float = Field(0.45, alias="RAG_CONF_MED")

    # Internal Cron Settings (Required for Lambda deployment)
    cron_secret: str = Field(..., alias="CRON_SECRET")

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

    @field_validator("razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret")
    @classmethod
    def validate_razorpay_secrets(cls, v: str, info) -> str:
        if not v or not v.strip():
            raise StartupConfigurationError(f"CRITICAL SECURITY ERROR: {info.field_name} cannot be empty.")
        if v.strip() == "CHANGEME" or "test" in v.lower() and info.field_name == "razorpay_key_secret":
            # Just preventing "CHANGEME" values in production.
            if v.strip() == "CHANGEME":
                raise StartupConfigurationError(f"CRITICAL SECURITY ERROR: {info.field_name} is set to a placeholder (CHANGEME).")
        return v.strip()

try:
    settings = Settings()
except Exception as e:
    if isinstance(e, StartupConfigurationError):
        raise
    raise StartupConfigurationError(f"Startup configuration failed: {e}")
