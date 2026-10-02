import json
import re
import uuid
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import album, models, schemas
from ..ai.llm import LLMError
from ..ai.video_editor import edit_video
from ..prefs import ai_provider_for
from ..ai.writer import write_draft, write_subtitles
from ..config import get_settings
from ..db import get_db
from ..deps import current_user, owned_class, owned_group
from ..serializers import group_out, note_out, photo_out, primary_activity
from ..storage import get_storage

router = APIRouter(tags=["groups"])


def _detail(g: models.Group) -> schemas.GroupDetailOut:
    base = group_out(g)
    photos = sorted((gp.photo for gp in g.photos), key=lambda p: (p.taken_at or p.created_at, p.id))
    return schemas.GroupDetailOut(**base.model_dump(), photos=[photo_out(p) for p in photos], notes=[note_out(n) for n in g.notes])


def _best_cover(g: models.Group) -> None:
    if any(gp.is_cover for gp in g.photos) or not g.photos:
        return
    best = max(g.photos, key=lambda gp: (gp.photo.duplicate_of is None, gp.photo.quality_score or 0))
    best.is_cover = True


@router.post("/groups/auto", response_model=list[schemas.GroupOut])
def auto_group(body: schemas.AutoGroupIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """날짜 + 대표 활동 기준 자동 묶음. 이미 묶인 사진은 건드리지 않는다."""
    owned_class(body.class_id, user, db)
    grouped = set(
        db.scalars(
            select(models.GroupPhoto.photo_id)
            .join(models.Group, models.Group.id == models.GroupPhoto.group_id)
            .where(models.Group.class_id == body.class_id)
        ).all()
    )
    photos = db.scalars(
        select(models.Photo).where(models.Photo.class_id == body.class_id, models.Photo.status == "done")
    ).all()
    buckets: dict[tuple[date, str], list[models.Photo]] = defaultdict(list)
    for p in photos:
        if p.id in grouped or (body.date and p.effective_date != body.date):
            continue
        buckets[(p.effective_date, primary_activity(p) or "기타")].append(p)

    touched: list[models.Group] = []
    for (d, act), items in sorted(buckets.items()):
        g = db.scalar(
            select(models.Group).where(
                models.Group.class_id == body.class_id, models.Group.date == d, models.Group.activity == act
            )
        )
        if g is None:
            g = models.Group(class_id=body.class_id, date=d, activity=act, title=f"{d.month}월 {d.day}일 {act}")
            db.add(g)
        for p in items:
            g.photos.append(models.GroupPhoto(photo=p))
        _best_cover(g)
        touched.append(g)
    db.commit()
    return [group_out(g) for g in touched]


@router.get("/groups", response_model=list[schemas.GroupOut])
def list_groups(
    class_id: int,
    on: date | None = Query(default=None, alias="date"),
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
):
    owned_class(class_id, user, db)
    stmt = select(models.Group).where(models.Group.class_id == class_id)
    if on:
        stmt = stmt.where(models.Group.date == on)
    return [group_out(g) for g in db.scalars(stmt.order_by(models.Group.date.desc(), models.Group.id)).all()]


@router.get("/groups/{group_id}", response_model=schemas.GroupDetailOut)
def get_group(group_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    return _detail(owned_group(group_id, user, db))


@router.patch("/groups/{group_id}", response_model=schemas.GroupDetailOut)
def patch_group(
    group_id: int, body: schemas.GroupPatchIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)
):
    g = owned_group(group_id, user, db)
    if body.title is not None:
        g.title = body.title.strip() or g.title
    existing = {gp.photo_id for gp in g.photos}
    for pid in body.add_photo_ids:
        p = db.get(models.Photo, pid)
        if p and p.class_id == g.class_id and pid not in existing:
            g.photos.append(models.GroupPhoto(photo=p))
            existing.add(pid)
    if body.remove_photo_ids:
        g.photos = [gp for gp in g.photos if gp.photo_id not in set(body.remove_photo_ids)]
    if body.cover_photo_id is not None:
        if body.cover_photo_id not in {gp.photo_id for gp in g.photos}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "묶음에 없는 사진입니다")
        for gp in g.photos:
            gp.is_cover = gp.photo_id == body.cover_photo_id
    _best_cover(g)
    db.commit()
    return _detail(g)


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(owned_group(group_id, user, db))
    db.commit()


# ---- 문구·자막 초안 ----


def _name_warnings(db: Session, class_id: int, texts: list[str]) -> list[str]:
    names = db.scalars(select(models.Child.name).where(models.Child.class_id == class_id)).all()
    joined = "\n".join(texts)
    hits = [n for n in names if len(n) >= 2 and n in joined]
    return [f"아이 이름이 포함되어 있습니다: {', '.join(hits)}. 보내기 전에 확인하세요."] if hits else []


