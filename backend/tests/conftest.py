import os
from pathlib import Path
import tempfile
from typing import Any, Iterator

from dotenv import load_dotenv
import pytest


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
                "description": "Cover board persistence",
            },
            "card-2": {
                "id": "card-2",
                "title": "Review API",
                "description": "Check request validation",
            },
        },
    }
