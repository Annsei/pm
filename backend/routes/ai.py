import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from backend.activity import diff_board_data, record_activity
from backend.ai import client as ai_client, MODEL as AI_MODEL, SYSTEM_PROMPT, apply_actions
from backend.auth import get_current_user
from backend.models import User, get_db
from backend.permissions import get_board_with_role, require_role
from backend.schemas import ChatRequest

router = APIRouter(prefix="/api/ai")


@router.post("/test")
def ai_test(current_user: User = Depends(get_current_user)):
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
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
):
    board, role = get_board_with_role(db, req.board_id, current_user)
    require_role(role, "editor")

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
        try:
            old_data = json.loads(board.data)
        except (ValueError, TypeError):
            old_data = {"columns": [], "cards": {}}
        board.data = json.dumps(board_update)
        for event in diff_board_data(old_data, board_update):
            record_activity(
                db,
                board_id=board.id,
                user_id=current_user.id,
                action=event.pop("action"),
                meta={**event, "source": "ai"},
            )
        db.commit()

    return {"response_text": response_text, "board_update": board_update}
