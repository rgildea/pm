from typing import Any

from pydantic import BaseModel


class BoardState(BaseModel):
    columns: list[dict[str, Any]]
    cards: dict[str, dict[str, Any]]


class BoardUpdateRequest(BaseModel):
    board: BoardState


class AIChatRequest(BaseModel):
    message: str
    board: BoardState


class AIChatResponse(BaseModel):
    response: str
    board: BoardState | None = None
