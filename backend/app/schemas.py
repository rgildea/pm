import re
from typing import Literal

from pydantic import BaseModel, model_validator


class Card(BaseModel):
    id: str
    title: str
    details: str
    priority: Literal["low", "medium", "high"] = "medium"
    due_date: str | None = None

    @model_validator(mode="after")
    def _check_fields(self) -> "Card":
        if self.due_date is not None:
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", self.due_date):
                raise ValueError("due_date must be in YYYY-MM-DD format")
        return self


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardState(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def _check_card_references(self) -> "BoardState":
        referenced: set[str] = set()
        for column in self.columns:
            for card_id in column.cardIds:
                if card_id in referenced:
                    raise ValueError(f"card id {card_id!r} appears in multiple columns")
                referenced.add(card_id)
        card_keys = set(self.cards.keys())
        missing = referenced - card_keys
        if missing:
            raise ValueError(f"cardIds reference unknown cards: {sorted(missing)}")
        orphaned = card_keys - referenced
        if orphaned:
            raise ValueError(f"cards not referenced by any column: {sorted(orphaned)}")
        return self


class BoardUpdateRequest(BaseModel):
    board: BoardState


class BoardRenameRequest(BaseModel):
    title: str


class BoardCreateRequest(BaseModel):
    title: str


class BoardSummary(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str


class AIChatRequest(BaseModel):
    message: str
    board: BoardState


class AIChatResponse(BaseModel):
    response: str
    board: BoardState | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
