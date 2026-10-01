# 기관 유형 구분 없는 공통 활동 태그 사전 (계획서 v0.4, 5장)
DEFAULT_ACTIVITY_TAGS: list[str] = [
    "미술",
    "바깥놀이",
    "급식",
    "낮잠",
    "책읽기",
    "신체활동",
    "음악·율동",
    "블록·조작놀이",
    "역할놀이",
    "과학·탐구",
    "물놀이",
    "행사",
    "기타",
]

QUALITY_ISSUES: list[str] = ["흔들림", "눈감음", "어두움", "역광", "가려짐", "구도불량"]


def tag_dictionary(custom: list[str]) -> list[str]:
    seen = set(DEFAULT_ACTIVITY_TAGS)
    extra = [t for t in custom if t not in seen and not seen.add(t)]
    # "기타"는 항상 마지막에 둔다
    return [t for t in DEFAULT_ACTIVITY_TAGS if t != "기타"] + extra + ["기타"]
