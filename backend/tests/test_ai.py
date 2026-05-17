import json
import os
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai import _strip_code_fences, call_openrouter
from app.main import create_app
from tests.conftest import login


class DummyResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPError("error")

    def json(self) -> dict:
        return self._payload


def test_call_openrouter_requires_key(monkeypatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        call_openrouter("2+2")


def test_call_openrouter_returns_message(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    requests = []

    def fake_post(*_, **kwargs) -> DummyResponse:
        requests.append(kwargs)
        return DummyResponse({"choices": [{"message": {"content": "4"}}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    result = call_openrouter("2+2")
    assert result == "4"
    assert requests[0]["json"]["messages"] == [{"role": "user", "content": "2+2"}]
    assert requests[0]["headers"]["Authorization"] == "Bearer test-key"


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
    auth = login(client)
    headers = {"Authorization": auth}

    board = client.get("/api/board", headers=headers).json()["board"]
    response = client.post("/api/ai/chat", json={"message": "Update", "board": board}, headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["response"] == "Updated"
    assert payload["board"] == updated_board

    reread = client.get("/api/board", headers=headers)
    assert reread.status_code == 200
    assert reread.json()["board"] == updated_board


def test_ai_chat_sends_board_json_and_history(
    monkeypatch, tmp_path: Path, realistic_board: dict[str, Any]
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    requests = []

    def fake_post(*_, **kwargs) -> DummyResponse:
        requests.append(kwargs["json"])
        response_number = len(requests)
        response_payload = json.dumps(
            {"response": f"Reply {response_number}", "board": None}
        )
        return DummyResponse({"choices": [{"message": {"content": response_payload}}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)
    auth = login(client)
    headers = {"Authorization": auth}

    first_response = client.post(
        "/api/ai/chat", json={"message": "First update", "board": realistic_board}, headers=headers
    )
    assert first_response.status_code == 200

    second_response = client.post(
        "/api/ai/chat", json={"message": "Second update", "board": realistic_board}, headers=headers
    )
    assert second_response.status_code == 200

    assert len(requests) == 2

    first_messages = requests[0]["messages"]
    assert first_messages[0]["role"] == "system"
    assert first_messages[1]["role"] == "user"
    assert "Current board JSON:" in first_messages[1]["content"]
    assert json.dumps(realistic_board, ensure_ascii=True) in first_messages[1]["content"]
    assert "First update" in first_messages[1]["content"]

    second_messages = requests[1]["messages"]
    assert second_messages[1] == {"role": "user", "content": "First update"}
    assert second_messages[2] == {"role": "assistant", "content": "Reply 1"}
    assert json.dumps(realistic_board, ensure_ascii=True) in second_messages[3]["content"]
    assert "Second update" in second_messages[3]["content"]


def test_ai_chat_rejects_invalid_response(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def fake_post(*_, **__) -> DummyResponse:
        return DummyResponse({"choices": [{"message": {"content": "not json"}}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)
    auth = login(client)
    headers = {"Authorization": auth}

    board = client.get("/api/board", headers=headers).json()["board"]
    response = client.post("/api/ai/chat", json={"message": "Update", "board": board}, headers=headers)
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
    auth = login(client)
    headers = {"Authorization": auth}

    board = client.get("/api/board", headers=headers).json()["board"]
    response = client.post("/api/ai/chat", json={"message": "Update", "board": board}, headers=headers)
    assert response.status_code == 200
    assert response.json()["board"] == updated_board


def test_ai_chat_per_board(monkeypatch, tmp_path) -> None:
    """AI chat on a specific board endpoint applies updates to that board only."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    updated_board = {
        "columns": [{"id": "col-x", "title": "X", "cardIds": []}],
        "cards": {},
    }
    response_payload = json.dumps({"response": "Done", "board": updated_board})

    def fake_post(*_, **__) -> DummyResponse:
        return DummyResponse({"choices": [{"message": {"content": response_payload}}]})

    monkeypatch.setattr(httpx, "post", fake_post)

    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)
    auth = login(client)
    headers = {"Authorization": auth}

    # Create a specific board
    board_id = client.post("/api/boards", json={"title": "AI Test Board"}, headers=headers).json()["board"]["id"]
    board_state = client.get(f"/api/boards/{board_id}", headers=headers).json()["board"]

    resp = client.post(
        f"/api/boards/{board_id}/ai/chat",
        json={"message": "Change it", "board": board_state},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["board"] == updated_board

    # The board should now have the updated state
    reread = client.get(f"/api/boards/{board_id}", headers=headers).json()["board"]
    assert reread == updated_board


def test_ai_chat_requires_auth(tmp_path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    board = {"columns": [], "cards": {}}
    resp = client.post("/api/ai/chat", json={"message": "hi", "board": board})
    assert resp.status_code == 401


def test_strip_code_fences_preserves_backtick_in_content() -> None:
    inner = json.dumps({"response": "use `code`", "board": None})
    fenced = f"```json\n{inner}\n```"
    result = _strip_code_fences(fenced)
    assert result == inner


def test_ai_real_api_call(tmp_path: Path) -> None:
    if not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY not set")

    app = create_app(tmp_path / "app.db")
    client = TestClient(app)

    response = client.get("/api/ai/test")
    assert response.status_code == 200
    payload = response.json()
    assert "response" in payload
    assert "4" in str(payload["response"])
