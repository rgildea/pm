from pydantic import BaseModel


class Card(BaseModel):
    id: str
    title: str
    details: str


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardState(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]


class BoardUpdateRequest(BaseModel):
    board: BoardState


class AIChatRequest(BaseModel):
    message: str
    board: BoardState


class AIChatResponse(BaseModel):
    response: str
    board: BoardState | None = None
