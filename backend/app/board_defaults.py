import json
from pathlib import Path

BOARD_DEFAULTS_PATH = Path(__file__).resolve().parent.parent.parent / "frontend" / "default-board.json"

with open(BOARD_DEFAULTS_PATH) as _f:
    _data = json.load(_f)

DEFAULT_BOARD_TITLE: str = _data["title"]
DEFAULT_BOARD_STATE: dict = {"columns": _data["columns"], "cards": _data["cards"]}
