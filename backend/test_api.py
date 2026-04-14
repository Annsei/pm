import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import json

from main import app
from models import Base, get_db, DEFAULT_BOARD_DATA

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
    # Create tables
    Base.metadata.create_all(bind=engine)

    # Create test user
    db = TestingSessionLocal()
    from models import User
    test_user = User(
        id="test-user-id",
        username="user",
        password_hash="5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"  # sha256 of "password"
    )
    db.add(test_user)
    db.commit()
    db.close()

    yield

    # Cleanup
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
    response = client.get("/api/boards/test-user-id")
    assert response.status_code == 200
    data = response.json()
    assert "columns" in data
    assert "cards" in data
    assert len(data["columns"]) == 5  # Default 5 columns

def test_update_board(test_db):
    # First get the board to ensure it exists
    client.get("/api/boards/test-user-id")

    # Update with new data
    new_board_data = {
        "columns": [
            {"id": "column-1", "title": "Updated To Do", "cardIds": []},
            {"id": "column-2", "title": "In Progress", "cardIds": []},
        ],
        "cards": {}
    }

    response = client.put(
        "/api/boards/test-user-id",
        json=new_board_data
    )
    assert response.status_code == 200
    assert response.json() == {"message": "Board updated successfully"}

    # Verify the update
    response = client.get("/api/boards/test-user-id")
    assert response.status_code == 200
    data = response.json()
    assert data["columns"][0]["title"] == "Updated To Do"