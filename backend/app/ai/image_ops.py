"""이미지 전처리와 규칙 기반 품질 지표. 외부 API 없이 재현 가능한 값만 계산한다."""

import io
import math
from datetime import datetime, timezone

import numpy as np
from PIL import ExifTags, Image, ImageFilter, ImageOps

_EXIF_DATETIME_ORIGINAL = 36867
_EXIF_DATETIME = 306


def open_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)  # 폰 사진 회전 보정
    return img.convert("RGB")


def taken_at(data: bytes) -> datetime | None:
    try:
        exif = Image.open(io.BytesIO(data)).getexif()
        raw = exif.get_ifd(ExifTags.IFD.Exif).get(_EXIF_DATETIME_ORIGINAL) or exif.get(_EXIF_DATETIME)
        if raw:
            # EXIF 시간은 기기 로컬 시각이며 타임존 정보가 없다. 날짜 묶음용이므로 그대로 둔다.
            return datetime.strptime(str(raw).strip("\x00 "), "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except Exception:
        pass
    return None


def resized(img: Image.Image, max_side: int) -> Image.Image:
    img = img.copy()
    img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return img


def to_jpeg(img: Image.Image, quality: int = 85) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def _gray(img: Image.Image, max_side: int = 512) -> np.ndarray:
    return np.asarray(resized(img, max_side).convert("L"), dtype=np.float32)


def laplacian_variance(img: Image.Image) -> float:
    """흔들림 지표. 값이 낮을수록 흐릿하다. 해상도 영향을 줄이려 512px로 맞춘 뒤 계산."""
    g = _gray(img)
    if g.shape[0] < 3 or g.shape[1] < 3:
        return 0.0
    lap = g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:] - 4 * g[1:-1, 1:-1]
    return float(lap.var())


def brightness(img: Image.Image) -> float:
    return float(_gray(img, 256).mean())


def dhash(img: Image.Image, size: int = 8) -> str:
    """차이 해시(64bit). 중복·연속 촬영 사진 탐지용."""
    g = np.asarray(img.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS), dtype=np.int16)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return f"{int(''.join('1' if b else '0' for b in bits), 2):016x}"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def quality_score(sharpness: float, bright: float, eyes_closed: bool | None) -> float:
    """0~100. 규칙 기반이라 싸고 재현 가능하다 (계획서 5장)."""
    # 512px 기준 Laplacian 분산: ~30 이하면 확연히 흐림, 300 이상이면 충분히 선명
    sharp = min(1.0, max(0.0, (math.log10(sharpness + 1) - math.log10(30)) / (math.log10(300) - math.log10(30))))
    if bright < 50:
        expo = max(0.0, bright / 50)
    elif bright > 215:
        expo = max(0.0, (255 - bright) / 40)
    else:
        expo = 1.0
    score = 100 * (0.7 * sharp + 0.3 * expo)
    if eyes_closed:
        score -= 25
    return round(max(0.0, min(100.0, score)), 1)


def color_stats(img: Image.Image) -> dict[str, float]:
    a = np.asarray(resized(img, 128), dtype=np.float32) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return {
        "green": float(((g > r * 1.1) & (g > b * 1.05)).mean()),
        "blue": float(((b > r * 1.15) & (b > g * 1.0)).mean()),
        "saturation": float(sat.mean()),
        "brightness": float(mx.mean()),
    }


def blur_faces(img: Image.Image) -> tuple[Image.Image, bool]:
    """AI 전송용 사본의 얼굴을 흐린다. opencv가 없으면 원본을 그대로 돌려준다.

    분석에는 장면 정보만 필요하므로 얼굴은 가려도 된다는 가정이며,
    정확도 손실은 eval/run_eval.py의 --blur 비교로 측정한다.
    """
    try:
        import cv2  # type: ignore
    except ImportError:
        return img, False

    arr = np.asarray(img)
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(24, 24))
    if len(faces) == 0:
        return img, True
    out = img.copy()
    for x, y, w, h in faces:
        pad = int(0.15 * max(w, h))
        box = (max(0, x - pad), max(0, y - pad), min(img.width, x + w + pad), min(img.height, y + h + pad))
        region = out.crop(box).filter(ImageFilter.GaussianBlur(radius=max(8, w // 6)))
        out.paste(region, box)
    return out, True
