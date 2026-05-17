import json
import os
from typing import Any

import httpx

from app.schemas import AIChatResponse

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL_NAME = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")

AI_CHAT_SYSTEM_PROMPT = (
    "You are a project management assistant. "
    "Return JSON only. The JSON must include a 'response' string and may include "
    "a 'board' object. If no board changes are needed, omit 'board' or set it to null. "
    "Never include extra keys. "
    "Board schema: columns (array of {id, title, cardIds}), cards (object of {id, title, details, priority, due_date}). "
    "priority must be 'low', 'medium', or 'high'. due_date must be 'YYYY-MM-DD' string or null. "
    "When you include a board, every id in any column's cardIds must also exist as a "
    "key in the cards object, and every key in cards must appear in exactly one "
    "column's cardIds. Preserve existing card and column ids when possible. "
    "When creating new cards, always include priority (default 'medium') and due_date (default null)."
)


def _openrouter_headers() -> dict[str, str]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    referer = os.getenv("OPENROUTER_REFERRER")
    if referer:
        headers["HTTP-Referer"] = referer

    title = os.getenv("OPENROUTER_TITLE")
    if title:
        headers["X-Title"] = title

    return headers


def call_openrouter(prompt: str) -> str:
    return call_openrouter_messages([{"role": "user", "content": prompt}])


def call_openrouter_messages(messages: list[dict[str, str]]) -> str:
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
    }

    response = httpx.post(
        OPENROUTER_URL, headers=_openrouter_headers(), json=payload, timeout=30
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


def build_ai_messages(
    board: dict[str, Any], history: list[dict[str, str]], user_message: str
) -> list[dict[str, str]]:
    board_json = json.dumps(board, ensure_ascii=True)
    messages = [
        {"role": "system", "content": AI_CHAT_SYSTEM_PROMPT},
        *history,
        {
            "role": "user",
            "content": (
                "Current board JSON:\n"
                f"{board_json}\n\n"
                "User request:\n"
                f"{user_message}"
            ),
        },
    ]
    return messages


def _strip_code_fences(content: str) -> str:
    trimmed = content.strip()
    if trimmed.startswith("```") and trimmed.endswith("```"):
        trimmed = trimmed[3:]
        trimmed = trimmed[:-3]
        if trimmed.startswith("json"):
            trimmed = trimmed[4:]
    return trimmed.strip()


def _extract_json(content: str) -> str:
    stripped = _strip_code_fences(content)
    try:
        json.loads(stripped)
        return stripped
    except json.JSONDecodeError:
        pass

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("AI response did not include JSON")
    return stripped[start : end + 1]


def parse_ai_response(content: str) -> AIChatResponse:
    payload = json.loads(_extract_json(content))
    return AIChatResponse.model_validate(payload)
