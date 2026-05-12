from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.main import create_app


def test_board_round_trip(tmp_path: Path, realistic_board: dict[str, Any]) -> None:
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)

    response = client.get("/api/board")
    assert response.status_code == 200
    payload = response.json()["board"]
    assert len(payload["columns"]) == 5

    update_response = client.put("/api/board", json={"board": realistic_board})
    assert update_response.status_code == 200

    reread = client.get("/api/board")
    assert reread.status_code == 200
    assert reread.json()["board"] == realistic_board
