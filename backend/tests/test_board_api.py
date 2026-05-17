from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import login


def test_board_round_trip(app_client, realistic_board: dict[str, Any]) -> None:
    client, headers = app_client

    response = client.get("/api/board", headers=headers)
    assert response.status_code == 200
    payload = response.json()["board"]
    assert len(payload["columns"]) == 5

    update_response = client.put("/api/board", json={"board": realistic_board}, headers=headers)
    assert update_response.status_code == 200

    reread = client.get("/api/board", headers=headers)
    assert reread.status_code == 200
    assert reread.json()["board"] == realistic_board


def test_board_requires_auth(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    assert client.get("/api/board").status_code == 401
    assert client.put("/api/board", json={"board": {}}).status_code == 401


def test_multi_board_lifecycle(app_client, realistic_board: dict[str, Any]) -> None:
    client, headers = app_client

    # List boards - should auto-create one
    resp = client.get("/api/boards", headers=headers)
    assert resp.status_code == 200
    boards = resp.json()["boards"]
    assert len(boards) >= 1

    # Create a new board
    create_resp = client.post("/api/boards", json={"title": "Sprint Board"}, headers=headers)
    assert create_resp.status_code == 200
    new_board = create_resp.json()["board"]
    assert new_board["title"] == "Sprint Board"
    board_id = new_board["id"]

    # Get it by ID
    get_resp = client.get(f"/api/boards/{board_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["title"] == "Sprint Board"

    # Update its state
    put_resp = client.put(f"/api/boards/{board_id}", json={"board": realistic_board}, headers=headers)
    assert put_resp.status_code == 200
    assert put_resp.json()["board"] == realistic_board

    # Rename it
    patch_resp = client.patch(f"/api/boards/{board_id}", json={"title": "Q2 Sprint"}, headers=headers)
    assert patch_resp.status_code == 200
    assert patch_resp.json()["title"] == "Q2 Sprint"

    # Delete it (need at least 2 boards, which we have now)
    del_resp = client.delete(f"/api/boards/{board_id}", headers=headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["ok"] is True

    # Confirm deleted
    assert client.get(f"/api/boards/{board_id}", headers=headers).status_code == 404


def test_cannot_delete_only_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)
    auth = login(client)
    headers = {"Authorization": auth}

    boards = client.get("/api/boards", headers=headers).json()["boards"]
    assert len(boards) == 1
    board_id = boards[0]["id"]

    resp = client.delete(f"/api/boards/{board_id}", headers=headers)
    assert resp.status_code == 409


def test_board_isolation_between_users(tmp_path: Path, realistic_board: dict[str, Any]) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    # Register two users
    alice_token = client.post("/api/auth/register", json={"username": "alice", "password": "password1"}).json()["token"]
    bob_token = client.post("/api/auth/register", json={"username": "bob", "password": "password2"}).json()["token"]

    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    bob_headers = {"Authorization": f"Bearer {bob_token}"}

    # Alice creates a board
    alice_board_resp = client.post("/api/boards", json={"title": "Alice Board"}, headers=alice_headers)
    assert alice_board_resp.status_code == 200
    alice_board_id = alice_board_resp.json()["board"]["id"]

    # Bob cannot access Alice's board
    assert client.get(f"/api/boards/{alice_board_id}", headers=bob_headers).status_code == 404
    assert client.put(f"/api/boards/{alice_board_id}", json={"board": realistic_board}, headers=bob_headers).status_code == 404
    assert client.delete(f"/api/boards/{alice_board_id}", headers=bob_headers).status_code == 404


def test_create_board_empty_title(app_client) -> None:
    client, headers = app_client
    resp = client.post("/api/boards", json={"title": "  "}, headers=headers)
    assert resp.status_code == 422


def test_rename_board_empty_title(app_client) -> None:
    client, headers = app_client
    boards = client.get("/api/boards", headers=headers).json()["boards"]
    board_id = boards[0]["id"]
    resp = client.patch(f"/api/boards/{board_id}", json={"title": ""}, headers=headers)
    assert resp.status_code == 422


def test_card_priority_field(app_client) -> None:
    client, headers = app_client

    boards = client.get("/api/boards", headers=headers).json()["boards"]
    board_id = boards[0]["id"]

    board_with_priority = {
        "columns": [{"id": "col-1", "title": "Todo", "cardIds": ["c-1"]}],
        "cards": {
            "c-1": {"id": "c-1", "title": "High priority task", "details": "Urgent", "priority": "high"},
        },
    }

    resp = client.put(f"/api/boards/{board_id}", json={"board": board_with_priority}, headers=headers)
    assert resp.status_code == 200
    saved_card = resp.json()["board"]["cards"]["c-1"]
    assert saved_card["priority"] == "high"


def test_invalid_priority_rejected(app_client) -> None:
    client, headers = app_client

    boards = client.get("/api/boards", headers=headers).json()["boards"]
    board_id = boards[0]["id"]

    board_bad_priority = {
        "columns": [{"id": "col-1", "title": "Todo", "cardIds": ["c-1"]}],
        "cards": {
            "c-1": {"id": "c-1", "title": "Task", "details": "", "priority": "urgent"},
        },
    }

    resp = client.put(f"/api/boards/{board_id}", json={"board": board_bad_priority}, headers=headers)
    assert resp.status_code == 422


def test_card_due_date_field(app_client) -> None:
    client, headers = app_client

    boards = client.get("/api/boards", headers=headers).json()["boards"]
    board_id = boards[0]["id"]

    board_with_due = {
        "columns": [{"id": "col-1", "title": "Todo", "cardIds": ["c-1"]}],
        "cards": {
            "c-1": {
                "id": "c-1",
                "title": "Deadline task",
                "details": "",
                "priority": "high",
                "due_date": "2025-12-31",
            },
        },
    }

    resp = client.put(f"/api/boards/{board_id}", json={"board": board_with_due}, headers=headers)
    assert resp.status_code == 200
    saved = resp.json()["board"]["cards"]["c-1"]
    assert saved["due_date"] == "2025-12-31"


def test_invalid_due_date_format_rejected(app_client) -> None:
    client, headers = app_client

    boards = client.get("/api/boards", headers=headers).json()["boards"]
    board_id = boards[0]["id"]

    board_bad_date = {
        "columns": [{"id": "col-1", "title": "Todo", "cardIds": ["c-1"]}],
        "cards": {
            "c-1": {
                "id": "c-1",
                "title": "Task",
                "details": "",
                "priority": "medium",
                "due_date": "not-a-date",
            },
        },
    }

    resp = client.put(f"/api/boards/{board_id}", json={"board": board_bad_date}, headers=headers)
    assert resp.status_code == 422
