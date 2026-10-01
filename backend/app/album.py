"""앨범 이미지 내보내기 (단순 그리드). 홍보용 카드뉴스는 만들지 않는다 (계획서 2장)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from .ai import image_ops

FONT_PATH = Path(__file__).resolve().parent.parent / "fonts" / "NanumGothic-Bold.ttf"

TEMPLATES = {"grid4": (2, 2), "grid6": (3, 2), "grid9": (3, 3)}  # (cols, rows)

WIDTH = 1080
PAD = 24
HEADER = 120
BG = (250, 247, 242)
FG = (51, 45, 40)


def _font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype(str(FONT_PATH), size)
    except OSError:
        return ImageFont.load_default(size)


def render(template_id: str, images: list[bytes], title: str, subtitle: str) -> bytes:
    cols, rows = TEMPLATES[template_id]
    images = images[: cols * rows]
    rows = max(1, -(-len(images) // cols))  # 사진이 적으면 빈 줄을 만들지 않는다
    cell = (WIDTH - PAD * (cols + 1)) // cols
    height = HEADER + PAD + rows * (cell + PAD)
    canvas = Image.new("RGB", (WIDTH, height), BG)
    draw = ImageDraw.Draw(canvas)
    draw.text((PAD, 28), title, font=_font(44), fill=FG)
    draw.text((PAD, 82), subtitle, font=_font(24), fill=(120, 110, 100))

    for i, data in enumerate(images):
        img = ImageOps.fit(image_ops.open_image(data), (cell, cell), Image.Resampling.LANCZOS)
        r, c = divmod(i, cols)
        canvas.paste(img, (PAD + c * (cell + PAD), HEADER + PAD + r * (cell + PAD)))
    return image_ops.to_jpeg(canvas, 90)
