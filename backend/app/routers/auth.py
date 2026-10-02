import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..db import get_db
from ..deps import current_user
from ..prefs import delete_photo_files
from ..storage import get_storage
from ..security import create_access_token, create_refresh_token, decode, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "kidslog_refresh"


def _issue(user: models.User, response: Response) -> schemas.TokenOut:
    s = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        create_refresh_token(user.id),
        max_age=s.refresh_token_days * 86400,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        path="/",
    )
    return schemas.TokenOut(
        access_token=create_access_token(user.id),
        user=schemas.UserOut(id=user.id, email=user.email, name=user.name),
    )


@router.post("/signup", response_model=schemas.TokenOut, status_code=201)
def signup(body: schemas.SignupIn, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(models.User).where(models.User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 가입된 이메일입니다")
    user = models.User(email=email, password_hash=hash_password(body.password), name=body.name.strip())
    db.add(user)
    db.commit()
    return _issue(user, response)


@router.post("/login", response_model=schemas.TokenOut)
def login(body: schemas.LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(models.User).where(models.User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다")
    return _issue(user, response)


@router.post("/refresh", response_model=schemas.TokenOut)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
):
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "로그인이 필요합니다")
    try:
        data = decode(token, "refresh")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "다시 로그인해 주세요")
    user = db.get(models.User, int(data["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "다시 로그인해 주세요")
    return _issue(user, response)


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(REFRESH_COOKIE, path="/")


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(current_user)):
    return schemas.UserOut(id=user.id, email=user.email, name=user.name)


# ---- 프로필 ----


@router.patch("/me", response_model=schemas.UserOut)
def update_me(body: schemas.ProfileIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    user.name = body.name.strip()
    if not user.name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "이름을 입력해 주세요")
    db.commit()
    return schemas.UserOut(id=user.id, email=user.email, name=user.name)


@router.post("/password", status_code=204)
def change_password(body: schemas.PasswordIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "지금 비밀번호가 맞지 않습니다")
    user.password_hash = hash_password(body.new_password)
    db.commit()


@router.get("/me/stats", response_model=schemas.ProfileStats)
def my_stats(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    class_ids = select(models.Klass.id).where(models.Klass.owner_id == user.id)
    count = lambda model: db.scalar(select(func.count()).select_from(model).where(model.class_id.in_(class_ids))) or 0  # noqa: E731
    return schemas.ProfileStats(
        class_count=db.scalar(select(func.count()).select_from(models.Klass).where(models.Klass.owner_id == user.id)) or 0,
        photo_count=count(models.Photo),
        child_count=count(models.Child),
        video_count=count(models.Video),
        created_at=user.created_at,
    )


@router.delete("/me", status_code=204)
def delete_me(
    body: schemas.DeleteAccountIn, response: Response, user: models.User = Depends(current_user), db: Session = Depends(get_db)
):
    """계정과 반·사진·명단·영상 기록을 모두 지운다. 저장소의 사진 파일과 앨범 이미지도 함께."""
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "비밀번호가 맞지 않습니다")
    class_ids = select(models.Klass.id).where(models.Klass.owner_id == user.id)
    delete_photo_files(list(db.scalars(select(models.Photo).where(models.Photo.class_id.in_(class_ids))).all()))
    storage = get_storage()
    for key in db.scalars(
        select(models.Export.storage_key)
        .join(models.Group, models.Group.id == models.Export.group_id)
        .where(models.Group.class_id.in_(class_ids))
    ).all():
        try:
            storage.delete(key)
        except Exception:
            pass
    db.delete(user)  # 나머지 행은 FK ON DELETE CASCADE로 함께 지워진다
    db.commit()
    response.delete_cookie(REFRESH_COOKIE, path="/")
