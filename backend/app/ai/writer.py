"""학부모 전달용 알림장 문구·영상 자막 초안 생성.

사진 원본은 다시 보내지 않고, 분석 단계에서 저장한 태그·설명과 교사 메모만 사용한다.
"""

from dataclasses import dataclass

from .llm import structured_call


@dataclass
class Draft:
    title: str
    body: str
    subtitles: list[str]
    provider: str


TONES = {
    "warm": "따뜻하고 다정한 존댓말. 학부모가 아이의 하루를 떠올릴 수 있게 구체적으로.",
    "concise": "간결한 존댓말. 핵심 활동 위주로 짧게.",
}

SYSTEM_PROMPT = """당신은 아동 대상 기관 교사가 학부모에게 보낼 알림장 문구와 영상 자막 초안을 쓰는 도우미입니다.
초안은 교사가 검토·수정한 뒤 보냅니다.

반드시 지킬 것:
- 교사 메모와 사진 설명에 있는 사실만 씁니다. 없는 활동, 아이의 감정·성취·발언을 지어내지 않습니다.
- 사진 설명은 AI가 자동으로 만든 것이므로 교사 메모와 다르면 교사 메모를 따릅니다.
- 아이 이름이나 개인을 특정할 수 있는 정보는 쓰지 않습니다. 메모에 이름이 있어도 "아이들", "친구들"로 바꿉니다. (이름은 교사가 직접 넣습니다)
- 과장된 표현(최고, 완벽, 모든 아이가 등)과 이모지를 피합니다.
- subtitles는 영상 클립에 하나씩 들어갈 자막으로, 각 18자 이내의 짧은 문장입니다."""


def _schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "body": {"type": "string"},
            "subtitles": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["title", "body", "subtitles"],
        "additionalProperties": False,
    }


def _context(activity: str | None, date_str: str, photo_lines: list[str], memo: str) -> str:
    photos = "\n".join(f"- {line}" for line in photo_lines[:30]) or "- (사진 설명 없음)"
    return (
        f"날짜: {date_str}\n"
        f"대표 활동: {activity or '미정'}\n"
        f"사진 설명(AI 자동 생성):\n{photos}\n\n"
        f"교사 메모:\n{memo.strip() or '(메모 없음)'}"
    )


def write_draft(
    *,
    activity: str | None,
    date_str: str,
    photo_lines: list[str],
    memo: str,
    tone: str,
    kind: str,
    subtitle_count: int,
    provider: str,
) -> Draft:
    if provider != "claude":
        return _mock_draft(activity, date_str, memo, subtitle_count)

    task = (
        "알림장 본문(3~6문장)을 body에 써 주세요."
        if kind == "notice"
        else "영상 설명용 짧은 문단(1~2문장)을 body에 써 주세요."
    )
    out = structured_call(
        system=SYSTEM_PROMPT,
        content=[
            {
                "type": "text",
                "text": f"{_context(activity, date_str, photo_lines, memo)}\n\n"
                f"말투: {TONES.get(tone, TONES['warm'])}\n"
                f"{task} title은 20자 이내 제목, subtitles는 {subtitle_count}개를 써 주세요.",
            }
        ],
        schema=_schema(),
        effort="medium",
    )
    subs = [s.strip() for s in out["subtitles"] if s.strip()][:subtitle_count]
    return Draft(title=out["title"].strip(), body=out["body"].strip(), subtitles=subs, provider="claude")


def _mock_draft(activity: str | None, date_str: str, memo: str, n: int) -> Draft:
    act = activity or "활동"
    memo_line = memo.strip().splitlines()[0] if memo.strip() else f"오늘은 {act} 시간을 가졌습니다."
    return Draft(
        title=f"{date_str} {act}",
        body=f"(모의 초안) 안녕하세요. {memo_line} 사진으로 아이들의 하루를 전해 드립니다.",
        subtitles=[f"{act} 시간 {i + 1}" for i in range(n)],
        provider="mock",
    )
