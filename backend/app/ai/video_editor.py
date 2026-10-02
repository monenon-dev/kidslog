"""영상 만들기: 선생님이 말로 한 편집 부탁을 편집 설정 변경으로 바꾼다.

영상·사진은 보내지 않고, 지금 편집 상태(제목·클립별 자막과 길이·자막 꾸밈·음악)와 부탁 문장만 쓴다.
AI 키가 없으면 간단한 규칙으로 흔한 부탁(자막 바꾸기, 색·위치·크기·효과·글꼴·음악)만 알아듣는다.
"""

import re
from typing import Any

from .llm import structured_call

FONTS = {
    "jua": "주아 (둥근)",
    "dohyeon": "도현 (또렷한)",
    "nanum": "나눔고딕 Bold",
    "blackhansans": "검은고딕 (굵은 제목)",
    "sunflower": "해바라기 (깔끔한)",
    "gowundodum": "고운돋움 (부드러운)",
    "gaegu": "개구 (손글씨)",
    "nanumpen": "나눔손글씨 펜",
    "yeonsung": "연성 (붓글씨 느낌)",
}
SIZES = {"s": "작게", "m": "보통", "l": "크게"}
EFFECTS = {"box": "배경 상자", "outline": "테두리", "shadow": "그림자", "plain": "효과 없음"}
POSITIONS = {"bottom": "아래", "middle": "가운데", "top": "위"}
MUSIC = {"none": "음악 없음", "bright": "밝은 멜로디", "calm": "잔잔한 멜로디"}

SYSTEM_PROMPT = f"""당신은 아이들 활동 영상 편집 화면의 도우미입니다. 선생님의 부탁을 편집 설정 변경으로 바꿉니다.

규칙:
- 부탁한 것만 바꾸고, 부탁하지 않은 항목은 null(목록은 빈 배열)로 둡니다.
- 클립 번호는 1부터입니다. "이 클립", "지금 자막"처럼 번호가 없으면 지금 보고 있는 클립입니다. "모든 자막"이면 모든 클립입니다.
- 자막을 새로 써 달라고 하면 각 18자 이내로, 이미 있는 사실(기존 자막·제목·부탁 문장)만 씁니다. 아이 이름이나 개인을 특정할 수 있는 정보는 쓰지 않습니다.
- color는 #RRGGBB 형식입니다. (흰색 #FFFFFF, 노랑 #FFE066, 주황 #F2A531, 민트 #8EE3C8, 하늘 #9AD0F5, 분홍 #FFB3C7, 검정 #2B2824)
- font: {", ".join(f"{k}={v}" for k, v in FONTS.items())}
- size: {", ".join(f"{k}={v}" for k, v in SIZES.items())} / effect: {", ".join(f"{k}={v}" for k, v in EFFECTS.items())}
- position: {", ".join(f"{k}={v}" for k, v in POSITIONS.items())} / music: {", ".join(f"{k}={v}" for k, v in MUSIC.items())}
- max_sec는 클립당 최대 길이(3~60초)입니다.
- reply에는 무엇을 바꿨는지 한두 문장 존댓말로 씁니다. 할 수 없는 부탁(장면 자르기, 효과음, 전환 효과 등)이면 아무것도 바꾸지 말고 reply로 안내합니다."""


def _nullable_enum(values: list[str]) -> dict[str, Any]:
    return {"anyOf": [{"type": "string", "enum": values}, {"type": "null"}]}


SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "title": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "subtitles": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"clip": {"type": "integer"}, "text": {"type": "string"}},
                "required": ["clip", "text"],
                "additionalProperties": False,
            },
        },
        "font": _nullable_enum(list(FONTS)),
        "size": _nullable_enum(list(SIZES)),
        "color": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "effect": _nullable_enum(list(EFFECTS)),
        "position": _nullable_enum(list(POSITIONS)),
        "music": _nullable_enum(list(MUSIC)),
        "max_sec": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
    },
    "required": ["reply", "title", "subtitles", "font", "size", "color", "effect", "position", "music", "max_sec"],
    "additionalProperties": False,
}


def _describe(state: dict[str, Any], current: int) -> str:
    st = state["style"]
    clips = "\n".join(
        f"{i}. ({c['seconds']:.1f}초) 자막: {c['subtitle'] or '(없음)'}" for i, c in enumerate(state["clips"], start=1)
    )
    return (
        f"제목: {state['title'] or '(없음)'}\n"
        f"클립당 최대 길이: {state['max_sec']}초\n"
        f"글꼴: {state['font']} / 크기: {st['size']} / 글자색: {st['color']} / 효과: {st['effect']} / 위치: {st['position']}\n"
        f"배경음악: {state['music']}\n"
        f"지금 보고 있는 클립: {current}번\n"
        f"클립:\n{clips}"
    )


def edit_video(*, instruction: str, state: dict[str, Any], current: int, provider: str) -> dict[str, Any]:
    if provider != "claude":
        return _mock_edit(instruction, state, current)
    return structured_call(
        system=SYSTEM_PROMPT,
        content=[{"type": "text", "text": f"지금 편집 상태:\n{_describe(state, current)}\n\n선생님 부탁:\n{instruction.strip()}"}],
        schema=SCHEMA,
        effort="low",
    )


# ---- AI 키가 없을 때: 흔한 부탁만 규칙으로 ----

