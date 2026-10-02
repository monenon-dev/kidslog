"""사용자 설정과 앱 안 알림.

- 설정은 user_prefs 테이블에 JSON 한 덩어리로 둔다 (항목이 늘어도 스키마 변경 없음).
- 알림은 notifications 테이블. 같은 일로 여러 번 쌓이지 않게 dedupe_key를 쓴다.
- 사진 보관 기간 정리와 '사진이 적은 아이' 알림은 따로 스케줄러를 두지 않고,
  선생님이 앱을 쓰는 동안(알림 목록을 불러올 때) 한 시간에 한 번씩 확인한다.
"""

import logging
import time
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models, schemas
from .config import get_settings
from .storage import get_storage

log = logging.getLogger("kidslog.prefs")


# ---- 설정 ----


def get_prefs(db: Session, user_id: int) -> schemas.UserPrefs:
    row = db.get(models.UserPrefs, user_id)
    if row is None:
        return schemas.UserPrefs()
    try:
        return schemas.UserPrefs.model_validate_json(row.data_json)
    except ValueError:
        return schemas.UserPrefs()


def save_prefs(db: Session, user_id: int, prefs: schemas.UserPrefs) -> None:
    row = db.get(models.UserPrefs, user_id)
    if row is None:
        row = models.UserPrefs(user_id=user_id)
        db.add(row)
    row.data_json = prefs.model_dump_json()
    row.updated_at = models.utcnow()
    db.commit()


def ai_provider_for(db: Session, user_id: int) -> str:
    """설정에서 AI를 끄면 그 사용자는 항상 규칙 기반(모의)으로 처리한다."""
    if not get_prefs(db, user_id).ai_enabled:
        return "mock"
    return get_settings().resolved_ai_provider


# ---- 알림 ----


def notify(
    db: Session,
    user_id: int,
    kind: str,
    title: str,
    body: str = "",
    link: str = "",
    dedupe_key: str | None = None,
) -> models.Notification | None:
    """알림 설정에서 끈 종류는 만들지 않는다. dedupe_key가 같은 알림은 한 번만."""
    if not getattr(get_prefs(db, user_id).notify, kind, True):
        return None
    if dedupe_key and db.scalar(
        select(models.Notification.id).where(models.Notification.user_id == user_id, models.Notification.dedupe_key == dedupe_key)
    ):
        return None
    n = models.Notification(user_id=user_id, kind=kind, title=title[:100], body=body[:300], link=link[:200], dedupe_key=dedupe_key)
    db.add(n)
    try:
        db.commit()
    except IntegrityError:  # 동시에 같은 알림을 만들려 한 경우
        db.rollback()
        return None
    return n


def notify_analysis_done(db: Session, class_id: int) -> None:
    """반의 분석 대기 사진이 모두 끝났을 때, 지난 알림 이후 올라온 사진을 묶어 한 번 알린다."""
    pending = db.scalar(
        select(func.count(models.Photo.id)).where(
            models.Photo.class_id == class_id, models.Photo.status.in_(("uploaded", "analyzing"))
        )
    )
    if pending:
        return
    klass = db.get(models.Klass, class_id)
    if klass is None:
        return
    link = f"/classes/{class_id}?tab=gallery"
    last = db.scalar(
        select(func.max(models.Notification.created_at)).where(
            models.Notification.user_id == klass.owner_id, models.Notification.kind == "analysis", models.Notification.link == link
        )
    )
    q = select(models.Photo.status, func.count()).where(models.Photo.class_id == class_id, models.Photo.status.in_(("done", "failed")))
    if last is not None:
        q = q.where(models.Photo.created_at > last)
    counts = dict(db.execute(q.group_by(models.Photo.status)).all())
    done, failed = counts.get("done", 0), counts.get("failed", 0)
    if done + failed == 0:
        return
    body = f"{done}장 정리가 끝났어요." + (f" {failed}장은 분석하지 못했어요. 사진을 눌러 다시 분석할 수 있어요." if failed else "")
    notify(db, klass.owner_id, "analysis", f"{klass.name} 사진 분석 완료", body, link)


def notify_ai_usage(db: Session, user_id: int, used: int, limit: int) -> None:
    today = date.today().isoformat()
    if used >= limit:
        notify(
            db, user_id, "ai_limit", "오늘 AI 분석 한도에 닿았어요",
            f"하루 {limit}장까지 AI로 분석해요. 오늘 남은 사진은 간단한 규칙 기반으로 정리되고, 내일 다시 분석할 수 있어요.",
            "/profile?tab=privacy", dedupe_key=f"ai_limit:{today}",
        )
    elif used >= int(limit * 0.8):
        notify(
            db, user_id, "ai_limit", "AI 분석 한도에 가까워졌어요",
            f"오늘 {used}/{limit}장을 AI로 분석했어요. 한도를 넘으면 규칙 기반으로 정리돼요.",
            "/profile?tab=privacy", dedupe_key=f"ai_limit80:{today}",
        )


