from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..ai.tags import DEFAULT_ACTIVITY_TAGS, tag_dictionary
from ..db import get_db
from ..deps import current_user, owned_class
from ..prefs import balance_rows, get_prefs

router = APIRouter(tags=["classes"])


def _class_out(db: Session, k: models.Klass) -> schemas.ClassOut:
    count = db.scalar(select(func.count(models.Photo.id)).where(models.Photo.class_id == k.id)) or 0
    return schemas.ClassOut(
        id=k.id,
        name=k.name,
        created_at=k.created_at,
        photo_count=count,
        children=[schemas.ChildOut(id=c.id, name=c.name) for c in k.children],
    )


@router.get("/classes", response_model=list[schemas.ClassOut])
def list_classes(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    ks = db.scalars(select(models.Klass).where(models.Klass.owner_id == user.id).order_by(models.Klass.id)).all()
    return [_class_out(db, k) for k in ks]


@router.post("/classes", response_model=schemas.ClassOut, status_code=201)
def create_class(body: schemas.ClassIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    k = models.Klass(owner_id=user.id, name=body.name.strip())
    db.add(k)
    db.commit()
    return _class_out(db, k)


@router.get("/classes/{class_id}", response_model=schemas.ClassOut)
def get_class(class_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    return _class_out(db, owned_class(class_id, user, db))


@router.delete("/classes/{class_id}", status_code=204)
def delete_class(class_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(owned_class(class_id, user, db))
    db.commit()


# ---- 아이 (수동 태그용 명단) ----


@router.post("/classes/{class_id}/children", response_model=list[schemas.ChildOut], status_code=201)
def add_children(
    class_id: int, body: schemas.ChildIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)
):
    k = owned_class(class_id, user, db)
    existing = {c.name for c in k.children}
    for raw in body.names:
        name = raw.strip()[:50]
        if name and name not in existing:
            k.children.append(models.Child(name=name))
            existing.add(name)
    db.commit()
    db.refresh(k)
    return [schemas.ChildOut(id=c.id, name=c.name) for c in k.children]


@router.delete("/classes/{class_id}/children/{child_id}", status_code=204)
def delete_child(class_id: int, child_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    owned_class(class_id, user, db)
    c = db.get(models.Child, child_id)
    if c is None or c.class_id != class_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "아이를 찾을 수 없습니다")
    db.delete(c)
    db.commit()


@router.get("/classes/{class_id}/balance", response_model=schemas.BalanceOut)
def balance(
    class_id: int,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """아이별 사진 수. 평균의 일정 비율(설정, 기본 70%) 미만이면 low로 표시한다."""
    k = owned_class(class_id, user, db)
    rows, avg, untagged, total = balance_rows(db, k, date_from, date_to, get_prefs(db, user.id).balance_ratio)
    return schemas.BalanceOut(rows=rows, average=round(avg, 1), untagged_photos=untagged, total_photos=total)


# ---- 활동 태그 사전 ----


@router.get("/tags")
def list_tags(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    custom = db.scalars(select(models.CustomTag.name).where(models.CustomTag.owner_id == user.id)).all()
    return {"default": DEFAULT_ACTIVITY_TAGS, "custom": list(custom), "all": tag_dictionary(list(custom))}


@router.post("/tags", status_code=201)
def add_tag(body: schemas.TagIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    name = body.name.strip()
    if name in DEFAULT_ACTIVITY_TAGS or name.startswith("품질:"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "이미 있는 태그이거나 사용할 수 없는 이름입니다")
    if not db.scalar(select(models.CustomTag).where(models.CustomTag.owner_id == user.id, models.CustomTag.name == name)):
        db.add(models.CustomTag(owner_id=user.id, name=name))
        db.commit()
    return list_tags(user, db)


@router.delete("/tags/{name}")
def delete_tag(name: str, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.scalar(select(models.CustomTag).where(models.CustomTag.owner_id == user.id, models.CustomTag.name == name))
    if t:
        db.delete(t)
        db.commit()
    return list_tags(user, db)
