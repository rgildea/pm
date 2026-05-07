import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.board_defaults import DEFAULT_BOARD_STATE, DEFAULT_BOARD_TITLE

DEFAULT_USER_ID = "user"
DEFAULT_USERNAME = "user"


@dataclass
class BoardRecord:
    board_id: str
    title: str
    state: dict[str, Any]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect(db_path: Path) -> sqlite3.Connection:
    return sqlite3.connect(db_path)


def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                title TEXT NOT NULL,
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_boards_user_id
            ON boards(user_id)
            """
        )
        connection.execute(
            """
            INSERT OR IGNORE INTO users (id, username, created_at)
            VALUES (?, ?, ?)
            """,
            (DEFAULT_USER_ID, DEFAULT_USERNAME, _utc_now()),
        )
        connection.commit()


def _row_to_board(row: sqlite3.Row) -> BoardRecord:
    return BoardRecord(board_id=row[0], title=row[1], state=json.loads(row[2]))


def _get_board(connection: sqlite3.Connection, user_id: str) -> BoardRecord | None:
    connection.row_factory = sqlite3.Row
    row = connection.execute(
        "SELECT id, title, state_json FROM boards WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        return None
    return _row_to_board(row)


def _create_board(connection: sqlite3.Connection, user_id: str) -> BoardRecord:
    now = _utc_now()
    board_id = str(uuid4())
    state_json = json.dumps(DEFAULT_BOARD_STATE)
    connection.execute(
        """
        INSERT INTO boards (id, user_id, title, state_json, updated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (board_id, user_id, DEFAULT_BOARD_TITLE, state_json, now, now),
    )
    connection.commit()
    return BoardRecord(board_id=board_id, title=DEFAULT_BOARD_TITLE, state=DEFAULT_BOARD_STATE)


def get_board_state(db_path: Path, user_id: str = DEFAULT_USER_ID) -> dict[str, Any]:
    with _connect(db_path) as connection:
        board = _get_board(connection, user_id)
        if board is None:
            board = _create_board(connection, user_id)
        return board.state


def update_board_state(
    db_path: Path, board_state: dict[str, Any], user_id: str = DEFAULT_USER_ID
) -> dict[str, Any]:
    with _connect(db_path) as connection:
        board = _get_board(connection, user_id)
        now = _utc_now()
        state_json = json.dumps(board_state)
        if board is None:
            board_id = str(uuid4())
            connection.execute(
                """
                INSERT INTO boards (id, user_id, title, state_json, updated_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (board_id, user_id, DEFAULT_BOARD_TITLE, state_json, now, now),
            )
        else:
            connection.execute(
                """
                UPDATE boards
                SET state_json = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (state_json, now, user_id),
            )
        connection.commit()
    return board_state
