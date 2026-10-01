import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models
from .db import get_db
from .security import decode

_bearer = HTTPBearer(auto_error=False)


def current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.User:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "로그인이 필요합니다")
    try:
        data = decode(cred.credentials, "access")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "토큰이 만료되었거나 올바르지 않습니다")
    user = db.get(models.User, int(data["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "사용자를 찾을 수 없습니다")
    return user


def owned_class(class_id: int, user: models.User, db: Session) -> models.Klass:
    k = db.get(models.Klass, class_id)
    if k is None or k.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "반을 찾을 수 없습니다")
    return k


def owned_photo(photo_id: int, user: models.User, db: Session) -> models.Photo:
    p = db.get(models.Photo, photo_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사진을 찾을 수 없습니다")
    owned_class(p.class_id, user, db)
    return p


def owned_group(group_id: int, user: models.User, db: Session) -> models.Group:
    g = db.get(models.Group, group_id)
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "묶음을 찾을 수 없습니다")
    owned_class(g.class_id, user, db)
    return g
