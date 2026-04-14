import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.ai import client as ai_client, MODEL as AI_MODEL, SYSTEM_PROMPT, apply_actions
from backend.auth import authenticate_user
from backend.models import User, Board, get_db
from backend.schemas import ChatRequest

router = APIRouter(prefix="/api/ai")


@router.post("/test")
def ai_test(current_user: User = Depends(authenticate_user)):
    try:
        response = ai_client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "user", "content": "What is 2+2? Reply with just the number."}],
        )
        return {
            "response": response.choices[0].message.content,
            "model": response.model,
            "status": "ok",
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/chat")
def ai_chat(
    req: ChatRequest,
    current_user: User = Depends(authenticate_user),
    db: Session = Depends(get_db),
):
    if req.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in req.history:
        messages.append({"role": msg.role, "content": msg.content})

    board_context = json.dumps(req.kanban, ensure_ascii=False)
    messages.append({
        "role": "user",
        "content": f"Current board state:\n```json\n{board_context}\n```\n\nUser request: {req.question}",
    })

    try:
        response = ai_client.chat.completions.create(
            model=AI_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"response_text": raw, "board_update": None}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    response_text = parsed.get("response_text", "")
    actions = parsed.get("actions", [])

    board_update = apply_actions(actions, dict(req.kanban))

    if board_update:
        board = db.query(Board).filter(Board.user_id == req.user_id).first()
        if board:
            board.data = json.dumps(board_update)
        else:
            board = Board(
                id=str(uuid.uuid4()),
                user_id=req.user_id,
                data=json.dumps(board_update),
            )
            db.add(board)
        db.commit()

    return {"response_text": response_text, "board_update": board_update}
