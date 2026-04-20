import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DbSession

from backend.auth import get_current_user
from backend.models import Board, Notification, User, get_db
from backend.schemas import NotificationEntry

router = APIRouter(prefix="/api/notifications")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _entry(
    row: Notification,
    board: Board | None,
    actor: User | None,
) -> NotificationEntry:
    try:
        meta = json.loads(row.meta) if row.meta else {}
    except (ValueError, TypeError):
        meta = {}
    return NotificationEntry(
        id=row.id,
        kind=row.kind,
        board_id=row.board_id,
        board_name=board.name if board else meta.get("board_name"),
        card_id=row.card_id,
        comment_id=row.comment_id,
        actor_id=row.actor_id,
        actor_username=actor.username if actor else meta.get("actor_username"),
        actor_display_name=(
            actor.display_name if actor else meta.get("actor_display_name")
        ),
        meta=meta,
        read=row.read_at is not None,
        created_at=row.created_at,
    )


@router.get("", response_model=list[NotificationEntry])
def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> list[NotificationEntry]:
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.read_at.is_(None))
    rows = (
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
        .all()
    )
    board_ids = {r.board_id for r in rows if r.board_id}
    actor_ids = {r.actor_id for r in rows if r.actor_id}
    boards = (
        {b.id: b for b in db.query(Board).filter(Board.id.in_(board_ids)).all()}
        if board_ids
        else {}
    )
    actors = (
        {u.id: u for u in db.query(User).filter(User.id.in_(actor_ids)).all()}
        if actor_ids
        else {}
    )
    return [
        _entry(
            row,
            boards.get(row.board_id) if row.board_id else None,
            actors.get(row.actor_id) if row.actor_id else None,
        )
        for row in rows
    ]


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    row = db.get(Notification, notification_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    if row.read_at is None:
        row.read_at = _now()
        db.commit()
    return None


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    now = _now()
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read_at.is_(None),
    ).update({Notification.read_at: now}, synchronize_session=False)
    db.commit()
    return None
