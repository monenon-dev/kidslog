from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Klass(Base):
    """반(class). `class`는 예약어라 Klass로 둔다."""

    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    children: Mapped[list["Child"]] = relationship(
        back_populates="klass", cascade="all, delete-orphan", order_by="Child.name"
    )


class Child(Base):
    """아이별 균형 보기용. 얼굴 인식 없이 교사가 수동으로 태그한다."""

    __tablename__ = "children"
    __table_args__ = (UniqueConstraint("class_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    klass: Mapped[Klass] = relationship(back_populates="children")


class CustomTag(Base):
    """사용자 정의 활동 태그. 다음 분석부터 프롬프트의 태그 사전에 반영된다."""

    __tablename__ = "custom_tags"
    __table_args__ = (UniqueConstraint("owner_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(30))


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    storage_key: Mapped[str] = mapped_column(String(255), unique=True)
    thumb_key: Mapped[str | None] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255), default="")
    content_type: Mapped[str] = mapped_column(String(50), default="image/jpeg")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    # pending(URL 발급됨) -> uploaded -> analyzing -> done | failed
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    error: Mapped[str | None] = mapped_column(Text)

    quality_score: Mapped[float | None] = mapped_column(Float)  # 0~100
    sharpness: Mapped[float | None] = mapped_column(Float)  # Laplacian 분산
    brightness: Mapped[float | None] = mapped_column(Float)  # 0~255
    eyes_closed: Mapped[bool | None] = mapped_column(Boolean)
    phash: Mapped[str | None] = mapped_column(String(16))
    duplicate_of: Mapped[int | None] = mapped_column(ForeignKey("photos.id", ondelete="SET NULL"))
    blur_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_provider: Mapped[str | None] = mapped_column(String(20))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    tags: Mapped[list["PhotoTag"]] = relationship(cascade="all, delete-orphan")
    meta: Mapped["PhotoMeta | None"] = relationship(cascade="all, delete-orphan", uselist=False)
    children: Mapped[list[Child]] = relationship(secondary="photo_children")

    @property
    def effective_date(self) -> date:
        return (self.taken_at or self.created_at).date()


class PhotoTag(Base):
    __tablename__ = "photo_tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id", ondelete="CASCADE"), index=True)
    tag: Mapped[str] = mapped_column(String(30), index=True)
    kind: Mapped[str] = mapped_column(String(10), default="activity")  # activity|object|mood|quality
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source: Mapped[str] = mapped_column(String(10), default="ai")  # ai|teacher


class PhotoMeta(Base):
    __tablename__ = "photo_meta"

    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id", ondelete="CASCADE"), primary_key=True)
    caption: Mapped[str] = mapped_column(Text, default="")
    # 선택 항목: 임베딩 검색 시 pgvector 컬럼으로 교체
    embedding: Mapped[str | None] = mapped_column(Text)


class PhotoChild(Base):
    __tablename__ = "photo_children"

    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id", ondelete="CASCADE"), primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id", ondelete="CASCADE"), primary_key=True)


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    title: Mapped[str] = mapped_column(String(100))
    activity: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    photos: Mapped[list["GroupPhoto"]] = relationship(cascade="all, delete-orphan")
    notes: Mapped[list["Note"]] = relationship(cascade="all, delete-orphan", order_by="Note.id.desc()")


class GroupPhoto(Base):
    __tablename__ = "group_photos"

    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id", ondelete="CASCADE"), primary_key=True)
    is_cover: Mapped[bool] = mapped_column(Boolean, default=False)

    photo: Mapped[Photo] = relationship()


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10), default="notice")  # notice(알림장)|subtitle(자막)
    memo: Mapped[str] = mapped_column(Text, default="")
    title: Mapped[str] = mapped_column(String(100), default="")
    body: Mapped[str] = mapped_column(Text)
    subtitles_json: Mapped[str] = mapped_column(Text, default="[]")
    provider: Mapped[str] = mapped_column(String(20), default="mock")
    tone: Mapped[str] = mapped_column(String(10), default="warm")  # warm|concise
    edited_by_teacher: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Export(Base):
    __tablename__ = "exports"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[str] = mapped_column(String(20))
    storage_key: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Video(Base):
    """브라우저에서 만든 영상의 메타데이터. 영상 파일 자체는 서버로 오지 않는다."""

    __tablename__ = "videos"

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    group_id: Mapped[int | None] = mapped_column(ForeignKey("groups.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(100), default="")
    clip_count: Mapped[int] = mapped_column(Integer)
    input_total_mb: Mapped[float] = mapped_column(Float, default=0)
    output_seconds: Mapped[float] = mapped_column(Float, default=0)
    processing_ms: Mapped[int] = mapped_column(Integer)  # 4주차 성능 측정용
    resolution: Mapped[str] = mapped_column(String(20), default="1280x720")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class VideoDraft(Base):
    """영상 편집 설정(제목·클립 순서·자막·꾸밈·음악 선택). 반마다 하나.
    영상 파일은 저장하지 않고, 클립은 다시 넣었을 때 맞춰 보기 위한 파일 이름·크기만 둔다."""

    __tablename__ = "video_drafts"

    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True)
    data_json: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class UserVideoDraft(Base):
    """반 없이 따로 만드는 영상의 편집 설정. 사용자마다 하나 (형식은 VideoDraft와 같음)."""

    __tablename__ = "user_video_drafts"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    data_json: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class UserPrefs(Base):
    """사용자 설정 (JSON 한 덩어리, 형식은 schemas.UserPrefs)."""

    __tablename__ = "user_prefs"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    data_json: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Notification(Base):
    """앱 안 알림. kind: analysis | low_photos | ai_limit | storage | retention"""

    __tablename__ = "notifications"
    __table_args__ = (UniqueConstraint("user_id", "dedupe_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(100))
    body: Mapped[str] = mapped_column(String(300), default="")
    link: Mapped[str] = mapped_column(String(200), default="")
    dedupe_key: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
