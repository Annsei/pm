import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import json

from backend.main import app
from backend.models import Base, get_db, DEFAULT_BOARD_DATA

# Test database setup
TEST_DATABASE_URL = "sqlite:///./test_kanban.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="function")
def test_db():
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    from backend.models import User
    test_user = User(
        id="test-user-id",
        username="user",
        password_hash="5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"  # sha256 of "password"
    )
    db.add(test_user)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_hello_endpoint():
    response = client.get("/hello")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello world"}

def test_login_success(test_db):
    response = client.post(
        "/api/auth/login",
        auth=("user", "password")
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "user"
    assert data["id"] == "test-user-id"

def test_login_invalid_credentials(test_db):
    response = client.post(
        "/api/auth/login",
        auth=("user", "wrongpassword")
    )
    assert response.status_code == 401

def test_login_nonexistent_user(test_db):
    response = client.post(
        "/api/auth/login",
        auth=("nonexistent", "password")
    )
    assert response.status_code == 401

def test_get_board_creates_default(test_db):
    response = client.get("/api/boards/test-user-id", auth=("user", "password"))
    assert response.status_code == 200
    data = response.json()
    assert "columns" in data
    assert "cards" in data
    assert len(data["columns"]) == 5

def test_get_board_forbidden_for_other_user(test_db):
    response = client.get("/api/boards/other-user-id", auth=("user", "password"))
    assert response.status_code == 403

def test_get_board_requires_auth(test_db):
    response = client.get("/api/boards/test-user-id")
    assert response.status_code == 401

def test_update_board(test_db):
    client.get("/api/boards/test-user-id", auth=("user", "password"))

    new_board_data = {
        "columns": [
            {"id": "column-1", "title": "Updated To Do", "cardIds": []},
            {"id": "column-2", "title": "In Progress", "cardIds": []},
        ],
        "cards": {}
    }

    response = client.put(
        "/api/boards/test-user-id",
        json=new_board_data,
        auth=("user", "password")
    )
    assert response.status_code == 200
    assert response.json() == {"message": "Board updated successfully"}

    response = client.get("/api/boards/test-user-id", auth=("user", "password"))
    assert response.status_code == 200
    data = response.json()
    assert data["columns"][0]["title"] == "Updated To Do"

def test_update_board_validation(test_db):
    # Missing required fields
    response = client.put(
        "/api/boards/test-user-id",
        json={"bad": "data"},
        auth=("user", "password")
    )
    assert response.status_code == 422

def test_update_board_requires_auth(test_db):
    response = client.put(
        "/api/boards/test-user-id",
        json={"columns": [], "cards": {}}
    )
    assert response.status_code == 401

# AI endpoint tests

@patch("backend.routes.ai.ai_client")
def test_ai_chat_no_actions(mock_ai, test_db):
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "response_text": "Your board has 5 columns.",
        "actions": []
    })
    mock_ai.chat.completions.create.return_value = mock_response

    response = client.post("/api/ai/chat", json={
        "user_id": "test-user-id",
        "question": "What columns do I have?",
        "kanban": DEFAULT_BOARD_DATA,
        "history": []
    }, auth=("user", "password"))

    assert response.status_code == 200
    data = response.json()
    assert data["response_text"] == "Your board has 5 columns."
    assert data["board_update"] is None

@patch("backend.routes.ai.ai_client")
def test_ai_chat_add_card(mock_ai, test_db):
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "response_text": "Card created.",
        "actions": [{"action": "add_card", "column_id": "column-1", "title": "New task", "details": "Details"}]
    })
    mock_ai.chat.completions.create.return_value = mock_response

    response = client.post("/api/ai/chat", json={
        "user_id": "test-user-id",
        "question": "Add a card",
        "kanban": DEFAULT_BOARD_DATA,
        "history": []
    }, auth=("user", "password"))

    assert response.status_code == 200
    data = response.json()
    assert data["board_update"] is not None
    assert len(data["board_update"]["columns"][0]["cardIds"]) == 1
    card_id = data["board_update"]["columns"][0]["cardIds"][0]
    assert data["board_update"]["cards"][card_id]["title"] == "New task"

@patch("backend.routes.ai.ai_client")
def test_ai_chat_invalid_column(mock_ai, test_db):
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "response_text": "Done.",
        "actions": [{"action": "add_card", "column_id": "nonexistent", "title": "Bad", "details": ""}]
    })
    mock_ai.chat.completions.create.return_value = mock_response

    response = client.post("/api/ai/chat", json={
        "user_id": "test-user-id",
        "question": "Add a card",
        "kanban": DEFAULT_BOARD_DATA,
        "history": []
    }, auth=("user", "password"))

    assert response.status_code == 200
    data = response.json()
    assert data["board_update"] is None  # Invalid column, no changes

@patch("backend.routes.ai.ai_client")
def test_ai_chat_requires_auth(mock_ai, test_db):
    response = client.post("/api/ai/chat", json={
        "user_id": "test-user-id",
        "question": "Hello",
        "kanban": DEFAULT_BOARD_DATA,
        "history": []
    })
    assert response.status_code == 401

@patch("backend.routes.ai.ai_client")
def test_ai_chat_forbidden_for_other_user(mock_ai, test_db):
    response = client.post("/api/ai/chat", json={
        "user_id": "other-user-id",
        "question": "Hello",
        "kanban": DEFAULT_BOARD_DATA,
        "history": []
    }, auth=("user", "password"))
    assert response.status_code == 403
