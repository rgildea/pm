import os

import httpx

from app.ai import call_openrouter


class DummyResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=None)

    def json(self) -> dict:
        return self._payload


def test_call_openrouter_requires_key(monkeypatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    try:
        call_openrouter("2+2")
    except RuntimeError as exc:
        assert "OPENROUTER_API_KEY" in str(exc)
    else:
        raise AssertionError("Expected RuntimeError when key is missing")


def test_call_openrouter_returns_message(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def fake_post(*_, **__) -> DummyResponse:
        return DummyResponse({"choices": [{"message": {"content": "4"}}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    result = call_openrouter("2+2")
    assert result == "4"
