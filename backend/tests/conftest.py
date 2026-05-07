from pathlib import Path
from typing import Iterator

from dotenv import load_dotenv
import pytest


def _default_db_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "app.db"


def _root_env_path() -> Path:
    return Path(__file__).resolve().parents[2] / ".env"


@pytest.fixture(scope="session", autouse=True)
def cleanup_default_db() -> Iterator[None]:
    load_dotenv(_root_env_path(), override=False)
    db_path = _default_db_path()
    if db_path.exists():
        db_path.unlink()
    yield
    if db_path.exists():
        db_path.unlink()