_QUOTE = r"['\"‘“「]([^'\"’”」]+)['\"’”」]"
_COLORS = [
    (("노랑", "노란", "노랗"), "#FFE066", "노랑"),
    (("흰", "하얀", "하얗", "흰색"), "#FFFFFF", "흰색"),
    (("주황",), "#F2A531", "주황"),
    (("민트",), "#8EE3C8", "민트"),
    (("하늘",), "#9AD0F5", "하늘색"),
    (("분홍", "핑크"), "#FFB3C7", "분홍"),
    (("검정", "검은", "까만", "까맣"), "#2B2824", "검정"),
    (("빨강", "빨간", "빨갛"), "#E5484D", "빨강"),
    (("파랑", "파란", "파랗"), "#4C8DF6", "파랑"),
    (("초록", "녹색"), "#3DBE6B", "초록"),
]
_FONT_WORDS = [
    (("손글씨",), "gaegu"),
    (("펜",), "nanumpen"),
    (("붓",), "yeonsung"),
    (("둥근", "주아"), "jua"),
    (("굵은", "검은고딕"), "blackhansans"),
    (("도현", "또렷"), "dohyeon"),
    (("나눔고딕",), "nanum"),
    (("해바라기", "깔끔"), "sunflower"),
    (("고운", "부드러"), "gowundodum"),
]


def _mock_edit(text: str, state: dict[str, Any], current: int) -> dict[str, Any]:
    out: dict[str, Any] = {k: None for k in SCHEMA["required"]}
    out["subtitles"] = []
    done: list[str] = []
    n = len(state["clips"])
    rest = text

    # 제목 '...'
    m = re.search(r"제목[^'\"‘“「]*" + _QUOTE, rest)
    if m:
        out["title"] = m.group(1).strip()[:30]
        done.append(f"제목을 ‘{out['title']}’(으)로")
        rest = rest.replace(m.group(0), " ")
    # N번 (클립) 자막 '...' / 자막 '...' (지금 클립)
    for m in re.finditer(r"(\d+)\s*번(?:째)?[^'\"‘“「\d]*?" + _QUOTE, rest):
        i = int(m.group(1))
        if 1 <= i <= n:
            out["subtitles"].append({"clip": i, "text": m.group(2).strip()[:40]})
            done.append(f"{i}번 자막을 ‘{m.group(2).strip()}’(으)로")
    if not out["subtitles"]:
        m = re.search(r"자막[^'\"‘“「]*" + _QUOTE, rest)
        if m and n:
            targets = range(1, n + 1) if re.search(r"모든|전부|다\s", rest) else [current]
            out["subtitles"] = [{"clip": i, "text": m.group(1).strip()[:40]} for i in targets]
            done.append(f"{'모든' if len(out['subtitles']) > 1 else f'{current}번'} 자막을 ‘{m.group(1).strip()}’(으)로")
    # 꾸밈 (따옴표 안 글자는 빼고 본다)
    plain = re.sub(_QUOTE, " ", text)
    for words, hexv, label in _COLORS:
        if any(w in plain for w in words):
            out["color"] = hexv
            done.append(f"글자색을 {label}(으)로")
            break
    if re.search(r"위로|위쪽|상단|맨\s*위", plain):
        out["position"] = "top"
    elif re.search(r"아래로|아래쪽|하단|밑으로|맨\s*아래", plain):
        out["position"] = "bottom"
    elif re.search(r"가운데|중앙|중간", plain):
        out["position"] = "middle"
    if out["position"]:
        done.append(f"자막 위치를 {POSITIONS[out['position']]}(으)로")
    if re.search(r"크게|키워|크기를?\s*크", plain):
        out["size"] = "l"
    elif re.search(r"작게|줄여", plain):
        out["size"] = "s"
    if out["size"]:
        done.append(f"크기를 {SIZES[out['size']]}")
    for pat, eff in ((r"테두리", "outline"), (r"그림자", "shadow"), (r"상자", "box"), (r"배경(?!\s*음악)", "box"), (r"효과\s*(없|빼)", "plain")):
        if re.search(pat, plain):
            out["effect"] = eff
            done.append(f"효과를 {EFFECTS[eff]}(으)로")
            break
    if "글꼴" in plain or "폰트" in plain or "글씨체" in plain:
        for words, fid in _FONT_WORDS:
            if any(w in plain for w in words):
                out["font"] = fid
                done.append(f"글꼴을 {FONTS[fid]}(으)로")
                break
    if "음악" in plain or "노래" in plain:
        if re.search(r"없|끄|빼", plain):
            out["music"] = "none"
        elif "잔잔" in plain or "조용" in plain:
            out["music"] = "calm"
        elif "밝" in plain or "신나" in plain:
            out["music"] = "bright"
        if out["music"]:
            done.append(f"배경음악을 {MUSIC[out['music']]}(으)로")
    m = re.search(r"(\d+)\s*초", plain)
    if m and re.search(r"길이|최대|씩|까지", plain):
        out["max_sec"] = int(m.group(1))
        done.append(f"클립당 최대 길이를 {out['max_sec']}초로")

    out["reply"] = (
        "(모의) " + ", ".join(done) + " 바꿨어요."
        if done
        else "(모의) 무엇을 바꿀지 알아듣지 못했어요. 예: 2번 자막을 '모래성 완성!'으로 바꾸고 글자는 노랗게, 위로 올려줘"
    )
    return out
