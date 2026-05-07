from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def test_board_round_trip(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    response = client.get("/api/board")
    assert response.status_code == 200
    payload = response.json()["board"]
    assert len(payload["columns"]) == 5

    updated = {
        "columns": [{"id": "col-a", "title": "A", "cardIds": []}],
        "cards": {},
    }
    update_response = client.put("/api/board", json={"board": updated})
    assert update_response.status_code == 200

    reread = client.get("/api/board")
    assert reread.status_code == 200
    assert reread.json()["board"] == updated
