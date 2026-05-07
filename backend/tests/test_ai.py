import json
import os

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai import call_openrouter
from app.main import create_app


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


def test_ai_chat_applies_board_update(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    updated_board = {
        "columns": [{"id": "col-a", "title": "A", "cardIds": []}],
        "cards": {},
    }
    response_payload = json.dumps({"response": "Updated", "board": updated_board})

    def fake_post(*_, **__) -> DummyResponse:
        return DummyResponse({"choices": [{"message": {"content": response_payload}}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    board = client.get("/api/board").json()["board"]
    response = client.post("/api/ai/chat", json={"message": "Update", "board": board})
    assert response.status_code == 200
    payload = response.json()
    assert payload["response"] == "Updated"
    assert payload["board"] == updated_board

    reread = client.get("/api/board")
    assert reread.status_code == 200
    assert reread.json()["board"] == updated_board


def test_ai_chat_rejects_invalid_response(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def fake_post(*_, **__) -> DummyResponse:
        return DummyResponse({"choices": [{"message": {"content": "not json"}}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    board = client.get("/api/board").json()["board"]
    response = client.post("/api/ai/chat", json={"message": "Update", "board": board})
    assert response.status_code == 502


def test_ai_chat_accepts_fenced_json(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    updated_board = {
        "columns": [{"id": "col-b", "title": "B", "cardIds": []}],
        "cards": {},
    }
    response_payload = (
        "```json\n"
        + json.dumps({"response": "Updated", "board": updated_board})
        + "\n```"
    )

    def fake_post(*_, **__) -> DummyResponse:
        return DummyResponse({"choices": [{"message": {"content": response_payload}}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    board = client.get("/api/board").json()["board"]
    response = client.post("/api/ai/chat", json={"message": "Update", "board": board})
    assert response.status_code == 200
    assert response.json()["board"] == updated_board


def test_ai_real_api_call() -> None:
    if not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY not set")

    app = create_app()
    client = TestClient(app)

    response = client.get("/api/ai/test")
    assert response.status_code == 200
    payload = response.json()
    assert "response" in payload
    assert "4" in str(payload["response"])
