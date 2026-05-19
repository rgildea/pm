import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.auth import generate_token, hash_password
from app.board_defaults import DEFAULT_BOARD_STATE, DEFAULT_BOARD_TITLE

DEFAULT_USER_ID = "user"
DEFAULT_USERNAME = "user"
DEFAULT_PASSWORD = "password"


@dataclass
class BoardRecord:
    board_id: str
    title: str
    state: dict[str, Any]
    created_at: str
    updated_at: str


@dataclass
class UserRecord:
    user_id: str
    username: str
    password_hash: str


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """
        )
        # Migrate: add password_hash if missing (existing DBs without it)
        try:
            conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''")
        except sqlite3.OperationalError:
            pass  # Column already exists

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_boards_user_id
            ON boards(user_id)
            """
        )

        now = _utc_now()
        default_hash = hash_password(DEFAULT_PASSWORD)
        existing = conn.execute(
            "SELECT id, password_hash FROM users WHERE id = ?", (DEFAULT_USER_ID,)
        ).fetchone()
        if existing is None:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (DEFAULT_USER_ID, DEFAULT_USERNAME, default_hash, now),
            )
        elif existing[1] == "":
            # Migrate existing user without password hash
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (default_hash, DEFAULT_USER_ID),
            )

        conn.commit()


# --- Auth helpers ---


def get_user_by_id(db_path: Path, user_id: str) -> UserRecord | None:
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if row is None:
        return None
    return UserRecord(user_id=row[0], username=row[1], password_hash=row[2])


def get_user_by_username(db_path: Path, username: str) -> UserRecord | None:
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if row is None:
        return None
    return UserRecord(user_id=row[0], username=row[1], password_hash=row[2])


def create_user(db_path: Path, username: str, password_hash: str) -> UserRecord:
    user_id = str(uuid4())
    now = _utc_now()
    with _connect(db_path) as conn:
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (user_id, username, password_hash, now),
        )
        conn.commit()
    return UserRecord(user_id=user_id, username=username, password_hash=password_hash)


def create_session(db_path: Path, user_id: str) -> str:
    token = generate_token()
    now = _utc_now()
    expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    with _connect(db_path) as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now, expires),
        )
        conn.commit()
    return token


def get_session_user_id(db_path: Path, token: str) -> str | None:
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT user_id, expires_at FROM sessions WHERE token = ?",
            (token,),
        ).fetchone()
    if row is None:
        return None
    user_id, expires_at = row
    if datetime.fromisoformat(expires_at) < datetime.now(timezone.utc):
        return None
    return user_id


def delete_session(db_path: Path, token: str) -> None:
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


# --- Board helpers ---


def _row_to_board(row: tuple) -> BoardRecord:
    return BoardRecord(
        board_id=row[0],
        title=row[1],
        state=json.loads(row[2]),
        created_at=row[3],
        updated_at=row[4],
    )


def list_boards(db_path: Path, user_id: str) -> list[BoardRecord]:
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, title, state_json, created_at, updated_at FROM boards WHERE user_id = ? ORDER BY created_at ASC",
            (user_id,),
        ).fetchall()
    return [_row_to_board(row) for row in rows]


def get_board(db_path: Path, board_id: str, user_id: str) -> BoardRecord | None:
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT id, title, state_json, created_at, updated_at FROM boards WHERE id = ? AND user_id = ?",
            (board_id, user_id),
        ).fetchone()
    if row is None:
        return None
    return _row_to_board(row)


def get_or_create_default_board(db_path: Path, user_id: str) -> BoardRecord:
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT id, title, state_json, created_at, updated_at FROM boards WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
            (user_id,),
        ).fetchone()
        if row is not None:
            return _row_to_board(row)
        return _create_board_in_conn(conn, user_id, DEFAULT_BOARD_TITLE, DEFAULT_BOARD_STATE)


def _create_board_in_conn(
    conn: sqlite3.Connection, user_id: str, title: str, state: dict[str, Any]
) -> BoardRecord:
    now = _utc_now()
    board_id = str(uuid4())
    state_json = json.dumps(state)
    conn.execute(
        "INSERT INTO boards (id, user_id, title, state_json, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (board_id, user_id, title, state_json, now, now),
    )
    conn.commit()
    return BoardRecord(board_id=board_id, title=title, state=state, created_at=now, updated_at=now)


def create_board(db_path: Path, user_id: str, title: str) -> BoardRecord:
    with _connect(db_path) as conn:
        return _create_board_in_conn(conn, user_id, title, DEFAULT_BOARD_STATE)


def update_board_state(
    db_path: Path, board_id: str, user_id: str, state: dict[str, Any]
) -> BoardRecord | None:
    now = _utc_now()
    with _connect(db_path) as conn:
        cur = conn.execute(
            "UPDATE boards SET state_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (json.dumps(state), now, board_id, user_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, title, state_json, created_at, updated_at FROM boards WHERE id = ?",
            (board_id,),
        ).fetchone()
    return _row_to_board(row)


def rename_board(db_path: Path, board_id: str, user_id: str, title: str) -> BoardRecord | None:
    now = _utc_now()
    with _connect(db_path) as conn:
        cur = conn.execute(
            "UPDATE boards SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (title, now, board_id, user_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, title, state_json, created_at, updated_at FROM boards WHERE id = ?",
            (board_id,),
        ).fetchone()
    return _row_to_board(row)


def delete_board(db_path: Path, board_id: str, user_id: str) -> bool:
    with _connect(db_path) as conn:
        cur = conn.execute(
            "DELETE FROM boards WHERE id = ? AND user_id = ?",
            (board_id, user_id),
        )
        conn.commit()
    return cur.rowcount > 0
