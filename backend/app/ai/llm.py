"""Claude 호출 공통부: 구조화 출력(JSON 스키마) + 거절 시 서버측 폴백."""

import json
from functools import lru_cache
from typing import Any

import anthropic

from ..config import get_settings

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class LLMError(RuntimeError):
    pass


@lru_cache
def client() -> anthropic.Anthropic:
    key = get_settings().anthropic_api_key
    # 키가 없으면 SDK가 ANTHROPIC_API_KEY / `ant auth login` 프로필 순으로 찾는다
    return anthropic.Anthropic(api_key=key) if key else anthropic.Anthropic()


def structured_call(
    *,
    system: str,
    content: list[dict[str, Any]],
    schema: dict[str, Any],
    effort: str,
    max_tokens: int = 16000,
) -> dict[str, Any]:
    try:
        resp = client().beta.messages.create(
            model=get_settings().claude_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            betas=[FALLBACK_BETA],
            fallbacks="default",
        )
    except anthropic.RateLimitError as e:
        raise LLMError("AI 호출 한도에 걸렸습니다. 잠시 후 다시 시도하세요") from e
    except anthropic.APIStatusError as e:
        raise LLMError(f"AI 호출 실패 ({e.status_code})") from e
    except anthropic.APIConnectionError as e:
        raise LLMError("AI 서버에 연결할 수 없습니다") from e

    if resp.stop_reason == "refusal":
        raise LLMError("AI가 이 요청을 처리하지 않았습니다")
    if resp.stop_reason == "max_tokens":
        raise LLMError("AI 응답이 잘렸습니다")
    text = next((b.text for b in resp.content if b.type == "text"), None)
    if text is None:
        raise LLMError("AI 응답이 비어 있습니다")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise LLMError("AI 응답 형식 오류") from e
