from pathlib import Path

from app.db import get_board_state, init_db, update_board_state


def test_init_creates_default_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    board = get_board_state(db_path)
    assert "columns" in board
    assert "cards" in board


def test_update_board_state(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    updated = {
        "columns": [{"id": "col-a", "title": "A", "cardIds": []}],
        "cards": {},
    }
    update_board_state(db_path, updated)

    board = get_board_state(db_path)
    assert board == updated
