"""스토리지 추상화.

- R2Storage: Cloudflare R2(S3 호환). 비공개 버킷 + 만료되는 presigned URL.
- LocalStorage: 개발용. 같은 흐름(서명 URL로 직접 PUT/GET)을 백엔드 엔드포인트로 흉내낸다.
"""

from functools import lru_cache
from pathlib import Path
from typing import Protocol

from .config import get_settings
from .security import sign_storage


class Storage(Protocol):
    def presign_put(self, key: str, content_type: str) -> str: ...
    def presign_get(self, key: str) -> str: ...
    def read(self, key: str) -> bytes: ...
    def write(self, key: str, data: bytes, content_type: str) -> None: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, root: str, url_prefix: str, ttl: int):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.url_prefix = url_prefix.rstrip("/")
        self.ttl = ttl

    def path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if not p.is_relative_to(self.root):
            raise ValueError("invalid key")
        return p

    def presign_put(self, key: str, content_type: str) -> str:
        return f"{self.url_prefix}/storage/{key}?token={sign_storage(key, 'PUT', self.ttl)}"

    def presign_get(self, key: str) -> str:
        return f"{self.url_prefix}/storage/{key}?token={sign_storage(key, 'GET', self.ttl)}"

    def read(self, key: str) -> bytes:
        return self.path(key).read_bytes()

    def write(self, key: str, data: bytes, content_type: str) -> None:
        p = self.path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def exists(self, key: str) -> bool:
        return self.path(key).is_file()

    def delete(self, key: str) -> None:
        self.path(key).unlink(missing_ok=True)


class R2Storage:
    def __init__(self, account_id: str, access_key: str, secret_key: str, bucket: str, ttl: int):
        import boto3
        from botocore.config import Config

        self.bucket = bucket
        self.ttl = ttl
        self.s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )

    def presign_put(self, key: str, content_type: str) -> str:
        return self.s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=self.ttl,
        )

    def presign_get(self, key: str) -> str:
        return self.s3.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=self.ttl
        )

    def read(self, key: str) -> bytes:
        return self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def write(self, key: str, data: bytes, content_type: str) -> None:
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError:
            return False

    def delete(self, key: str) -> None:
        self.s3.delete_object(Bucket=self.bucket, Key=key)


@lru_cache
def get_storage() -> Storage:
    s = get_settings()
    if s.storage_backend == "r2":
        return R2Storage(s.r2_account_id, s.r2_access_key_id, s.r2_secret_access_key, s.r2_bucket, s.signed_url_seconds)
    return LocalStorage(s.local_storage_dir, s.local_storage_url_prefix, s.signed_url_seconds)
