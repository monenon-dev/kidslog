import json

from . import models, schemas
from .storage import get_storage

LOW_QUALITY = 45.0


def primary_activity(photo: models.Photo) -> str | None:
    acts = [t for t in photo.tags if t.kind == "activity"]
    if not acts:
        return None
    # 교사 태그 우선, 그다음 확신도
    acts.sort(key=lambda t: (t.source != "teacher", -t.confidence))
    return acts[0].tag


def photo_out(p: models.Photo) -> schemas.PhotoOut:
    storage = get_storage()
    ready = p.status not in ("pending",)
    return schemas.PhotoOut(
        id=p.id,
        class_id=p.class_id,
        url=storage.presign_get(p.storage_key) if ready else None,
        thumb_url=storage.presign_get(p.thumb_key) if p.thumb_key else None,
        original_filename=p.original_filename,
        status=p.status,
        error=p.error,
        taken_at=p.taken_at,
        created_at=p.created_at,
        date=p.effective_date,
        width=p.width,
        height=p.height,
        quality_score=p.quality_score,
        sharpness=p.sharpness,
        brightness=p.brightness,
        eyes_closed=p.eyes_closed,
        duplicate_of=p.duplicate_of,
        blur_applied=p.blur_applied,
        ai_provider=p.ai_provider,
        caption=p.meta.caption if p.meta else "",
        activity=primary_activity(p),
        tags=[
            schemas.PhotoTagOut(tag=t.tag, kind=t.kind, confidence=t.confidence, source=t.source)
            for t in sorted(p.tags, key=lambda t: (t.kind, -t.confidence))
        ],
        child_ids=[c.id for c in p.children],
        flagged=bool(
            p.status == "done"
            and (
                (p.quality_score is not None and p.quality_score < LOW_QUALITY)
                or p.eyes_closed
                or p.duplicate_of is not None
            )
        ),
    )


def note_out(n: models.Note, warnings: list[str] | None = None) -> schemas.NoteOut:
    return schemas.NoteOut(
        id=n.id,
        kind=n.kind,
        memo=n.memo,
        title=n.title,
        body=n.body,
        subtitles=json.loads(n.subtitles_json or "[]"),
        tone=n.tone,
        edited_by_teacher=n.edited_by_teacher,
        created_at=n.created_at,
        warnings=warnings or [],
    )


def group_out(g: models.Group) -> schemas.GroupOut:
    cover = next((gp for gp in g.photos if gp.is_cover), g.photos[0] if g.photos else None)
    thumb = None
    if cover and cover.photo.thumb_key:
        thumb = get_storage().presign_get(cover.photo.thumb_key)
    return schemas.GroupOut(
        id=g.id,
        class_id=g.class_id,
        date=g.date,
        title=g.title,
        activity=g.activity,
        cover_photo_id=cover.photo_id if cover else None,
        cover_thumb_url=thumb,
        photo_count=len(g.photos),
    )