def balance_rows(db: Session, klass: models.Klass, date_from: date | None, date_to: date | None, ratio: float):
    photos = db.scalars(
        select(models.Photo).where(models.Photo.class_id == klass.id, models.Photo.status != "pending")
    ).all()
    photos = [
        p
        for p in photos
        if (date_from is None or p.effective_date >= date_from) and (date_to is None or p.effective_date <= date_to)
    ]
    counts = {c.id: 0 for c in klass.children}
    untagged = 0
    for p in photos:
        if not p.children:
            untagged += 1
        for c in p.children:
            counts[c.id] = counts.get(c.id, 0) + 1
    avg = sum(counts.values()) / len(counts) if counts else 0.0
    rows = [
        schemas.BalanceRow(child_id=c.id, name=c.name, count=counts[c.id], low=avg > 0 and counts[c.id] < avg * ratio)
        for c in klass.children
    ]
    rows.sort(key=lambda r: (r.count, r.name))
    return rows, avg, untagged, len(photos)


def check_low_photos(db: Session, user_id: int) -> None:
    """반마다 일주일에 한 번, 설정한 기간에 사진이 적게 찍힌 아이가 있으면 알린다."""
    prefs = get_prefs(db, user_id)
    if not prefs.notify.low_photos:
        return
    year, week, _ = date.today().isocalendar()
    today = date.today()
    for k in db.scalars(select(models.Klass).where(models.Klass.owner_id == user_id)).all():
        key = f"low:{k.id}:{year}-{week}"
        if not k.children or db.scalar(
            select(models.Notification.id).where(models.Notification.user_id == user_id, models.Notification.dedupe_key == key)
        ):
            continue
        rows, avg, _, _ = balance_rows(db, k, today - timedelta(days=prefs.balance_days - 1), today, prefs.balance_ratio)
        low = [r for r in rows if r.low]
        if not low:
            continue
        names = ", ".join(r.name for r in low[:5]) + (f" 외 {len(low) - 5}명" if len(low) > 5 else "")
        notify(
            db, user_id, "low_photos", f"{k.name}: 사진이 적게 찍힌 아이 {len(low)}명",
            f"최근 {prefs.balance_days}일 평균 {avg:.1f}장보다 적어요: {names}. 다음 활동 때 챙겨 주세요.",
            f"/classes/{k.id}?tab=balance", dedupe_key=key,
        )


# ---- 사진 보관 기간 ----


def delete_photo_files(photos: list[models.Photo]) -> None:
    storage = get_storage()
    for p in photos:
        for key in (p.storage_key, p.thumb_key):
            if key:
                try:
                    storage.delete(key)
                except Exception:  # 파일이 이미 없어도 DB 정리는 계속
                    log.warning("storage delete failed: %s", key)


def purge_old_photos(db: Session, user_id: int) -> int:
    days = get_prefs(db, user_id).photo_retention_days
    if not days:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    old = db.scalars(
        select(models.Photo)
        .join(models.Klass, models.Klass.id == models.Photo.class_id)
        .where(models.Klass.owner_id == user_id, models.Photo.created_at < cutoff)
    ).all()
    if not old:
        return 0
    delete_photo_files(list(old))
    for p in old:
        db.delete(p)
    db.commit()
    notify(
        db, user_id, "retention", f"보관 기간이 지난 사진 {len(old)}장을 지웠어요",
        f"설정한 보관 기간({days}일)이 지난 사진과 썸네일을 서버에서 지웠어요.", "/profile?tab=privacy",
    )
    return len(old)


_last_upkeep: dict[tuple[int, str], float] = {}


def upkeep(db: Session, user: models.User, force: bool = False) -> None:
    """앱을 쓰는 동안 한 시간에 한 번: 보관 기간 정리 + 사진 적은 아이 확인."""
    user_id = user.id
    key = (user_id, str(user.created_at))  # 지운 계정의 id가 다시 쓰여도 섞이지 않게
    now = time.monotonic()
    if not force and now - _last_upkeep.get(key, -1e9) < 3600:
        return
    _last_upkeep[key] = now
    try:
        purge_old_photos(db, user_id)
        check_low_photos(db, user_id)
    except Exception:
        log.exception("upkeep failed for user %s", user_id)
        db.rollback()