@router.post("/groups/{group_id}/note", response_model=schemas.NoteOut, status_code=201)
def generate_note(
    group_id: int, body: schemas.NoteIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)
):
    g = owned_group(group_id, user, db)
    lines = []
    for gp in g.photos:
        p = gp.photo
        if p.status != "done":
            continue
        acts = ", ".join(t.tag for t in p.tags if t.kind == "activity")
        cap = p.meta.caption if p.meta else ""
        lines.append(f"[{acts}] {cap}".strip())
    try:
        draft = write_draft(
            activity=g.activity,
            date_str=f"{g.date.month}월 {g.date.day}일",
            photo_lines=lines,
            memo=body.memo,
            tone=body.tone,
            kind=body.kind,
            subtitle_count=body.subtitle_count,
            provider=ai_provider_for(db, user.id),
        )
    except LLMError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))
    n = models.Note(
        group_id=g.id,
        kind=body.kind,
        memo=body.memo,
        title=draft.title,
        body=draft.body,
        subtitles_json=json.dumps(draft.subtitles, ensure_ascii=False),
        tone=body.tone,
        provider=draft.provider,
    )
    db.add(n)
    db.commit()
    return note_out(n, _name_warnings(db, g.class_id, [draft.title, draft.body, *draft.subtitles]))


@router.patch("/notes/{note_id}", response_model=schemas.NoteOut)
def patch_note(
    note_id: int, body: schemas.NotePatchIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)
):
    n = db.get(models.Note, note_id)
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "문구를 찾을 수 없습니다")
    owned_group(n.group_id, user, db)
    if body.title is not None:
        n.title = body.title
    if body.body is not None:
        n.body = body.body
    if body.subtitles is not None:
        n.subtitles_json = json.dumps([s[:60] for s in body.subtitles][:20], ensure_ascii=False)
    n.edited_by_teacher = True
    db.commit()
    return note_out(n)


# ---- 앨범 이미지 ----


@router.post("/groups/{group_id}/export", response_model=schemas.ExportOut, status_code=201)
def export_album(
    group_id: int, body: schemas.ExportIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)
):
    g = owned_group(group_id, user, db)
    cols, rows = album.TEMPLATES[body.template_id]
    in_group = {gp.photo_id: gp.photo for gp in g.photos}
    if body.photo_ids:
        photos = [in_group[pid] for pid in body.photo_ids if pid in in_group]
    else:
        cover = next((gp.photo_id for gp in g.photos if gp.is_cover), None)
        photos = sorted(
            (p for p in in_group.values() if p.status == "done"),
            key=lambda p: (p.id != cover, p.duplicate_of is not None, -(p.quality_score or 0)),
        )
    photos = photos[: cols * rows]
    if not photos:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "내보낼 사진이 없습니다")

    storage = get_storage()
    data = album.render(
        body.template_id,
        [storage.read(p.storage_key) for p in photos],
        title=body.title or g.title,
        subtitle=f"{g.date:%Y.%m.%d}",
    )
    key = f"u{user.id}/c{g.class_id}/exports/{uuid.uuid4().hex}.jpg"
    storage.write(key, data, "image/jpeg")
    e = models.Export(group_id=g.id, template_id=body.template_id, storage_key=key)
    db.add(e)
    db.commit()
    return schemas.ExportOut(id=e.id, url=storage.presign_get(key), template_id=e.template_id)


# ---- 영상 (브라우저 처리 결과 메타데이터만 등록) ----


@router.post("/videos", response_model=schemas.VideoOut, status_code=201)
def register_video(body: schemas.VideoIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    owned_class(body.class_id, user, db)
    if body.group_id is not None and owned_group(body.group_id, user, db).class_id != body.class_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "다른 반의 묶음입니다")
    v = models.Video(**body.model_dump())
    db.add(v)
    db.commit()
    return schemas.VideoOut(**body.model_dump(), id=v.id, created_at=v.created_at)


