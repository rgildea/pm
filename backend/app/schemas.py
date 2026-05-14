from pydantic import BaseModel, model_validator


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


class AIChatRequest(BaseModel):
    message: str
    board: BoardState


class AIChatResponse(BaseModel):
    response: str
    board: BoardState | None = None
