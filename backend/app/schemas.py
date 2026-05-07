from typing import Any

from pydantic import BaseModel


class BoardUpdateRequest(BaseModel):
    board: dict[str, Any]
