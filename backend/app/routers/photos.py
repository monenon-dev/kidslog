import uuid
from datetime import date, datetime, time, timedelta, timezone
from pathlib import PurePath

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..config import get_settings
from ..db import get_db
from ..deps import current_user, owned_class, owned_photo
from ..pipeline import analyze_photo
from ..serializers import LOW_QUALITY, photo_out
from ..storage import get_storage

router = APIRouter(prefix="/photos", tags=["photos"])

ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


@router.post("/presign", response_model=list[schemas.PresignOut])
def presign(body: schemas.PresignIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """업로드용 서명 URL 발급. 브라우저는 이 URL로 스토리지에 직접 PUT 한다."""
    owned_class(body.class_id, user, db)
    max_bytes = get_settings().max_upload_mb * 1024 * 1024
    storage = get_storage()
    out: list[schemas.PresignOut] = []
    for f in body.files:
        ext = ALLOWED_TYPES.get(f.content_type)
        if ext is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"지원하지 않는 형식입니다: {f.filename} (JPG/PNG/WEBP)")
        if f.size > max_bytes:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"파일이 너무 큽니다: {f.filename}")
        # 키에 원본 파일명을 넣지 않는다 (개인정보가 섞일 수 있음)
        key = f"u{user.id}/c{body.class_id}/{datetime.now(timezone.utc):%Y%m%d}/{uuid.uuid4().hex}.{ext}"
        p = models.Photo(
            class_id=body.class_id,
            storage_key=key,
            original_filename=PurePath(f.filename).name[:255],
            content_type=f.content_type,
            size_bytes=f.size,
            status="pending",
        )
        db.add(p)
        db.flush()
        out.append(schemas.PresignOut(photo_id=p.id, upload_url=storage.presign_put(key, f.content_type), filename=f.filename))
    db.commit()
    return out


