from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


USERNAME_PATTERN = r"^[A-Za-z0-9_.-]{3,32}$"

CollaboratorRole = Literal["viewer", "editor"]
BoardRole = Literal["owner", "editor", "viewer"]


class ColumnModel(BaseModel):
    id: str
    title: str
    cardIds: list[str]


ALLOWED_PRIORITIES = {"low", "medium", "high", "urgent"}


class CardModel(BaseModel):
    id: str
    title: str
    details: str = ""
    labels: list[str] = Field(default_factory=list)
    priority: str | None = None
    due_date: str | None = None  # ISO-8601 date string (YYYY-MM-DD)

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if v not in ALLOWED_PRIORITIES:
            raise ValueError(f"priority must be one of {sorted(ALLOWED_PRIORITIES)}")
        return v

    @field_validator("labels")
    @classmethod
    def validate_labels(cls, v: list[str]) -> list[str]:
        if len(v) > 20:
            raise ValueError("Too many labels")
        cleaned = [l.strip() for l in v if isinstance(l, str) and l.strip()]
        if any(len(l) > 40 for l in cleaned):
            raise ValueError("Label too long")
        return cleaned


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
    board_id: str
    question: str
    kanban: dict
    history: list[ChatMessage] = []


class RegisterRequest(BaseModel):
    username: str = Field(..., pattern=USERNAME_PATTERN)
    password: str = Field(..., min_length=6, max_length=200)
    email: EmailStr | None = None
    display_name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: str | None = None
    display_name: str

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


class BoardSummary(BaseModel):
    id: str
    name: str
    description: str
    color: str
    is_archived: bool
    position: int
    card_count: int
    column_count: int
    created_at: datetime
    updated_at: datetime
    role: BoardRole
    owner_id: str
    owner_username: str
    owner_display_name: str
    is_shared: bool


class CreateBoardRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    color: str = Field(default="#209dd7", max_length=20)


class UpdateBoardMetaRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    color: str | None = Field(default=None, max_length=20)
    is_archived: bool | None = None
    position: int | None = None


class ActivityEntry(BaseModel):
    id: str
    action: str
    meta: dict
    user_id: str
    user_display_name: str | None = None
    username: str | None = None
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    current_password: str | None = Field(default=None, max_length=200)
    new_password: str | None = Field(default=None, min_length=6, max_length=200)


class CollaboratorEntry(BaseModel):
    user_id: str
    username: str
    display_name: str
    role: BoardRole
    is_owner: bool
    added_at: datetime | None = None


class AddCollaboratorRequest(BaseModel):
    username: str = Field(..., pattern=USERNAME_PATTERN)
    role: CollaboratorRole = "viewer"


class UpdateCollaboratorRoleRequest(BaseModel):
    role: CollaboratorRole


class CardCommentEntry(BaseModel):
    id: str
    board_id: str
    card_id: str
    user_id: str
    username: str | None = None
    user_display_name: str | None = None
    body: str
    created_at: datetime
    updated_at: datetime
    edited: bool


class CreateCardCommentRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


class UpdateCardCommentRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


class BoardExportComment(BaseModel):
    card_id: str
    body: str
    username: str | None = None
    display_name: str | None = None
    created_at: datetime
    updated_at: datetime


class BoardExport(BaseModel):
    version: int = 1
    name: str
    description: str = ""
    color: str = "#209dd7"
    data: BoardDataModel
    comments: list[BoardExportComment] = Field(default_factory=list)
    exported_at: datetime | None = None


class ImportBoardRequest(BaseModel):
    version: int | None = None
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    color: str = Field(default="#209dd7", max_length=20)
    data: BoardDataModel
    comments: list[BoardExportComment] | None = None


class NotificationEntry(BaseModel):
    id: str
    kind: str
    board_id: str | None = None
    board_name: str | None = None
    card_id: str | None = None
    comment_id: str | None = None
    actor_id: str | None = None
    actor_username: str | None = None
    actor_display_name: str | None = None
    meta: dict
    read: bool
    created_at: datetime


class MarkReadRequest(BaseModel):
    read: bool = True


class DashboardBoard(BaseModel):
    board_id: str
    name: str
    color: str
    role: BoardRole
    is_shared: bool
    card_count: int
    overdue_count: int
    due_soon_count: int


class DashboardCard(BaseModel):
    card_id: str
    title: str
    priority: str | None = None
    due_date: str | None = None
    labels: list[str] = Field(default_factory=list)
    board_id: str
    board_name: str
    board_color: str
    column_title: str
    overdue: bool


class DashboardSummary(BaseModel):
    total_boards: int
    total_cards: int
    overdue_count: int
    due_soon_count: int


class DashboardResponse(BaseModel):
    summary: DashboardSummary
    boards: list[DashboardBoard]
    upcoming: list[DashboardCard]
