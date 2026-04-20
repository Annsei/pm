"""Role-based access helpers for board collaboration."""

import json

from fastapi import HTTPException
from sqlalchemy.orm import Session as DbSession

from backend.models import Board, BoardCollaborator, User
from backend.schemas import BoardRole, BoardSummary

ROLE_RANK: dict[BoardRole, int] = {"viewer": 1, "editor": 2, "owner": 3}


def get_board_with_role(
    db: DbSession, board_id: str, user: User
) -> tuple[Board, BoardRole]:
    """Return (board, effective_role). Raises 404 if no access (avoids leaking existence)."""
    board = db.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    if board.user_id == user.id:
        return board, "owner"
    entry = (
        db.query(BoardCollaborator)
        .filter(
            BoardCollaborator.board_id == board.id,
            BoardCollaborator.user_id == user.id,
        )
        .first()
    )
    if not entry:
        # Hide existence from non-collaborators.
        raise HTTPException(status_code=404, detail="Board not found")
    return board, entry.role  # type: ignore[return-value]


def require_role(role: BoardRole, minimum: BoardRole) -> None:
    if ROLE_RANK[role] < ROLE_RANK[minimum]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def summarize_board(board: Board, role: BoardRole, owner: User) -> BoardSummary:
    try:
        data = json.loads(board.data)
        columns = data.get("columns", []) or []
        cards = data.get("cards", {}) or {}
    except (ValueError, TypeError):
        columns, cards = [], {}
    return BoardSummary(
        id=board.id,
        name=board.name,
        description=board.description,
        color=board.color,
        is_archived=board.is_archived,
        position=board.position,
        card_count=len(cards),
        column_count=len(columns),
        created_at=board.created_at,
        updated_at=board.updated_at,
        role=role,
        owner_id=owner.id,
        owner_username=owner.username,
        owner_display_name=owner.display_name,
        is_shared=role != "owner",
    )
