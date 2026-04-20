import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DbSession

from backend.activity import diff_board_data, record_activity
from backend.auth import get_current_user
from backend.models import (
    ActivityLog,
    Board,
    BoardCollaborator,
    CardComment,
    DEFAULT_BOARD_DATA,
    Notification,
    User,
    get_db,
)
from backend.permissions import (
    ROLE_RANK,
    get_board_with_role,
    require_role,
    summarize_board,
)
from backend.schemas import (
    ActivityEntry,
    AddCollaboratorRequest,
    BoardDataModel,
    BoardExport,
    BoardExportComment,
    BoardSummary,
    CollaboratorEntry,
    CreateBoardRequest,
    ImportBoardRequest,
    UpdateBoardMetaRequest,
    UpdateCollaboratorRoleRequest,
)

router = APIRouter(prefix="/api/boards")


def _next_position(db: DbSession, user_id: str) -> int:
    existing = (
        db.query(Board.position)
        .filter(Board.user_id == user_id)
        .order_by(Board.position.desc())
        .first()
    )
    return (existing[0] + 1) if existing else 0


@router.get("", response_model=list[BoardSummary])
def list_boards(
    include_archived: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> list[BoardSummary]:
    owned_query = db.query(Board).filter(Board.user_id == current_user.id)
    if not include_archived:
        owned_query = owned_query.filter(Board.is_archived.is_(False))
    owned = owned_query.order_by(Board.position.asc(), Board.created_at.asc()).all()

    if not owned and not include_archived:
        board = Board(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            name="My First Board",
            data=json.dumps(DEFAULT_BOARD_DATA),
            position=0,
        )
        db.add(board)
        db.flush()  # Persist board row before inserting FK-dependent activity_log.
        record_activity(
            db,
            board_id=board.id,
            user_id=current_user.id,
            action="board_create",
            meta={"name": board.name, "seeded": True},
        )
        db.commit()
        db.refresh(board)
        owned = [board]

    shared_rows = (
        db.query(Board, BoardCollaborator.role)
        .join(BoardCollaborator, BoardCollaborator.board_id == Board.id)
        .filter(BoardCollaborator.user_id == current_user.id)
    )
    if not include_archived:
        shared_rows = shared_rows.filter(Board.is_archived.is_(False))
    shared_rows = shared_rows.order_by(Board.created_at.asc()).all()

    owner_ids = {b.user_id for b, _ in [(o, "owner") for o in owned]} | {
        b.user_id for b, _ in shared_rows
    }
    owners = {
        u.id: u for u in db.query(User).filter(User.id.in_(owner_ids)).all()
    } if owner_ids else {}

    out: list[BoardSummary] = []
    for b in owned:
        out.append(summarize_board(b, "owner", owners.get(b.user_id) or current_user))
    for b, role in shared_rows:
        owner = owners.get(b.user_id)
        if not owner:
            continue
        out.append(summarize_board(b, role, owner))
    return out


@router.post("/import", response_model=BoardSummary, status_code=status.HTTP_201_CREATED)
def import_board(
    req: ImportBoardRequest,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> BoardSummary:
    board = Board(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=req.name,
        description=req.description,
        color=req.color,
        data=json.dumps(req.data.model_dump()),
        position=_next_position(db, current_user.id),
    )
    db.add(board)
    db.flush()
    record_activity(
        db,
        board_id=board.id,
        user_id=current_user.id,
        action="board_create",
        meta={"name": req.name, "color": req.color, "source": "import"},
    )
    valid_card_ids = set(req.data.cards.keys())
    if req.comments:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        for entry in req.comments[:500]:  # hard cap to avoid abuse
            if entry.card_id not in valid_card_ids:
                continue
            body = (entry.body or "").strip()
            if not body:
                continue
            db.add(
                CardComment(
                    id=str(uuid.uuid4()),
                    board_id=board.id,
                    card_id=entry.card_id,
                    user_id=current_user.id,
                    body=body[:4000],
                    created_at=now,
                    updated_at=now,
                )
            )
    db.commit()
    db.refresh(board)
    return summarize_board(board, "owner", current_user)


@router.post("", response_model=BoardSummary, status_code=status.HTTP_201_CREATED)
def create_board(
    req: CreateBoardRequest,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> BoardSummary:
    board = Board(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=req.name,
        description=req.description,
        color=req.color,
        data=json.dumps(DEFAULT_BOARD_DATA),
        position=_next_position(db, current_user.id),
    )
    db.add(board)
    db.flush()  # Persist board row before inserting FK-dependent activity_log.
    record_activity(
        db,
        board_id=board.id,
        user_id=current_user.id,
        action="board_create",
        meta={"name": req.name, "color": req.color},
    )
    db.commit()
    db.refresh(board)
    return summarize_board(board, "owner", current_user)


@router.get("/{board_id}")
def get_board_data(
    board_id: str,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    board, _ = get_board_with_role(db, board_id, current_user)
    return json.loads(board.data)


@router.get("/{board_id}/export", response_model=BoardExport)
def export_board(
    board_id: str,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> BoardExport:
    board, _role = get_board_with_role(db, board_id, current_user)
    try:
        raw = json.loads(board.data)
    except (ValueError, TypeError):
        raw = {"columns": [], "cards": {}}
    data = BoardDataModel(**raw)

    comment_rows = (
        db.query(CardComment)
        .filter(CardComment.board_id == board.id)
        .order_by(CardComment.created_at.asc())
        .all()
    )
    author_ids = {row.user_id for row in comment_rows}
    authors = (
        {u.id: u for u in db.query(User).filter(User.id.in_(author_ids)).all()}
        if author_ids
        else {}
    )
    comments = [
        BoardExportComment(
            card_id=row.card_id,
            body=row.body,
            username=authors[row.user_id].username if row.user_id in authors else None,
            display_name=(
                authors[row.user_id].display_name if row.user_id in authors else None
            ),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in comment_rows
    ]

    return BoardExport(
        version=1,
        name=board.name,
        description=board.description,
        color=board.color,
        data=data,
        comments=comments,
        exported_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


@router.put("/{board_id}")
def update_board_data(
    board_id: str,
    board_data: BoardDataModel,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    board, role = get_board_with_role(db, board_id, current_user)
    require_role(role, "editor")
    try:
        old_data = json.loads(board.data)
    except (ValueError, TypeError):
        old_data = {"columns": [], "cards": {}}
    new_data = board_data.model_dump()
    board.data = json.dumps(new_data)
    for event in diff_board_data(old_data, new_data):
        record_activity(
            db,
            board_id=board.id,
            user_id=current_user.id,
            action=event.pop("action"),
            meta=event,
        )
    db.commit()
    return {"message": "Board updated successfully"}


@router.patch("/{board_id}", response_model=BoardSummary)
def update_board_meta(
    board_id: str,
    req: UpdateBoardMetaRequest,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> BoardSummary:
    board, role = get_board_with_role(db, board_id, current_user)
    require_role(role, "owner")
    changes: dict[str, tuple] = {}
    if req.name is not None and req.name != board.name:
        changes["name"] = (board.name, req.name)
        board.name = req.name
    if req.description is not None and req.description != board.description:
        changes["description"] = (board.description, req.description)
        board.description = req.description
    if req.color is not None and req.color != board.color:
        changes["color"] = (board.color, req.color)
        board.color = req.color
    if req.is_archived is not None and req.is_archived != board.is_archived:
        changes["is_archived"] = (board.is_archived, req.is_archived)
        board.is_archived = req.is_archived
    if req.position is not None and req.position != board.position:
        changes["position"] = (board.position, req.position)
        board.position = req.position

    if "is_archived" in changes:
        new_val = changes["is_archived"][1]
        record_activity(
            db,
            board_id=board.id,
            user_id=current_user.id,
            action="board_archive" if new_val else "board_unarchive",
            meta={"name": board.name},
        )
    meta_fields = {k: {"from": v[0], "to": v[1]} for k, v in changes.items() if k != "is_archived"}
    if meta_fields:
        record_activity(
            db,
            board_id=board.id,
            user_id=current_user.id,
            action="board_meta_update",
            meta={"changes": meta_fields},
        )
    db.commit()
    db.refresh(board)
    return summarize_board(board, role, current_user)


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(
    board_id: str,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    board, role = get_board_with_role(db, board_id, current_user)
    require_role(role, "owner")
    db.delete(board)
    db.commit()
    return None


@router.get("/{board_id}/activity", response_model=list[ActivityEntry])
def list_activity(
    board_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    before: datetime | None = Query(default=None),
    kinds: str | None = Query(default=None, description="Comma-separated action names to include"),
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> list[ActivityEntry]:
    get_board_with_role(db, board_id, current_user)
    query = db.query(ActivityLog).filter(ActivityLog.board_id == board_id)
    if before is not None:
        query = query.filter(ActivityLog.created_at < before)
    if kinds:
        wanted = [k.strip() for k in kinds.split(",") if k.strip()]
        if wanted:
            query = query.filter(ActivityLog.action.in_(wanted))
    rows = (
        query.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .limit(limit)
        .all()
    )
    user_ids = {row.user_id for row in rows}
    users = {}
    if user_ids:
        for u in db.query(User).filter(User.id.in_(user_ids)).all():
            users[u.id] = u
    out: list[ActivityEntry] = []
    for row in rows:
        try:
            meta = json.loads(row.meta) if row.meta else {}
        except (ValueError, TypeError):
            meta = {}
        user = users.get(row.user_id)
        out.append(
            ActivityEntry(
                id=row.id,
                action=row.action,
                meta=meta,
                user_id=row.user_id,
                user_display_name=user.display_name if user else None,
                username=user.username if user else None,
                created_at=row.created_at,
            )
        )
    return out


# Collaborators -------------------------------------------------------------


def _serialize_collaborators(
    board: Board, owner: User, rows: list[BoardCollaborator], users: dict[str, User]
) -> list[CollaboratorEntry]:
    out: list[CollaboratorEntry] = [
        CollaboratorEntry(
            user_id=owner.id,
            username=owner.username,
            display_name=owner.display_name,
            role="owner",
            is_owner=True,
            added_at=board.created_at,
        )
    ]
    for row in rows:
        u = users.get(row.user_id)
        if not u:
            continue
        out.append(
            CollaboratorEntry(
                user_id=u.id,
                username=u.username,
                display_name=u.display_name,
                role=row.role,
                is_owner=False,
                added_at=row.created_at,
            )
        )
    return out


@router.get("/{board_id}/collaborators", response_model=list[CollaboratorEntry])
def list_collaborators(
    board_id: str,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> list[CollaboratorEntry]:
    board, _role = get_board_with_role(db, board_id, current_user)
    owner = db.get(User, board.user_id)
    if not owner:
        raise HTTPException(status_code=500, detail="Board owner missing")
    rows = (
        db.query(BoardCollaborator)
        .filter(BoardCollaborator.board_id == board.id)
        .order_by(BoardCollaborator.created_at.asc())
        .all()
    )
    user_ids = {r.user_id for r in rows}
    users = (
        {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        if user_ids
        else {}
    )
    return _serialize_collaborators(board, owner, rows, users)


@router.post(
    "/{board_id}/collaborators",
    response_model=CollaboratorEntry,
    status_code=status.HTTP_201_CREATED,
)
def add_collaborator(
    board_id: str,
    req: AddCollaboratorRequest,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> CollaboratorEntry:
    board, role = get_board_with_role(db, board_id, current_user)
    require_role(role, "owner")

    invited = db.query(User).filter(User.username == req.username).first()
    if not invited:
        raise HTTPException(status_code=404, detail="User not found")
    if invited.id == board.user_id:
        raise HTTPException(status_code=400, detail="Owner is already a member")
    existing = (
        db.query(BoardCollaborator)
        .filter(
            BoardCollaborator.board_id == board.id,
            BoardCollaborator.user_id == invited.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already a collaborator")

    entry = BoardCollaborator(
        id=str(uuid.uuid4()),
        board_id=board.id,
        user_id=invited.id,
        role=req.role,
        added_by_user_id=current_user.id,
    )
    db.add(entry)
    record_activity(
        db,
        board_id=board.id,
        user_id=current_user.id,
        action="collaborator_add",
        meta={
            "target_user_id": invited.id,
            "target_username": invited.username,
            "role": req.role,
        },
    )
    db.add(
        Notification(
            id=str(uuid.uuid4()),
            user_id=invited.id,
            kind="collaborator_added",
            board_id=board.id,
            actor_id=current_user.id,
            meta=json.dumps(
                {
                    "board_name": board.name,
                    "role": req.role,
                    "actor_username": current_user.username,
                    "actor_display_name": current_user.display_name,
                }
            ),
        )
    )
    db.commit()
    db.refresh(entry)
    return CollaboratorEntry(
        user_id=invited.id,
        username=invited.username,
        display_name=invited.display_name,
        role=entry.role,
        is_owner=False,
        added_at=entry.created_at,
    )


@router.patch(
    "/{board_id}/collaborators/{user_id}",
    response_model=CollaboratorEntry,
)
def update_collaborator_role(
    board_id: str,
    user_id: str,
    req: UpdateCollaboratorRoleRequest,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> CollaboratorEntry:
    board, role = get_board_with_role(db, board_id, current_user)
    require_role(role, "owner")
    entry = (
        db.query(BoardCollaborator)
        .filter(
            BoardCollaborator.board_id == board.id,
            BoardCollaborator.user_id == user_id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if entry.role != req.role:
        old = entry.role
        entry.role = req.role
        record_activity(
            db,
            board_id=board.id,
            user_id=current_user.id,
            action="collaborator_role_change",
            meta={
                "target_user_id": target.id,
                "target_username": target.username,
                "from": old,
                "to": req.role,
            },
        )
        db.commit()
        db.refresh(entry)
    return CollaboratorEntry(
        user_id=target.id,
        username=target.username,
        display_name=target.display_name,
        role=entry.role,
        is_owner=False,
        added_at=entry.created_at,
    )


@router.delete(
    "/{board_id}/collaborators/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_collaborator(
    board_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    board, role = get_board_with_role(db, board_id, current_user)
    # Owner can remove anyone; collaborators can remove themselves (leave board).
    if role != "owner" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if user_id == board.user_id:
        raise HTTPException(status_code=400, detail="Cannot remove board owner")
    entry = (
        db.query(BoardCollaborator)
        .filter(
            BoardCollaborator.board_id == board.id,
            BoardCollaborator.user_id == user_id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    target = db.get(User, user_id)
    db.delete(entry)
    record_activity(
        db,
        board_id=board.id,
        user_id=current_user.id,
        action="collaborator_remove",
        meta={
            "target_user_id": user_id,
            "target_username": target.username if target else None,
            "self_leave": current_user.id == user_id,
        },
    )
    db.commit()
    return None


__all__ = ["router", "ROLE_RANK"]
