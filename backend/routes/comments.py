import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from backend.activity import record_activity
from backend.auth import get_current_user
from backend.mentions import parse_mentions
from backend.models import Board, BoardCollaborator, CardComment, Notification, User, get_db
from backend.permissions import get_board_with_role, require_role
from backend.schemas import (
    CardCommentEntry,
    CreateCardCommentRequest,
    UpdateCardCommentRequest,
)


def _board_member_ids(db: DbSession, board: Board) -> set[str]:
    """Return set of user IDs with any access to a board (owner + collaborators)."""
    ids = {board.user_id}
    ids.update(
        row.user_id
        for row in db.query(BoardCollaborator.user_id)
        .filter(BoardCollaborator.board_id == board.id)
        .all()
    )
    return ids


def _resolve_mentions(
    db: DbSession, body: str, board: Board, exclude_user_id: str
) -> list[User]:
    """Look up mentioned usernames and filter to board members (excluding `exclude_user_id`)."""
    unames = parse_mentions(body)
    if not unames:
        return []
    users = db.query(User).filter(User.username.in_(unames)).all()
    member_ids = _board_member_ids(db, board)
    return [u for u in users if u.id in member_ids and u.id != exclude_user_id]


def _create_mention_notifications(
    db: DbSession,
    *,
    targets: list[User],
    actor: User,
    board: Board,
    card_id: str,
    comment_id: str,
) -> None:
    for target in targets:
        db.add(
            Notification(
                id=str(uuid.uuid4()),
                user_id=target.id,
                kind="comment_mention",
                board_id=board.id,
                card_id=card_id,
                comment_id=comment_id,
                actor_id=actor.id,
                meta=json.dumps(
                    {
                        "board_name": board.name,
                        "actor_username": actor.username,
                        "actor_display_name": actor.display_name,
                    }
                ),
            )
        )


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)

router = APIRouter(prefix="/api/boards/{board_id}/cards/{card_id}/comments")


def _ensure_card(board: Board, card_id: str) -> None:
    try:
        cards = (json.loads(board.data) or {}).get("cards") or {}
    except (ValueError, TypeError):
        cards = {}
    if card_id not in cards:
        raise HTTPException(status_code=404, detail="Card not found")


def _entry(row: CardComment, user: User | None) -> CardCommentEntry:
    return CardCommentEntry(
        id=row.id,
        board_id=row.board_id,
        card_id=row.card_id,
        user_id=row.user_id,
        username=user.username if user else None,
        user_display_name=user.display_name if user else None,
        body=row.body,
        created_at=row.created_at,
        updated_at=row.updated_at,
        edited=row.updated_at > row.created_at,
    )


@router.get("", response_model=list[CardCommentEntry])
def list_comments(
    board_id: str,
    card_id: str,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> list[CardCommentEntry]:
    board, _role = get_board_with_role(db, board_id, current_user)
    _ensure_card(board, card_id)
    rows = (
        db.query(CardComment)
        .filter(
            CardComment.board_id == board.id,
            CardComment.card_id == card_id,
        )
        .order_by(CardComment.created_at.asc(), CardComment.id.asc())
        .all()
    )
    user_ids = {row.user_id for row in rows}
    users = (
        {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        if user_ids
        else {}
    )
    return [_entry(row, users.get(row.user_id)) for row in rows]


@router.post("", response_model=CardCommentEntry, status_code=status.HTTP_201_CREATED)
def create_comment(
    board_id: str,
    card_id: str,
    req: CreateCardCommentRequest,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> CardCommentEntry:
    board, role = get_board_with_role(db, board_id, current_user)
    require_role(role, "editor")
    _ensure_card(board, card_id)
    now = _now()
    comment = CardComment(
        id=str(uuid.uuid4()),
        board_id=board.id,
        card_id=card_id,
        user_id=current_user.id,
        body=req.body,
        created_at=now,
        updated_at=now,
    )
    db.add(comment)
    db.flush()
    mentioned = _resolve_mentions(
        db, req.body, board, exclude_user_id=current_user.id
    )
    record_activity(
        db,
        board_id=board.id,
        user_id=current_user.id,
        action="comment_add",
        meta={
            "card_id": card_id,
            "comment_id": comment.id,
            "mentions": [u.username for u in mentioned],
        },
    )
    _create_mention_notifications(
        db,
        targets=mentioned,
        actor=current_user,
        board=board,
        card_id=card_id,
        comment_id=comment.id,
    )
    db.commit()
    db.refresh(comment)
    return _entry(comment, current_user)


@router.patch("/{comment_id}", response_model=CardCommentEntry)
def update_comment(
    board_id: str,
    card_id: str,
    comment_id: str,
    req: UpdateCardCommentRequest,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> CardCommentEntry:
    board, _role = get_board_with_role(db, board_id, current_user)
    _ensure_card(board, card_id)
    row = db.get(CardComment, comment_id)
    if not row or row.board_id != board.id or row.card_id != card_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the author can edit")
    if row.body != req.body:
        prev_mentions = set(parse_mentions(row.body))
        row.body = req.body
        new_mentioned = _resolve_mentions(
            db, req.body, board, exclude_user_id=current_user.id
        )
        # Only notify users newly mentioned (not already notified by prior version).
        fresh = [u for u in new_mentioned if u.username.lower() not in prev_mentions]
        record_activity(
            db,
            board_id=board.id,
            user_id=current_user.id,
            action="comment_edit",
            meta={
                "card_id": card_id,
                "comment_id": row.id,
                "mentions": [u.username for u in fresh],
            },
        )
        _create_mention_notifications(
            db,
            targets=fresh,
            actor=current_user,
            board=board,
            card_id=card_id,
            comment_id=row.id,
        )
        db.commit()
        db.refresh(row)
    return _entry(row, current_user)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    board_id: str,
    card_id: str,
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    board, role = get_board_with_role(db, board_id, current_user)
    _ensure_card(board, card_id)
    row = db.get(CardComment, comment_id)
    if not row or row.board_id != board.id or row.card_id != card_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    # Author may delete their own; owner may delete any.
    if row.user_id != current_user.id and role != "owner":
        raise HTTPException(status_code=403, detail="Forbidden")
    author_id = row.user_id
    db.delete(row)
    record_activity(
        db,
        board_id=board.id,
        user_id=current_user.id,
        action="comment_delete",
        meta={
            "card_id": card_id,
            "comment_id": comment_id,
            "author_user_id": author_id,
        },
    )
    db.commit()
    return None
