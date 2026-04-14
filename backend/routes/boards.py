import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.auth import authenticate_user
from backend.models import User, Board, get_db, DEFAULT_BOARD_DATA
from backend.schemas import BoardDataModel

router = APIRouter(prefix="/api/boards")


@router.get("/{user_id}")
def get_board(
    user_id: str,
    current_user: User = Depends(authenticate_user),
    db: Session = Depends(get_db),
):
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    board = db.query(Board).filter(Board.user_id == user_id).first()
    if not board:
        board = Board(
            id=str(uuid.uuid4()),
            user_id=user_id,
            data=json.dumps(DEFAULT_BOARD_DATA),
        )
        db.add(board)
        db.commit()
        db.refresh(board)

    return json.loads(board.data)


@router.put("/{user_id}")
def update_board(
    user_id: str,
    board_data: BoardDataModel,
    current_user: User = Depends(authenticate_user),
    db: Session = Depends(get_db),
):
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    data_json = board_data.model_dump()
    board = db.query(Board).filter(Board.user_id == user_id).first()
    if not board:
        board = Board(
            id=str(uuid.uuid4()),
            user_id=user_id,
            data=json.dumps(data_json),
        )
        db.add(board)
    else:
        board.data = json.dumps(data_json)

    db.commit()
    return {"message": "Board updated successfully"}
