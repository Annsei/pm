import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from backend.auth import get_current_user
from backend.models import Board, BoardCollaborator, User, get_db
from backend.schemas import (
    DashboardBoard,
    DashboardCard,
    DashboardResponse,
    DashboardSummary,
)

router = APIRouter(prefix="/api/dashboard")


def _load_boards_with_roles(
    db: DbSession, user: User
) -> list[tuple[Board, str]]:
    """Return list of (board, role) for every board the user can access."""
    owned = (
        db.query(Board)
        .filter(Board.user_id == user.id, Board.is_archived.is_(False))
        .all()
    )
    shared_rows = (
        db.query(Board, BoardCollaborator.role)
        .join(BoardCollaborator, BoardCollaborator.board_id == Board.id)
        .filter(
            BoardCollaborator.user_id == user.id,
            Board.is_archived.is_(False),
        )
        .all()
    )
    result: list[tuple[Board, str]] = [(b, "owner") for b in owned]
    result.extend((b, role) for b, role in shared_rows)
    return result


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _card_column_titles(board_data: dict) -> dict[str, str]:
    """Map card_id -> column_title based on cardIds lists."""
    out: dict[str, str] = {}
    for col in board_data.get("columns") or []:
        title = col.get("title", "")
        for cid in col.get("cardIds") or []:
            out[cid] = title
    return out


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    upcoming_limit: int = Query(default=12, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> DashboardResponse:
    today = date.today()
    soon_cutoff = today + timedelta(days=7)

    board_pairs = _load_boards_with_roles(db, current_user)

    board_summaries: list[DashboardBoard] = []
    all_cards: list[DashboardCard] = []

    for board, role in board_pairs:
        try:
            data = json.loads(board.data)
        except (ValueError, TypeError):
            data = {"columns": [], "cards": {}}
        cards: dict = data.get("cards") or {}
        col_title_by_card = _card_column_titles(data)

        overdue = 0
        due_soon = 0
        for card in cards.values():
            due = _parse_date(card.get("due_date"))
            if due is None:
                continue
            if due < today:
                overdue += 1
            elif due <= soon_cutoff:
                due_soon += 1

        board_summaries.append(
            DashboardBoard(
                board_id=board.id,
                name=board.name,
                color=board.color,
                role=role,  # type: ignore[arg-type]
                is_shared=role != "owner",
                card_count=len(cards),
                overdue_count=overdue,
                due_soon_count=due_soon,
            )
        )

        for cid, card in cards.items():
            due = _parse_date(card.get("due_date"))
            if due is None:
                continue
            all_cards.append(
                DashboardCard(
                    card_id=cid,
                    title=card.get("title", ""),
                    priority=card.get("priority"),
                    due_date=card.get("due_date"),
                    labels=list(card.get("labels") or []),
                    board_id=board.id,
                    board_name=board.name,
                    board_color=board.color,
                    column_title=col_title_by_card.get(cid, ""),
                    overdue=due < today,
                )
            )

    # Sort upcoming by due_date ascending; overdue first within the earliest dates.
    all_cards.sort(key=lambda c: (c.due_date or "9999-12-31", c.title.lower()))
    upcoming = all_cards[:upcoming_limit]

    summary = DashboardSummary(
        total_boards=len(board_summaries),
        total_cards=sum(b.card_count for b in board_summaries),
        overdue_count=sum(b.overdue_count for b in board_summaries),
        due_soon_count=sum(b.due_soon_count for b in board_summaries),
    )

    # Sort boards: shared after owned, alphabetical within.
    board_summaries.sort(key=lambda b: (b.is_shared, b.name.lower()))

    return DashboardResponse(
        summary=summary,
        boards=board_summaries,
        upcoming=upcoming,
    )
