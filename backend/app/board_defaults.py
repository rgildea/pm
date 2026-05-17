import json
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
BOARD_DEFAULTS_PATH = _ROOT / "frontend" / "default-board.json"

try:
    with open(BOARD_DEFAULTS_PATH) as _f:
        _data = json.load(_f)
except FileNotFoundError as exc:
    raise FileNotFoundError(
        f"Default board file not found at {BOARD_DEFAULTS_PATH}. "
        "The backend expects the frontend directory to be a sibling of backend/."
    ) from exc

DEFAULT_BOARD_TITLE: str = _data["title"]
DEFAULT_BOARD_STATE: dict = {"columns": _data["columns"], "cards": _data["cards"]}