@router.get("/videos", response_model=list[schemas.VideoOut])
def list_videos(class_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    owned_class(class_id, user, db)
    vs = db.scalars(select(models.Video).where(models.Video.class_id == class_id).order_by(models.Video.id.desc())).all()
    return [
        schemas.VideoOut(
            id=v.id,
            created_at=v.created_at,
            **{k: getattr(v, k) for k in schemas.VideoIn.model_fields},
        )
        for v in vs
    ]


# ---- 영상 편집 설정 (반마다 하나, 자동 저장) ----


@router.get("/classes/{class_id}/video-draft", response_model=schemas.VideoDraftOut)
def get_video_draft(class_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    owned_class(class_id, user, db)
    d = db.get(models.VideoDraft, class_id)
    if d is None:
        return schemas.VideoDraftOut(data=None, updated_at=None)
    return schemas.VideoDraftOut(data=schemas.VideoDraftData.model_validate_json(d.data_json), updated_at=d.updated_at)


@router.put("/classes/{class_id}/video-draft", response_model=schemas.VideoDraftOut)
def put_video_draft(
    class_id: int, body: schemas.VideoDraftData, user: models.User = Depends(current_user), db: Session = Depends(get_db)
):
    owned_class(class_id, user, db)
    d = db.get(models.VideoDraft, class_id)
    if d is None:
        d = models.VideoDraft(class_id=class_id)
        db.add(d)
    d.data_json = body.model_dump_json()
    d.updated_at = models.utcnow()
    db.commit()
    return schemas.VideoDraftOut(data=body, updated_at=d.updated_at)


@router.delete("/classes/{class_id}/video-draft", status_code=204)
def delete_video_draft(class_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    owned_class(class_id, user, db)
    d = db.get(models.VideoDraft, class_id)
    if d is not None:
        db.delete(d)
        db.commit()


# ---- 반 없이 따로 만드는 영상의 편집 설정 (사용자마다 하나) ----


@router.get("/video-draft", response_model=schemas.VideoDraftOut)
def get_my_video_draft(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    d = db.get(models.UserVideoDraft, user.id)
    if d is None:
        return schemas.VideoDraftOut(data=None, updated_at=None)
    return schemas.VideoDraftOut(data=schemas.VideoDraftData.model_validate_json(d.data_json), updated_at=d.updated_at)


@router.put("/video-draft", response_model=schemas.VideoDraftOut)
def put_my_video_draft(body: schemas.VideoDraftData, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    d = db.get(models.UserVideoDraft, user.id)
    if d is None:
        d = models.UserVideoDraft(user_id=user.id)
        db.add(d)
    d.data_json = body.model_dump_json()
    d.updated_at = models.utcnow()
    db.commit()
    return schemas.VideoDraftOut(data=body, updated_at=d.updated_at)


# ---- 영상 자막 초안 (영상 만들기 화면에서만 만든다) ----


@router.post("/video-subtitles", response_model=schemas.SubtitleOut)
def draft_subtitles(body: schemas.SubtitleIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    if body.class_id is not None:
        owned_class(body.class_id, user, db)
    try:
        d = write_subtitles(memo=body.memo, tone=body.tone, count=body.count, provider=ai_provider_for(db, user.id))
    except LLMError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))
    warnings = _name_warnings(db, body.class_id, [d.title, *d.subtitles]) if body.class_id is not None else []
    return schemas.SubtitleOut(title=d.title, subtitles=d.subtitles, provider=d.provider, warnings=warnings)


@router.post("/video-edit", response_model=schemas.VideoEditOut)
def video_edit(body: schemas.VideoEditIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """말로 한 편집 부탁 → 바꿀 설정만 돌려준다 (적용은 브라우저에서, 영상은 받지 않음)."""
    if body.class_id is not None:
        owned_class(body.class_id, user, db)
    provider = ai_provider_for(db, user.id)
    n = len(body.state.clips)
    current = min(body.current, max(n, 1))
    try:
        out = edit_video(instruction=body.instruction, state=body.state.model_dump(), current=current, provider=provider)
    except LLMError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))
    # AI 응답을 그대로 믿지 않고 범위·형식을 한 번 더 거른다
    subs = {}
    for c in out.get("subtitles") or []:
        if 1 <= int(c["clip"]) <= n:
            subs[int(c["clip"])] = str(c["text"]).strip()[:40]
    color = out.get("color")
    if color and not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
        color = None
    max_sec = out.get("max_sec")
    title = out.get("title")
    res = schemas.VideoEditOut(
        reply=str(out.get("reply") or "").strip() or "바꿀 내용을 찾지 못했어요.",
        title=title.strip()[:30] if isinstance(title, str) else None,
        subtitles=[schemas.SubtitleChange(clip=k, text=v) for k, v in sorted(subs.items())],
        font=out.get("font"),
        size=out.get("size"),
        color=color.upper() if color else None,
        effect=out.get("effect"),
        position=out.get("position"),
        music=out.get("music"),
        max_sec=min(60, max(3, int(max_sec))) if isinstance(max_sec, int) else None,
        provider="claude" if provider == "claude" else "mock",
    )
    if body.class_id is not None:
        res.warnings = _name_warnings(db, body.class_id, [res.title or "", *(s.text for s in res.subtitles)])
    return res
