"""개발용 로컬 스토리지 엔드포인트. R2 presigned URL과 같은 방식(토큰 = 키·메서드·만료 서명)으로 동작한다."""

import mimetypes

import jwt
from fastapi import APIRouter, HTTPException, Request, Response, status

from ..config import get_settings
from ..security import decode
from ..storage import LocalStorage, get_storage

router = APIRouter(prefix="/storage", include_in_schema=False)


def _check(key: str, token: str, method: str) -> LocalStorage:
    storage = get_storage()
    if not isinstance(storage, LocalStorage):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    try:
        data = decode(token, "storage")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "만료되었거나 올바르지 않은 URL입니다")
    if data.get("key") != key or data.get("m") != method:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "올바르지 않은 URL입니다")
    return storage


@router.put("/{key:path}", status_code=200)
async def put_object(key: str, token: str, request: Request):
    storage = _check(key, token, "PUT")
    limit = get_settings().max_upload_mb * 1024 * 1024
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "파일이 너무 큽니다")
    storage.write(key, bytes(body), request.headers.get("content-type", "application/octet-stream"))
    return {"ok": True}


@router.get("/{key:path}")
def get_object(key: str, token: str):
    storage = _check(key, token, "GET")
    if not storage.exists(key):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    media = mimetypes.guess_type(key)[0] or "application/octet-stream"
    return Response(storage.read(key), media_type=media, headers={"Cache-Control": "private, max-age=600"})
