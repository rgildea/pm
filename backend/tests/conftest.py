from pathlib import Path

import pytest


def _default_db_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "app.db"


@pytest.fixture(scope="session", autouse=True)
def cleanup_default_db() -> None:
    db_path = _default_db_path()
    if db_path.exists():
        db_path.unlink()
    yield
    if db_path.exists():
        db_path.unlink()
