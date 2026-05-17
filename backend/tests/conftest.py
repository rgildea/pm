import os
from pathlib import Path
import tempfile
from typing import Any, Iterator

from dotenv import load_dotenv
import pytest
from fastapi.testclient import TestClient

from app.main import create_app


TEST_DEFAULT_DB_PATH = Path(tempfile.gettempdir()) / "pm-backend-tests" / "app.db"
os.environ["PM_DB_PATH"] = str(TEST_DEFAULT_DB_PATH)
if TEST_DEFAULT_DB_PATH.exists():
    TEST_DEFAULT_DB_PATH.unlink()


def _root_env_path() -> Path:
    return Path(__file__).resolve().parents[2] / ".env"


@pytest.fixture(scope="session", autouse=True)
def load_root_env() -> Iterator[None]:
    load_dotenv(_root_env_path(), override=False)
    yield
    if TEST_DEFAULT_DB_PATH.exists():
        TEST_DEFAULT_DB_PATH.unlink()


@pytest.fixture
def realistic_board() -> dict[str, Any]:
    return {
        "columns": [
            {"id": "todo", "title": "Todo", "cardIds": ["card-1"]},
            {"id": "doing", "title": "Doing", "cardIds": ["card-2"]},
            {"id": "done", "title": "Done", "cardIds": []},
        ],
        "cards": {
            "card-1": {
                "id": "card-1",
                "title": "Write tests",
                "details": "Cover board persistence",
            },
            "card-2": {
                "id": "card-2",
                "title": "Review API",
                "details": "Check request validation",
            },
        },
    }


def login(client: TestClient, username: str = "user", password: str = "password") -> str:
    """Log in and return Bearer auth header value."""
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return f"Bearer {resp.json()['token']}"


@pytest.fixture
def app_client(tmp_path: Path):
    """Returns (client, auth_headers) for the default user."""
    db_path = tmp_path / "app.db"
    app = create_app(db_path)
    client = TestClient(app)
    auth = login(client)
    return client, {"Authorization": auth}
