from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import models, prefs, schemas
from ..db import get_db
from ..deps import current_user

router = APIRouter(tags=["me"])


# ---- 설정 ----


@router.get("/settings", response_model=schemas.UserPrefs)
def get_settings_(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    return prefs.get_prefs(db, user.id)


@router.put("/settings", response_model=schemas.UserPrefs)
def put_settings(body: schemas.UserPrefs, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    before = prefs.get_prefs(db, user.id)
    prefs.save_prefs(db, user.id, body)
    # 보관 기간을 새로 정하거나 줄이면 바로 정리
    if body.photo_retention_days and body.photo_retention_days != before.photo_retention_days:
        prefs.purge_old_photos(db, user.id)
    return body


# ---- 알림 ----


def _out(n: models.Notification) -> schemas.NotificationOut:
    # SQLite는 시간대 없이 돌려주므로 UTC로 붙여서 내보낸다 (브라우저가 현지 시각으로 읽지 않게)
    at = n.created_at if n.created_at.tzinfo else n.created_at.replace(tzinfo=timezone.utc)
    return schemas.NotificationOut(id=n.id, kind=n.kind, title=n.title, body=n.body, link=n.link, created_at=at, read=n.read_at is not None)


@router.get("/notifications", response_model=schemas.NotificationList)
def list_notifications(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    prefs.upkeep(db, user)
    items = db.scalars(
        select(models.Notification)
        .where(models.Notification.user_id == user.id)
        .order_by(models.Notification.id.desc())
        .limit(30)
    ).all()
    unread = db.scalar(
        select(func.count(models.Notification.id)).where(
            models.Notification.user_id == user.id, models.Notification.read_at.is_(None)
        )
    )
    return schemas.NotificationList(items=[_out(n) for n in items], unread=unread or 0)


@router.post("/notifications/{notification_id}/read", status_code=204)
def read_notification(notification_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.get(models.Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "알림을 찾을 수 없습니다")
    n.read_at = n.read_at or models.utcnow()
    db.commit()


@router.post("/notifications/read-all", status_code=204)
def read_all(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(
        update(models.Notification)
        .where(models.Notification.user_id == user.id, models.Notification.read_at.is_(None))
        .values(read_at=models.utcnow())
    )
    db.commit()


@router.delete("/notifications", status_code=204)
def clear_notifications(user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(models.Notification).filter(models.Notification.user_id == user.id).delete()
    db.commit()


_CLIENT_TEXT = {
    "storage_full": ("브라우저 저장 공간이 부족해요", "만든 영상을 이 브라우저에 보관하지 못했어요. 페이지를 나가기 전에 내려받아 주세요."),
    "draft_failed": ("영상 편집 내용을 저장하지 못했어요", "네트워크를 확인해 주세요. 연결되면 다시 자동 저장돼요."),
}


@router.post("/notifications/client", status_code=204)
def client_notification(body: schemas.ClientNotifyIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)):
    """브라우저에서만 알 수 있는 문제(저장 공간 부족 등)를 알림으로 남긴다. 같은 일은 하루 한 번."""
    from datetime import date

    title, text = _CLIENT_TEXT[body.event]
    prefs.notify(db, user.id, "storage", title, text, body.link, dedupe_key=f"{body.event}:{body.link}:{date.today().isoformat()}")
