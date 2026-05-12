from pathlib import Path
from typing import Any

from app.db import get_board_state, init_db, update_board_state


def test_init_creates_default_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    board = get_board_state(db_path)
    assert "columns" in board
    assert "cards" in board


def test_update_board_state(tmp_path: Path, realistic_board: dict[str, Any]) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    update_board_state(db_path, realistic_board)

    board = get_board_state(db_path)
    assert board == realistic_board
    assert board["columns"][0]["cardIds"] == ["card-1"]
    assert board["cards"]["card-2"]["title"] == "Review API"
