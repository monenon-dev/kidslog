"""사진 태깅/장면 설명.

- claude: 비전 모델에 고정 태그 목록을 주고 JSON 스키마로 출력을 강제한다.
- mock: API 키 없이 화면 흐름을 확인하기 위한 색상 기반 휴리스틱. 정확도 평가에 쓰지 않는다.
"""

import base64
from dataclasses import dataclass, field

from PIL import Image

from . import image_ops
from .llm import structured_call
from .tags import QUALITY_ISSUES


@dataclass
class TagResult:
    activity: str
    confidence: float
    secondary: list[str] = field(default_factory=list)
    objects: list[str] = field(default_factory=list)
    mood: str | None = None
    caption: str = ""
    eyes_closed: bool | None = None
    issues: list[str] = field(default_factory=list)
    provider: str = "mock"


SYSTEM_PROMPT = """당신은 어린이집·유치원·태권도장 등 아동 대상 현장의 교사가 찍은 활동 사진을 정리하는 도우미입니다.
사진 한 장을 보고 활동 유형과 장면 설명을 JSON으로 돌려줍니다.

규칙:
- activity와 secondary_activities는 반드시 주어진 태그 목록에서만 고릅니다. 맞는 것이 없으면 "기타".
- caption은 한국어 한두 문장으로, 사진에서 실제로 보이는 것만 서술합니다. 보이지 않는 감정·사실·의도를 지어내지 않습니다.
- 사람의 이름, 나이, 외모로 개인을 특정할 수 있는 표현(예: 안경 쓴 남자아이)은 쓰지 않고 "아이들", "한 아이"처럼 씁니다.
- 얼굴이 흐리게 가려져 있을 수 있습니다. 그 경우 장면과 사물로만 판단하고 가림 처리 자체는 언급하지 않습니다.
- objects는 활동 판단에 도움이 되는 사물 최대 5개(한국어 명사).
- eyes_closed_likely는 주요 인물이 눈을 감은 것으로 보일 때만 true. 얼굴이 가려졌거나 판단할 수 없으면 false.
- quality_issues는 학부모에게 보내기 어려운 이유가 분명히 보일 때만 고릅니다.
- confidence는 activity 판단의 확신도(0~1)."""


def _schema(tags: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "activity": {"type": "string", "enum": tags},
            "secondary_activities": {"type": "array", "items": {"type": "string", "enum": tags}},
            "objects": {"type": "array", "items": {"type": "string"}},
            "mood": {"type": "string", "enum": ["즐거움", "집중", "차분함", "활기참", "알수없음"]},
            "caption": {"type": "string"},
            "confidence": {"type": "number"},
            "eyes_closed_likely": {"type": "boolean"},
            "quality_issues": {"type": "array", "items": {"type": "string", "enum": QUALITY_ISSUES}},
        },
        "required": [
            "activity",
            "secondary_activities",
            "objects",
            "mood",
            "caption",
            "confidence",
            "eyes_closed_likely",
            "quality_issues",
        ],
        "additionalProperties": False,
    }


def tag_with_claude(img: Image.Image, tags: list[str]) -> TagResult:
    data = base64.standard_b64encode(image_ops.to_jpeg(img)).decode()
    out = structured_call(
        system=SYSTEM_PROMPT,
        content=[
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": data}},
            {"type": "text", "text": "태그 목록: " + ", ".join(tags) + "\n\n이 사진을 분석해 주세요."},
        ],
        schema=_schema(tags),
        effort="low",  # 단순 분류 작업. 정확도 평가 후 필요하면 올린다
    )
    allowed = set(tags)
    activity = out["activity"] if out["activity"] in allowed else "기타"
    return TagResult(
        activity=activity,
        confidence=max(0.0, min(1.0, float(out["confidence"]))),
        secondary=[t for t in out["secondary_activities"] if t in allowed and t != activity][:2],
        objects=[o.strip() for o in out["objects"] if o.strip()][:5],
        mood=None if out["mood"] == "알수없음" else out["mood"],
        caption=out["caption"].strip(),
        eyes_closed=bool(out["eyes_closed_likely"]),
        issues=list(dict.fromkeys(out["quality_issues"])),
        provider="claude",
    )


def tag_with_mock(img: Image.Image, tags: list[str]) -> TagResult:
    c = image_ops.color_stats(img)
    if c["brightness"] < 0.25:
        activity, caption = "낮잠", "어두운 실내 장면입니다."
    elif c["green"] > 0.30:
        activity, caption = "바깥놀이", "초록색이 많은 야외 장면입니다."
    elif c["blue"] > 0.30 and "물놀이" in tags:
        activity, caption = "물놀이", "파란색이 많은 장면입니다."
    elif c["saturation"] > 0.45:
        activity, caption = "미술", "색이 다채로운 장면입니다."
    else:
        activity, caption = "기타", "실내 활동 장면입니다."
    if activity not in tags:
        activity = "기타"
    return TagResult(activity=activity, confidence=0.3, caption=f"(모의 분석) {caption}", provider="mock")


def tag_image(img: Image.Image, tags: list[str], provider: str) -> TagResult:
    if provider == "claude":
        return tag_with_claude(img, tags)
    return tag_with_mock(img, tags)