@router.post("/complete", response_model=schemas.CompleteOut)
def complete(
    body: schemas.CompleteIn,
    background: BackgroundTasks,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """업로드 완료 알림 → 분석 작업 등록. 실제로 올라간 파일만 큐에 넣는다."""
    storage = get_storage()
    blur = get_settings().face_blur_default if body.blur_faces is None else body.blur_faces
    queued, missing = [], []
    for pid in dict.fromkeys(body.photo_ids):
        p = owned_photo(pid, user, db)
        if p.status not in ("pending", "failed"):
            continue
        if not storage.exists(p.storage_key):
            missing.append(pid)
            continue
        p.status = "uploaded"
        queued.append(pid)
    db.commit()
    for pid in queued:
        background.add_task(analyze_photo, pid, blur)
    return schemas.CompleteOut(queued=queued, missing=missing)


@router.get("", response_model=schemas.PhotoListOut)
def list_photos(
    class_id: int,
    tag: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    on: date | None = Query(default=None, alias="date"),
    child_id: int | None = None,
    quality: str | None = Query(default=None, pattern="^(good|flagged)$"),
    status_: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=60, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
):
    owned_class(class_id, user, db)
    stmt = select(models.Photo).where(models.Photo.class_id == class_id, models.Photo.status != "pending")
    if tag:
        stmt = stmt.where(models.Photo.tags.any(models.PhotoTag.tag == tag))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                models.Photo.meta.has(models.PhotoMeta.caption.ilike(like)),
                models.Photo.tags.any(models.PhotoTag.tag.ilike(like)),
            )
        )
    if on:
        start = datetime.combine(on, time.min, tzinfo=timezone.utc)
        eff = func.coalesce(models.Photo.taken_at, models.Photo.created_at)
        stmt = stmt.where(eff >= start, eff < start + timedelta(days=1))
    if child_id:
        stmt = stmt.where(models.Photo.children.any(models.Child.id == child_id))
    if status_:
        stmt = stmt.where(models.Photo.status == status_)
    if quality == "good":
        stmt = stmt.where(
            models.Photo.status == "done",
            models.Photo.quality_score >= LOW_QUALITY,
            models.Photo.duplicate_of.is_(None),
            or_(models.Photo.eyes_closed.is_(None), models.Photo.eyes_closed.is_(False)),
        )
    elif quality == "flagged":
        stmt = stmt.where(
            models.Photo.status == "done",
            or_(
                models.Photo.quality_score < LOW_QUALITY,
                models.Photo.duplicate_of.is_not(None),
                models.Photo.eyes_closed.is_(True),
            ),
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.options(selectinload(models.Photo.tags), selectinload(models.Photo.meta), selectinload(models.Photo.children))
        .order_by(func.coalesce(models.Photo.taken_at, models.Photo.created_at).desc(), models.Photo.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return schemas.PhotoListOut(items=[photo_out(p) for p in rows], total=total)


@router.get("/{photo_id}", response_model=schemas.PhotoOut)
def get_photo(photo_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    return photo_out(owned_photo(photo_id, user, db))


@router.put("/{photo_id}/tags", response_model=schemas.PhotoOut)
def set_tags(
    photo_id: int, body: schemas.PhotoTagsIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)
):
    """교사가 활동 태그를 확정한다. 교사 태그는 재분석해도 지워지지 않는다."""
    p = owned_photo(photo_id, user, db)
    wanted = list(dict.fromkeys(t.strip()[:30] for t in body.activity if t.strip()))
    p.tags = [t for t in p.tags if t.kind != "activity"]
    for i, t in enumerate(wanted):
        p.tags.append(models.PhotoTag(tag=t, kind="activity", confidence=1.0 if i == 0 else 0.9, source="teacher"))
    db.commit()
    return photo_out(p)


@router.put("/{photo_id}/children", response_model=schemas.PhotoOut)
def set_children(
    photo_id: int, body: schemas.PhotoChildrenIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)
):
    p = owned_photo(photo_id, user, db)
    kids = db.scalars(select(models.Child).where(models.Child.id.in_(body.child_ids))).all() if body.child_ids else []
    if any(c.class_id != p.class_id for c in kids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "다른 반 아이는 태그할 수 없습니다")
    p.children = list(kids)
    db.commit()
    return photo_out(p)


@router.post("/children/bulk", response_model=list[schemas.PhotoOut])
def bulk_children(
    body: schemas.BulkChildrenIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)
):
    """여러 장을 선택해 한 아이를 한 번에 태그/해제 (빠른 수동 태그)."""
    child = db.get(models.Child, body.child_id)
    if child is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "아이를 찾을 수 없습니다")
    owned_class(child.class_id, user, db)
    out = []
    for pid in dict.fromkeys(body.photo_ids):
        p = owned_photo(pid, user, db)
        if p.class_id != child.class_id:
            continue
        has = any(c.id == child.id for c in p.children)
        if body.add and not has:
            p.children.append(child)
        elif not body.add and has:
            p.children = [c for c in p.children if c.id != child.id]
        out.append(p)
    db.commit()
    return [photo_out(p) for p in out]


@router.post("/{photo_id}/reanalyze", response_model=schemas.PhotoOut)
def reanalyze(
    photo_id: int,
    background: BackgroundTasks,
    blur_faces: bool | None = None,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
):
    p = owned_photo(photo_id, user, db)
    if p.status in ("pending", "analyzing"):
        raise HTTPException(status.HTTP_409_CONFLICT, "아직 처리 중입니다")
    p.status = "uploaded"
    db.commit()
    blur = get_settings().face_blur_default if blur_faces is None else blur_faces
    background.add_task(analyze_photo, p.id, blur)
    return photo_out(p)


@router.delete("/{photo_id}", status_code=204)
def delete_photo(photo_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    p = owned_photo(photo_id, user, db)
    storage = get_storage()
    for key in (p.storage_key, p.thumb_key):
        if key:
            storage.delete(key)
    db.delete(p)
    db.commit()
