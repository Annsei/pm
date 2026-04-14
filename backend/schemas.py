from pydantic import BaseModel, field_validator


class ColumnModel(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class CardModel(BaseModel):
    id: str
    title: str
    details: str


class BoardDataModel(BaseModel):
    columns: list[ColumnModel]
    cards: dict[str, CardModel]

    @field_validator("columns")
    @classmethod
    def max_columns(cls, v: list) -> list:
        if len(v) > 20:
            raise ValueError("Too many columns")
        return v


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    user_id: str
    question: str
    kanban: dict
    history: list[ChatMessage] = []
