from datetime import date as Date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileStats(BaseModel):
    class_count: int
    photo_count: int
    child_count: int
    video_count: int
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    user: UserOut


class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ChildOut(BaseModel):
    id: int
    name: str


class ClassOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    photo_count: int = 0
    children: list[ChildOut] = []


class ChildIn(BaseModel):
    names: list[str] = Field(min_length=1, max_length=60)


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=30)


class PresignFile(BaseModel):
    filename: str = Field(max_length=255)
    content_type: str
    size: int = Field(gt=0)


class PresignIn(BaseModel):
    class_id: int
    files: list[PresignFile] = Field(min_length=1, max_length=50)


class PresignOut(BaseModel):
    photo_id: int
    upload_url: str
    filename: str


class CompleteIn(BaseModel):
    photo_ids: list[int] = Field(min_length=1, max_length=50)
    blur_faces: bool | None = None


class CompleteOut(BaseModel):
    queued: list[int]
    missing: list[int]


class PhotoTagOut(BaseModel):
    tag: str
    kind: str
    confidence: float
    source: str


class PhotoOut(BaseModel):
    id: int
    class_id: int
    url: str | None
    thumb_url: str | None
    original_filename: str
    status: str
    error: str | None
    taken_at: datetime | None
    created_at: datetime
    date: Date
    width: int | None
    height: int | None
    quality_score: float | None
    sharpness: float | None
    brightness: float | None
    eyes_closed: bool | None
    duplicate_of: int | None
    blur_applied: bool
    ai_provider: str | None
    caption: str
    activity: str | None
    tags: list[PhotoTagOut]
    child_ids: list[int]
    flagged: bool


class PhotoListOut(BaseModel):
    items: list[PhotoOut]
    total: int


class PhotoTagsIn(BaseModel):
    activity: list[str] = Field(default_factory=list, max_length=10)


class PhotoChildrenIn(BaseModel):
    child_ids: list[int] = Field(default_factory=list, max_length=60)


class BulkChildrenIn(BaseModel):
    photo_ids: list[int] = Field(min_length=1, max_length=200)
    child_id: int
    add: bool = True


class BalanceRow(BaseModel):
    child_id: int
    name: str
    count: int
    low: bool


class BalanceOut(BaseModel):
    rows: list[BalanceRow]
    average: float
    untagged_photos: int
    total_photos: int


class AutoGroupIn(BaseModel):
    class_id: int
    date: Date | None = None


class NoteOut(BaseModel):
    id: int
    kind: str
    memo: str
    title: str
    body: str
    subtitles: list[str]
    tone: str
    edited_by_teacher: bool
    created_at: datetime
    warnings: list[str] = []


class GroupOut(BaseModel):
    id: int
    class_id: int
    date: Date
    title: str
    activity: str | None
    cover_photo_id: int | None
    cover_thumb_url: str | None
    photo_count: int


class GroupDetailOut(GroupOut):
    photos: list[PhotoOut]
    notes: list[NoteOut]


class GroupPatchIn(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    cover_photo_id: int | None = None
    add_photo_ids: list[int] = Field(default_factory=list)
    remove_photo_ids: list[int] = Field(default_factory=list)


class NoteIn(BaseModel):
    memo: str = Field(default="", max_length=2000)
    tone: str = Field(default="warm", pattern="^(warm|concise)$")
    kind: str = Field(default="notice", pattern="^(notice|subtitle)$")
    subtitle_count: int = Field(default=3, ge=1, le=20)


class NotePatchIn(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    body: str | None = Field(default=None, max_length=5000)
    subtitles: list[str] | None = None


class ExportIn(BaseModel):
    template_id: str = Field(default="grid4", pattern="^(grid4|grid6|grid9)$")
    photo_ids: list[int] | None = None
    title: str | None = Field(default=None, max_length=40)


class ExportOut(BaseModel):
    id: int
    url: str
    template_id: str


class VideoIn(BaseModel):
    class_id: int
    group_id: int | None = None
    title: str = Field(default="", max_length=100)
    clip_count: int = Field(ge=1, le=50)
    input_total_mb: float = Field(ge=0)
    output_seconds: float = Field(ge=0)
    processing_ms: int = Field(ge=0)
    resolution: str = Field(default="1280x720", max_length=20)
    user_agent: str = Field(default="", max_length=300)


class VideoOut(VideoIn):
    id: int
    created_at: datetime


# ---- 영상 편집 설정 (영상 파일은 받지 않음) ----


class DraftClip(BaseModel):
    name: str = Field(max_length=255)
    size: int = Field(ge=0)
    duration: float = Field(ge=0, le=36000)
    subtitle: str = Field(default="", max_length=40)


class DraftSubStyle(BaseModel):
    size: Literal["s", "m", "l"] = "m"
    color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    effect: Literal["box", "outline", "shadow", "plain"] = "box"
    position: Literal["bottom", "middle", "top", "custom"] = "bottom"
    at_x: float = Field(default=0.5, ge=0, le=1)
    at_y: float = Field(default=0.85, ge=0, le=1)


class VideoDraftData(BaseModel):
    title: str = Field(default="", max_length=30)
    max_sec: int = Field(default=15, ge=3, le=60)
    font: str = Field(default="jua", max_length=30)
    sub_style: DraftSubStyle = DraftSubStyle()
    music: str = Field(default="bright", max_length=20)
    music_file_name: str = Field(default="", max_length=255)
    clips: list[DraftClip] = Field(default_factory=list, max_length=15)


class VideoDraftOut(BaseModel):
    data: VideoDraftData | None
    updated_at: datetime | None


class SubtitleIn(BaseModel):
    memo: str = Field(min_length=1, max_length=2000)
    tone: str = Field(default="warm", pattern="^(warm|concise)$")
    count: int = Field(ge=1, le=15)
    class_id: int | None = None  # 있으면 그 반 명단 이름이 들어갔는지 확인


class SubtitleOut(BaseModel):
    title: str
    subtitles: list[str]
    provider: str
    warnings: list[str] = []


# ---- 영상 만들기: 말로 하는 편집 부탁 ----


class EditClipState(BaseModel):
    subtitle: str = Field(default="", max_length=40)
    seconds: float = Field(ge=0, le=36000)


class EditStyleState(BaseModel):
    size: Literal["s", "m", "l"] = "m"
    color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    effect: Literal["box", "outline", "shadow", "plain"] = "box"
    position: Literal["bottom", "middle", "top", "custom"] = "bottom"


class EditState(BaseModel):
    title: str = Field(default="", max_length=30)
    max_sec: int = Field(default=15, ge=3, le=60)
    font: str = Field(default="jua", max_length=30)
    style: EditStyleState = Field(default_factory=EditStyleState)
    music: str = Field(default="bright", max_length=20)
    clips: list[EditClipState] = Field(default_factory=list, max_length=15)


class VideoEditIn(BaseModel):
    instruction: str = Field(min_length=1, max_length=500)
    state: EditState
    current: int = Field(default=1, ge=1)  # 지금 보고 있는 클립 (1부터)
    class_id: int | None = None


class SubtitleChange(BaseModel):
    clip: int
    text: str


class VideoEditOut(BaseModel):
    reply: str
    title: str | None = None
    subtitles: list[SubtitleChange] = []
    font: str | None = None
    size: str | None = None
    color: str | None = None
    effect: str | None = None
    position: str | None = None
    music: str | None = None
    max_sec: int | None = None
    provider: str
    warnings: list[str] = []
