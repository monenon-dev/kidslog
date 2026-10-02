"""업로드 → 전처리 → 분석 → 결과 저장 (계획서 5장 파이프라인).

초기엔 FastAPI BackgroundTasks로 실행한다. 부하가 커지면 이 함수를 그대로 RQ/Arq 작업으로 옮긴다.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models, prefs
from .ai import image_ops
from .ai.llm import LLMError
from .ai.tagger import tag_image
from .ai.tags import tag_dictionary
from .config import get_settings
from .db import SessionLocal
from .storage import get_storage

log = logging.getLogger("kidslog.pipeline")

DUPLICATE_HAMMING = 6  # dHash 64bit 중 6bit 이하 차이면 같은 장면으로 본다
THUMB_SIDE = 480


def ai_calls_today(db: Session, owner_id: int) -> int:
    since = datetime.now(timezone.utc) - timedelta(days=1)
    return db.scalar(
        select(func.count(models.Photo.id))
        .join(models.Klass, models.Klass.id == models.Photo.class_id)
        .where(
            models.Klass.owner_id == owner_id,
            models.Photo.ai_provider == "claude",
            models.Photo.created_at >= since,
        )
    ) or 0


def _find_duplicate(db: Session, photo: models.Photo) -> int | None:
    day = photo.effective_date
    rows = db.execute(
        select(models.Photo.id, models.Photo.phash, models.Photo.taken_at, models.Photo.created_at).where(
            models.Photo.class_id == photo.class_id,
            models.Photo.id != photo.id,
            models.Photo.phash.is_not(None),
            models.Photo.duplicate_of.is_(None),
        )
    ).all()
    best: tuple[int, int] | None = None
    for pid, ph, t, c in rows:
        if (t or c).date() != day:
            continue
        d = image_ops.hamming(ph, photo.phash)
        if d <= DUPLICATE_HAMMING and (best is None or d < best[1]):
            best = (pid, d)
    return best[0] if best else None


def analyze_photo(photo_id: int, blur_faces: bool = False) -> None:
    settings = get_settings()
    storage = get_storage()
    db = SessionLocal()
    try:
        photo = db.get(models.Photo, photo_id)
        if photo is None:
            return
        photo.status = "analyzing"
        photo.error = None
        db.commit()

        raw = storage.read(photo.storage_key)
        img = image_ops.open_image(raw)
        photo.width, photo.height = img.size
        photo.taken_at = photo.taken_at or image_ops.taken_at(raw)

        # 썸네일 (갤러리 로딩용)
        thumb_key = photo.storage_key.rsplit(".", 1)[0] + "_thumb.jpg"
        storage.write(thumb_key, image_ops.to_jpeg(image_ops.resized(img, THUMB_SIDE), 80), "image/jpeg")
        photo.thumb_key = thumb_key

        # 규칙 기반 품질 지표
        photo.sharpness = round(image_ops.laplacian_variance(img), 2)
        photo.brightness = round(image_ops.brightness(img), 2)
        photo.phash = image_ops.dhash(img)
        photo.duplicate_of = _find_duplicate(db, photo)

        # AI 태깅: 리사이즈 + (선택) 얼굴 블러 후 전송
        klass = db.get(models.Klass, photo.class_id)
        custom = db.scalars(select(models.CustomTag.name).where(models.CustomTag.owner_id == klass.owner_id)).all()
        tags = tag_dictionary(list(custom))

        provider = prefs.ai_provider_for(db, klass.owner_id)
        if provider == "claude":
            used = ai_calls_today(db, klass.owner_id)
            prefs.notify_ai_usage(db, klass.owner_id, used, settings.ai_daily_limit)
            if used >= settings.ai_daily_limit:
                log.warning("daily AI limit reached for user %s; using mock", klass.owner_id)
                provider = "mock"

        small = image_ops.resized(img, settings.ai_image_max_side)
        if blur_faces:
            small, photo.blur_applied = image_ops.blur_faces(small)

        result = tag_image(small, tags, provider)
        photo.ai_provider = result.provider
        photo.eyes_closed = result.eyes_closed
        photo.quality_score = image_ops.quality_score(photo.sharpness, photo.brightness, result.eyes_closed)

        # 교사가 직접 단 태그는 유지하고 AI 태그만 교체
        photo.tags = [t for t in photo.tags if t.source == "teacher"]
        teacher_tags = {t.tag for t in photo.tags}
        new_tags = [(result.activity, "activity", result.confidence)]
        new_tags += [(t, "activity", result.confidence * 0.6) for t in result.secondary]
        new_tags += [(o, "object", 0.8) for o in result.objects]
        if result.mood:
            new_tags.append((result.mood, "mood", 0.7))
        new_tags += [(f"품질:{i}", "quality", 0.8) for i in result.issues]
        for tag, kind, conf in new_tags:
            if tag not in teacher_tags:
                photo.tags.append(models.PhotoTag(tag=tag, kind=kind, confidence=round(conf, 3), source="ai"))

        if photo.meta is None:
            photo.meta = models.PhotoMeta(caption=result.caption)
        else:
            photo.meta.caption = result.caption

        photo.status = "done"
        db.commit()
        prefs.notify_analysis_done(db, photo.class_id)
    except LLMError as e:
        db.rollback()
        _fail(db, photo_id, str(e))
    except Exception as e:  # 한 장 실패가 전체 업로드를 막지 않게 한다
        log.exception("analyze failed for photo %s", photo_id)
        db.rollback()
        _fail(db, photo_id, f"분석 실패: {type(e).__name__}")
    finally:
        db.close()


def _fail(db: Session, photo_id: int, msg: str) -> None:
    photo = db.get(models.Photo, photo_id)
    if photo:
        photo.status = "failed"
        photo.error = msg
        db.commit()
        prefs.notify_analysis_done(db, photo.class_id)
