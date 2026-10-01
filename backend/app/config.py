from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./kidslog.db"

    jwt_secret: str = "dev-secret-change-me-0123456789abcdef"
    access_token_minutes: int = 30
    refresh_token_days: int = 14
    cookie_secure: bool = False

    cors_origins: str = "http://localhost:3000"

    # storage: "local" (개발용, 백엔드가 서명 URL을 흉내냄) | "r2"
    storage_backend: str = "local"
    local_storage_dir: str = "./storage"
    # 브라우저가 로컬 스토리지 URL에 접근할 때 쓰는 prefix (Next.js rewrite: /api -> backend)
    local_storage_url_prefix: str = "/api"
    signed_url_seconds: int = 900

    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "kidslog"

    # AI: "claude" | "mock" | "" (자동: API 키가 있으면 claude)
    ai_provider: str = ""
    anthropic_api_key: str = ""
    claude_model: str = "claude-opus-5-5"
    ai_daily_limit: int = 300  # 사용자당 하루 AI 분석 호출 상한
    ai_image_max_side: int = 1024  # 전송 전 리사이즈
    face_blur_default: bool = False

    max_upload_mb: int = 25

    @property
    def resolved_ai_provider(self) -> str:
        if self.ai_provider:
            return self.ai_provider
        return "claude" if self.anthropic_api_key else "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()
