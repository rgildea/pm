from pathlib import Path
from typing import Any

from app.auth import hash_password, verify_password
from app.db import (
    create_board,
    create_session,
    create_user,
    delete_board,
    delete_session,
    get_board,
    get_board_state,
    get_or_create_default_board,
    get_session_user_id,
    get_user_by_username,
    init_db,
    list_boards,
    rename_board,
    update_board_state,
)


def test_init_creates_default_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    board = get_board_state(db_path)
    assert "columns" in board
    assert "cards" in board


def test_update_board_state(tmp_path: Path, realistic_board: dict[str, Any]) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    default_board = get_or_create_default_board(db_path, "user")
    update_board_state(db_path, default_board.board_id, "user", realistic_board)

    board = get_board_state(db_path)
    assert board == realistic_board
    assert board["columns"][0]["cardIds"] == ["card-1"]
    assert board["cards"]["card-2"]["title"] == "Review API"


def test_password_hash_and_verify() -> None:
    hashed = hash_password("mysecret")
    assert ":" in hashed
    assert verify_password("mysecret", hashed)
    assert not verify_password("wrongpassword", hashed)


def test_create_and_get_user(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    hashed = hash_password("testpass")
    user = create_user(db_path, "alice", hashed)
    assert user.username == "alice"
    assert user.user_id != ""

    found = get_user_by_username(db_path, "alice")
    assert found is not None
    assert found.user_id == user.user_id
    assert verify_password("testpass", found.password_hash)


def test_get_user_not_found(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)
    assert get_user_by_username(db_path, "nobody") is None


def test_session_lifecycle(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    token = create_session(db_path, "user")
    assert token != ""

    user_id = get_session_user_id(db_path, token)
    assert user_id == "user"

    delete_session(db_path, token)
    assert get_session_user_id(db_path, token) is None


def test_invalid_session_returns_none(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)
    assert get_session_user_id(db_path, "invalid-token") is None


def test_multi_board_crud(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    board1 = create_board(db_path, "user", "Work")
    board2 = create_board(db_path, "user", "Personal")

    boards = list_boards(db_path, "user")
    # May also have the auto-created default board; both new ones must be present
    titles = [b.title for b in boards]
    assert "Work" in titles
    assert "Personal" in titles

    fetched = get_board(db_path, board1.board_id, "user")
    assert fetched is not None
    assert fetched.title == "Work"

    # Another user cannot access board1
    hashed = hash_password("pass")
    other_user = create_user(db_path, "bob", hashed)
    assert get_board(db_path, board1.board_id, other_user.user_id) is None


def test_rename_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    board = create_board(db_path, "user", "Old Title")
    renamed = rename_board(db_path, board.board_id, "user", "New Title")
    assert renamed is not None
    assert renamed.title == "New Title"


def test_delete_board(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    board = create_board(db_path, "user", "Temp Board")
    deleted = delete_board(db_path, board.board_id, "user")
    assert deleted is True
    assert get_board(db_path, board.board_id, "user") is None


def test_delete_board_wrong_user(tmp_path: Path) -> None:
    db_path = tmp_path / "app.db"
    init_db(db_path)

    board = create_board(db_path, "user", "My Board")
    hashed = hash_password("pass")
    other = create_user(db_path, "eve", hashed)
    deleted = delete_board(db_path, board.board_id, other.user_id)
    assert deleted is False
