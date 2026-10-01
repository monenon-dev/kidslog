from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_settings

ALGO = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def _encode(payload: dict, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({**payload, "iat": now, "exp": now + ttl}, get_settings().jwt_secret, algorithm=ALGO)


def decode(token: str, expected_type: str) -> dict:
    """만료·서명 오류는 jwt.PyJWTError로 올라간다."""
    data = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGO])
    if data.get("typ") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return data


def create_access_token(user_id: int) -> str:
    return _encode({"sub": str(user_id), "typ": "access"}, timedelta(minutes=get_settings().access_token_minutes))


def create_refresh_token(user_id: int) -> str:
    return _encode({"sub": str(user_id), "typ": "refresh"}, timedelta(days=get_settings().refresh_token_days))


def sign_storage(key: str, method: str, seconds: int) -> str:
    """로컬 스토리지용 서명 토큰 (R2 presigned URL을 흉내냄)."""
    return _encode({"key": key, "m": method, "typ": "storage"}, timedelta(seconds=seconds))
