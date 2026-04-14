from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session
import hashlib
import uuid
import os
import json

from dotenv import load_dotenv
from openai import OpenAI

from backend.models import User, Board, SessionLocal, create_tables, get_db, DEFAULT_BOARD_DATA

load_dotenv()

ai_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY", ""),
)
AI_MODEL = "openai/gpt-oss-120b"

app = FastAPI()


def seed_default_user():
    """Create the default MVP user if it doesn't exist"""
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "user").first()
        if not existing:
            user = User(
                id=str(uuid.uuid4()),
                username="user",
                password_hash=hash_password("password"),
            )
            db.add(user)
            db.commit()
    finally:
        db.close()

# Initialize database on startup
@app.on_event("startup")
def startup_event():
    create_tables()
    seed_default_user()

# Health checks and diagnostics
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/hello")
def hello():
    return {"message": "Hello world"}

# Authentication
security = HTTPBasic()

def authenticate_user(credentials: HTTPBasicCredentials = Depends(security), db: Session = Depends(get_db)):
    """Authenticate user with basic auth"""
    user = db.query(User).filter(User.username == credentials.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )

    # Simple password check (MVP - not secure)
    if user.password_hash != hash_password(credentials.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )

    return user

def hash_password(password: str) -> str:
    """Simple password hashing (MVP - use bcrypt in production)"""
    return hashlib.sha256(password.encode()).hexdigest()

# API Endpoints
@app.post("/api/auth/login")
def login(credentials: HTTPBasicCredentials = Depends(security), db: Session = Depends(get_db)):
    """Login endpoint - returns user info if valid"""
    user = authenticate_user(credentials, db)
    return {
        "id": user.id,
        "username": user.username,
        "message": "Login successful"
    }

@app.get("/api/boards/{user_id}")
def get_board(user_id: str, db: Session = Depends(get_db)):
    """Get user's kanban board"""
    board = db.query(Board).filter(Board.user_id == user_id).first()
    if not board:
        # Create default board for user if it doesn't exist
        board = Board(
            id=str(uuid.uuid4()),
            user_id=user_id,
            data=json.dumps(DEFAULT_BOARD_DATA)
        )
        db.add(board)
        db.commit()
        db.refresh(board)

    return json.loads(board.data)

@app.put("/api/boards/{user_id}")
def update_board(user_id: str, board_data: dict, db: Session = Depends(get_db)):
    """Update user's kanban board"""
    board = db.query(Board).filter(Board.user_id == user_id).first()
    if not board:
        # Create board if it doesn't exist
        board = Board(
            id=str(uuid.uuid4()),
            user_id=user_id,
            data=json.dumps(board_data)
        )
        db.add(board)
    else:
        board.data = json.dumps(board_data)

    db.commit()
    return {"message": "Board updated successfully"}

# AI endpoints
@app.post("/api/ai/test")
def ai_test():
    """Test AI connectivity with a simple prompt"""
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


AI_SYSTEM_PROMPT = """\
You are a Kanban board assistant. Reply in the user's language.
Respond with JSON: {"response_text":"...","actions":[]}

If the user wants to change the board, add actions. Action types:
- {"action":"add_card","column_id":"column-1","title":"...","details":"..."}
- {"action":"move_card","card_id":"card-x","to_column_id":"column-2"}
- {"action":"edit_card","card_id":"card-x","title":"...","details":"..."}
- {"action":"delete_card","card_id":"card-x"}

If no board changes needed, use empty actions: []
Keep response_text short.
"""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    user_id: str
    question: str
    kanban: dict
    history: list[ChatMessage] = []


@app.post("/api/ai/chat")
def ai_chat(req: ChatRequest, db: Session = Depends(get_db)):
    messages = [{"role": "system", "content": AI_SYSTEM_PROMPT}]

    for msg in req.history:
        messages.append({"role": msg.role, "content": msg.content})

    board_context = json.dumps(req.kanban, ensure_ascii=False)
    user_message = f"Current board state:\n```json\n{board_context}\n```\n\nUser request: {req.question}"
    messages.append({"role": "user", "content": user_message})

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

    # Apply actions to the current board
    board_data = dict(req.kanban)
    columns = board_data.get("columns", [])
    cards = board_data.get("cards", {})
    changed = False

    for act in actions:
        action = act.get("action")
        if action == "add_card":
            card_id = f"card-{uuid.uuid4().hex[:6]}"
            cards[card_id] = {
                "id": card_id,
                "title": act.get("title", "Untitled"),
                "details": act.get("details", ""),
            }
            col_id = act.get("column_id")
            for col in columns:
                if col["id"] == col_id:
                    col["cardIds"].append(card_id)
                    break
            changed = True

        elif action == "move_card":
            card_id = act.get("card_id")
            to_col = act.get("to_column_id")
            # Remove from current column
            for col in columns:
                if card_id in col["cardIds"]:
                    col["cardIds"].remove(card_id)
                    break
            # Add to target column
            for col in columns:
                if col["id"] == to_col:
                    col["cardIds"].append(card_id)
                    break
            changed = True

        elif action == "edit_card":
            card_id = act.get("card_id")
            if card_id in cards:
                if "title" in act:
                    cards[card_id]["title"] = act["title"]
                if "details" in act:
                    cards[card_id]["details"] = act["details"]
                changed = True

        elif action == "delete_card":
            card_id = act.get("card_id")
            cards.pop(card_id, None)
            for col in columns:
                if card_id in col["cardIds"]:
                    col["cardIds"].remove(card_id)
                    break
            changed = True

    board_update = None
    if changed:
        board_update = {"columns": columns, "cards": cards}
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


# Serve built frontend static export if present
frontend_out_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")

if os.path.isdir(frontend_out_dir):
    app.mount("/", StaticFiles(directory=frontend_out_dir, html=True), name="frontend")
else:
    @app.get("/", response_class=HTMLResponse)
    def root():
        return """<!doctype html>
<html lang='en'>
  <head>
    <meta charset='utf-8'>
    <title>Kanban Studio Backend</title>
  </head>
  <body>
    <h1>Kanban Studio Backend</h1>
    <p>Status: running</p>
    <p>API endpoints: /health, /hello, /api/auth/login, /api/boards/{user_id}</p>
  </body>
</html>"""
