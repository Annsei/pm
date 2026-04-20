import json
import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Force an isolated SQLite DB before backend modules resolve DATABASE_URL.
_TMP_DB = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_TMP_DB.close()
os.environ["KANBAN_DATABASE_URL"] = f"sqlite:///{_TMP_DB.name}"

from backend.activity import diff_board_data  # noqa: E402
from backend.main import app  # noqa: E402
from backend.models import Base, DEFAULT_BOARD_DATA, get_db  # noqa: E402
from sqlalchemy import event  # noqa: E402

TEST_DATABASE_URL = f"sqlite:///{_TMP_DB.name}"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _enable_test_sqlite_fk(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


# Helpers ------------------------------------------------------------------


def register(username="alice", password="password123", email=None, display_name=None):
    body = {"username": username, "password": password}
    if email:
        body["email"] = email
    if display_name:
        body["display_name"] = display_name
    return client.post("/api/auth/register", json=body)


def register_and_token(**kwargs) -> tuple[str, dict]:
    res = register(**kwargs)
    assert res.status_code == 201, res.text
    data = res.json()
    return data["token"], data["user"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_board(token: str, name="Board", **overrides) -> dict:
    body = {"name": name, **overrides}
    res = client.post("/api/boards", json=body, headers=auth(token))
    assert res.status_code == 201, res.text
    return res.json()


# Health ------------------------------------------------------------------


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_hello_endpoint():
    response = client.get("/hello")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello world"}


# Auth ------------------------------------------------------------------


def test_register_creates_user_and_returns_token():
    res = register(username="alice", password="password123", email="a@example.com")
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["username"] == "alice"
    assert data["user"]["email"] == "a@example.com"
    assert data["token"]


def test_register_rejects_duplicate_username():
    register(username="alice")
    res = register(username="alice", password="other123")
    assert res.status_code == 409


def test_register_rejects_duplicate_email():
    register(username="alice", email="a@example.com")
    res = register(username="bob", email="a@example.com")
    assert res.status_code == 409


def test_register_validates_username():
    res = register(username="ab")  # too short
    assert res.status_code == 422


def test_register_validates_password_length():
    res = client.post("/api/auth/register", json={"username": "alice", "password": "123"})
    assert res.status_code == 422


def test_login_success():
    register(username="alice", password="password123")
    res = client.post("/api/auth/login", json={"username": "alice", "password": "password123"})
    assert res.status_code == 200
    assert res.json()["token"]


def test_login_invalid_password():
    register(username="alice", password="password123")
    res = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    assert res.status_code == 401


def test_login_unknown_user():
    res = client.post("/api/auth/login", json={"username": "ghost", "password": "password123"})
    assert res.status_code == 401


def test_me_returns_current_user():
    token, user = register_and_token()
    res = client.get("/api/auth/me", headers=auth(token))
    assert res.status_code == 200
    assert res.json()["id"] == user["id"]


def test_me_requires_token():
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_me_rejects_invalid_token():
    res = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid-token"})
    assert res.status_code == 401


def test_logout_invalidates_token():
    token, _ = register_and_token()
    assert client.post("/api/auth/logout", headers=auth(token)).status_code == 200
    assert client.get("/api/auth/me", headers=auth(token)).status_code == 401


# Boards ------------------------------------------------------------------


def test_list_boards_seeds_default_on_first_call():
    token, _ = register_and_token()
    res = client.get("/api/boards", headers=auth(token))
    assert res.status_code == 200
    boards = res.json()
    assert len(boards) == 1
    assert boards[0]["column_count"] == 5
    assert boards[0]["card_count"] == 0


def test_create_board_and_list():
    token, _ = register_and_token()
    # First call seeds a default board; create two more.
    client.get("/api/boards", headers=auth(token))
    create_board(token, name="Work", color="#ff0000", description="daily work")
    create_board(token, name="Personal")
    res = client.get("/api/boards", headers=auth(token))
    assert res.status_code == 200
    boards = res.json()
    names = [b["name"] for b in boards]
    assert names == ["My First Board", "Work", "Personal"]


def test_get_board_data_returns_default_layout():
    token, _ = register_and_token()
    board = create_board(token, name="Solo")
    res = client.get(f"/api/boards/{board['id']}", headers=auth(token))
    assert res.status_code == 200
    data = res.json()
    assert len(data["columns"]) == 5
    assert data["cards"] == {}


def test_update_board_data_persists():
    token, _ = register_and_token()
    board = create_board(token)
    new_data = {
        "columns": [
            {"id": "column-1", "title": "Renamed", "cardIds": ["card-1"]},
        ],
        "cards": {"card-1": {"id": "card-1", "title": "Hi", "details": "there"}},
    }
    res = client.put(f"/api/boards/{board['id']}", json=new_data, headers=auth(token))
    assert res.status_code == 200
    fetched = client.get(f"/api/boards/{board['id']}", headers=auth(token)).json()
    assert fetched["columns"][0]["title"] == "Renamed"
    assert fetched["cards"]["card-1"]["title"] == "Hi"


def test_update_board_validates_payload():
    token, _ = register_and_token()
    board = create_board(token)
    res = client.put(f"/api/boards/{board['id']}", json={"bad": "data"}, headers=auth(token))
    assert res.status_code == 422


def test_patch_board_meta():
    token, _ = register_and_token()
    board = create_board(token)
    res = client.patch(
        f"/api/boards/{board['id']}",
        json={"name": "Renamed", "color": "#000000", "is_archived": True},
        headers=auth(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Renamed"
    assert data["color"] == "#000000"
    assert data["is_archived"] is True

    # Archived boards excluded by default.
    listed = client.get("/api/boards", headers=auth(token)).json()
    assert all(b["id"] != board["id"] for b in listed)
    all_listed = client.get(
        "/api/boards", params={"include_archived": "true"}, headers=auth(token)
    ).json()
    assert any(b["id"] == board["id"] for b in all_listed)


def test_delete_board():
    token, _ = register_and_token()
    board = create_board(token)
    res = client.delete(f"/api/boards/{board['id']}", headers=auth(token))
    assert res.status_code == 204
    missing = client.get(f"/api/boards/{board['id']}", headers=auth(token))
    assert missing.status_code == 404


def test_board_isolation_between_users():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    alice_board = create_board(alice_token, name="Alice Board")

    # Bob sees only his own (seeded) board.
    bob_boards = client.get("/api/boards", headers=auth(bob_token)).json()
    assert all(b["id"] != alice_board["id"] for b in bob_boards)

    # Non-collaborators receive 404 (existence hidden).
    assert client.get(f"/api/boards/{alice_board['id']}", headers=auth(bob_token)).status_code == 404
    assert (
        client.put(
            f"/api/boards/{alice_board['id']}",
            json={"columns": [], "cards": {}},
            headers=auth(bob_token),
        ).status_code
        == 404
    )
    assert client.delete(f"/api/boards/{alice_board['id']}", headers=auth(bob_token)).status_code == 404


def test_boards_require_auth():
    assert client.get("/api/boards").status_code == 401
    assert client.post("/api/boards", json={"name": "x"}).status_code == 401
    assert client.get("/api/boards/anything").status_code == 401


# AI ------------------------------------------------------------------


@patch("backend.routes.ai.ai_client")
def test_ai_chat_no_actions(mock_ai):
    token, _ = register_and_token()
    board = create_board(token)

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps(
        {"response_text": "Your board has 5 columns.", "actions": []}
    )
    mock_ai.chat.completions.create.return_value = mock_response

    res = client.post(
        "/api/ai/chat",
        json={
            "board_id": board["id"],
            "question": "What columns do I have?",
            "kanban": DEFAULT_BOARD_DATA,
            "history": [],
        },
        headers=auth(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["response_text"] == "Your board has 5 columns."
    assert data["board_update"] is None


@patch("backend.routes.ai.ai_client")
def test_ai_chat_add_card(mock_ai):
    token, _ = register_and_token()
    board = create_board(token)

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps(
        {
            "response_text": "Card created.",
            "actions": [
                {
                    "action": "add_card",
                    "column_id": "column-1",
                    "title": "New task",
                    "details": "Details",
                }
            ],
        }
    )
    mock_ai.chat.completions.create.return_value = mock_response

    res = client.post(
        "/api/ai/chat",
        json={
            "board_id": board["id"],
            "question": "Add a card",
            "kanban": DEFAULT_BOARD_DATA,
            "history": [],
        },
        headers=auth(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["board_update"] is not None
    first_col = data["board_update"]["columns"][0]
    assert len(first_col["cardIds"]) == 1


@patch("backend.routes.ai.ai_client")
def test_ai_chat_forbidden_for_other_user(mock_ai):
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    alice_board = create_board(alice_token, name="Alice")

    res = client.post(
        "/api/ai/chat",
        json={
            "board_id": alice_board["id"],
            "question": "Hello",
            "kanban": DEFAULT_BOARD_DATA,
            "history": [],
        },
        headers=auth(bob_token),
    )
    # Non-collaborators see 404 (existence hidden).
    assert res.status_code == 404


def test_ai_chat_requires_auth():
    res = client.post(
        "/api/ai/chat",
        json={
            "board_id": "anything",
            "question": "Hello",
            "kanban": DEFAULT_BOARD_DATA,
            "history": [],
        },
    )
    assert res.status_code == 401


# Card field validation / AI actions -------------------------------------


def test_put_board_accepts_card_metadata():
    token, _ = register_and_token()
    board = create_board(token)
    payload = {
        "columns": [{"id": "column-1", "title": "Todo", "cardIds": ["c1"]}],
        "cards": {
            "c1": {
                "id": "c1",
                "title": "Fix bug",
                "details": "",
                "labels": ["bug", "backend"],
                "priority": "high",
                "due_date": "2026-05-10",
            }
        },
    }
    res = client.put(f"/api/boards/{board['id']}", json=payload, headers=auth(token))
    assert res.status_code == 200
    fetched = client.get(f"/api/boards/{board['id']}", headers=auth(token)).json()
    assert fetched["cards"]["c1"]["labels"] == ["bug", "backend"]
    assert fetched["cards"]["c1"]["priority"] == "high"
    assert fetched["cards"]["c1"]["due_date"] == "2026-05-10"


def test_put_board_rejects_invalid_priority():
    token, _ = register_and_token()
    board = create_board(token)
    payload = {
        "columns": [{"id": "column-1", "title": "Todo", "cardIds": []}],
        "cards": {
            "c1": {"id": "c1", "title": "T", "details": "", "priority": "blocker"}
        },
    }
    res = client.put(f"/api/boards/{board['id']}", json=payload, headers=auth(token))
    assert res.status_code == 422


@patch("backend.routes.ai.ai_client")
def test_ai_add_card_includes_metadata(mock_ai):
    token, _ = register_and_token()
    board = create_board(token)

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps(
        {
            "response_text": "Added.",
            "actions": [
                {
                    "action": "add_card",
                    "column_id": "column-1",
                    "title": "Audit",
                    "labels": ["security", "q2"],
                    "priority": "urgent",
                    "due_date": "2026-05-01",
                }
            ],
        }
    )
    mock_ai.chat.completions.create.return_value = mock_response

    res = client.post(
        "/api/ai/chat",
        json={
            "board_id": board["id"],
            "question": "Add audit card",
            "kanban": DEFAULT_BOARD_DATA,
            "history": [],
        },
        headers=auth(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["board_update"] is not None
    new_cards = data["board_update"]["cards"]
    card = next(iter(new_cards.values()))
    assert card["labels"] == ["security", "q2"]
    assert card["priority"] == "urgent"
    assert card["due_date"] == "2026-05-01"


# Activity log --------------------------------------------------------------


def _activity(token: str, board_id: str, **params):
    res = client.get(
        f"/api/boards/{board_id}/activity", params=params, headers=auth(token)
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_activity_records_board_create():
    token, _ = register_and_token()
    board = create_board(token, name="Pinned")
    entries = _activity(token, board["id"])
    assert len(entries) == 1
    assert entries[0]["action"] == "board_create"
    assert entries[0]["meta"]["name"] == "Pinned"
    assert entries[0]["username"]


def test_activity_records_seed_on_first_list():
    token, _ = register_and_token()
    boards = client.get("/api/boards", headers=auth(token)).json()
    entries = _activity(token, boards[0]["id"])
    assert len(entries) == 1
    assert entries[0]["action"] == "board_create"
    assert entries[0]["meta"].get("seeded") is True


def test_activity_captures_card_add_move_edit_delete():
    token, _ = register_and_token()
    board = create_board(token)
    # 1. Add a card in column-1.
    payload = {
        "columns": [
            {"id": "column-1", "title": "Todo", "cardIds": ["c1"]},
            {"id": "column-2", "title": "Doing", "cardIds": []},
        ],
        "cards": {"c1": {"id": "c1", "title": "Write spec", "details": ""}},
    }
    client.put(f"/api/boards/{board['id']}", json=payload, headers=auth(token))

    # 2. Move c1 to column-2 and edit its priority.
    payload2 = {
        "columns": [
            {"id": "column-1", "title": "Todo", "cardIds": []},
            {"id": "column-2", "title": "Doing", "cardIds": ["c1"]},
        ],
        "cards": {
            "c1": {
                "id": "c1",
                "title": "Write spec",
                "details": "",
                "priority": "high",
            }
        },
    }
    client.put(f"/api/boards/{board['id']}", json=payload2, headers=auth(token))

    # 3. Delete the card.
    payload3 = {
        "columns": [
            {"id": "column-1", "title": "Todo", "cardIds": []},
            {"id": "column-2", "title": "In Progress", "cardIds": []},
        ],
        "cards": {},
    }
    client.put(f"/api/boards/{board['id']}", json=payload3, headers=auth(token))

    entries = _activity(token, board["id"])
    actions = [e["action"] for e in entries]
    # Newest first: the last PUT produced card_delete + column_rename events.
    assert set(actions[:2]) == {"card_delete", "column_rename"}
    assert "card_move" in actions
    assert "card_edit" in actions
    assert "card_add" in actions
    assert actions[-1] == "board_create"


def test_activity_for_meta_rename_and_archive():
    token, _ = register_and_token()
    board = create_board(token, name="Old name")
    client.patch(
        f"/api/boards/{board['id']}",
        json={"name": "New name"},
        headers=auth(token),
    )
    client.patch(
        f"/api/boards/{board['id']}",
        json={"is_archived": True},
        headers=auth(token),
    )
    entries = _activity(token, board["id"])
    actions = [e["action"] for e in entries]
    assert actions[0] == "board_archive"
    assert "board_meta_update" in actions
    meta_entry = next(e for e in entries if e["action"] == "board_meta_update")
    assert meta_entry["meta"]["changes"]["name"] == {"from": "Old name", "to": "New name"}


def test_activity_no_op_update_does_not_record():
    token, _ = register_and_token()
    board = create_board(token)
    data = client.get(f"/api/boards/{board['id']}", headers=auth(token)).json()
    client.put(f"/api/boards/{board['id']}", json=data, headers=auth(token))
    entries = _activity(token, board["id"])
    # Only the board_create event should exist — no diff events.
    assert [e["action"] for e in entries] == ["board_create"]


def test_activity_requires_ownership():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    alice_board = create_board(alice_token, name="Alice")
    res = client.get(
        f"/api/boards/{alice_board['id']}/activity", headers=auth(bob_token)
    )
    # Non-collaborators see 404 (existence hidden).
    assert res.status_code == 404


def test_activity_kinds_filter_narrows_results():
    token, _ = register_and_token()
    board = create_board(token, name="Filter")
    client.patch(
        f"/api/boards/{board['id']}",
        json={"name": "Renamed"},
        headers=auth(token),
    )
    client.put(
        f"/api/boards/{board['id']}",
        json={
            "columns": [{"id": "column-1", "title": "Todo", "cardIds": ["c1"]}],
            "cards": {"c1": {"id": "c1", "title": "A", "details": ""}},
        },
        headers=auth(token),
    )

    all_events = client.get(
        f"/api/boards/{board['id']}/activity", headers=auth(token)
    ).json()
    assert {e["action"] for e in all_events} >= {
        "board_create",
        "board_meta_update",
        "card_add",
    }

    filtered = client.get(
        f"/api/boards/{board['id']}/activity",
        params={"kinds": "card_add,board_meta_update"},
        headers=auth(token),
    ).json()
    assert {e["action"] for e in filtered} == {"card_add", "board_meta_update"}

    empty = client.get(
        f"/api/boards/{board['id']}/activity",
        params={"kinds": "nope"},
        headers=auth(token),
    ).json()
    assert empty == []


def test_activity_requires_auth():
    res = client.get("/api/boards/any/activity")
    assert res.status_code == 401


def test_activity_limit_and_before_params():
    token, _ = register_and_token()
    board = create_board(token)
    # Generate several events by toggling name.
    for i in range(3):
        client.patch(
            f"/api/boards/{board['id']}",
            json={"name": f"N{i}"},
            headers=auth(token),
        )
    entries = _activity(token, board["id"], limit=2)
    assert len(entries) == 2
    # `before` filters out newer entries.
    oldest_time = entries[-1]["created_at"]
    older = _activity(token, board["id"], before=oldest_time)
    assert all(e["created_at"] < oldest_time for e in older)


@patch("backend.routes.ai.ai_client")
def test_ai_chat_records_activity_with_source_ai(mock_ai):
    token, _ = register_and_token()
    board = create_board(token)

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps(
        {
            "response_text": "Added.",
            "actions": [
                {"action": "add_card", "column_id": "column-1", "title": "From AI"}
            ],
        }
    )
    mock_ai.chat.completions.create.return_value = mock_response

    client.post(
        "/api/ai/chat",
        json={
            "board_id": board["id"],
            "question": "Add one",
            "kanban": DEFAULT_BOARD_DATA,
            "history": [],
        },
        headers=auth(token),
    )
    entries = _activity(token, board["id"])
    card_add = next(e for e in entries if e["action"] == "card_add")
    assert card_add["meta"]["source"] == "ai"
    assert card_add["meta"]["title"] == "From AI"


# diff_board_data unit tests -----------------------------------------------


def test_diff_detects_card_additions_and_deletions():
    old = {
        "columns": [{"id": "c1", "title": "A", "cardIds": ["x"]}],
        "cards": {"x": {"id": "x", "title": "X"}},
    }
    new = {
        "columns": [{"id": "c1", "title": "A", "cardIds": ["y"]}],
        "cards": {"y": {"id": "y", "title": "Y"}},
    }
    events = diff_board_data(old, new)
    kinds = {e["action"] for e in events}
    assert "card_add" in kinds
    assert "card_delete" in kinds


def test_diff_detects_card_move_and_edit():
    old = {
        "columns": [
            {"id": "c1", "title": "A", "cardIds": ["x"]},
            {"id": "c2", "title": "B", "cardIds": []},
        ],
        "cards": {"x": {"id": "x", "title": "X", "priority": None}},
    }
    new = {
        "columns": [
            {"id": "c1", "title": "A", "cardIds": []},
            {"id": "c2", "title": "B", "cardIds": ["x"]},
        ],
        "cards": {"x": {"id": "x", "title": "X!", "priority": "high"}},
    }
    events = diff_board_data(old, new)
    kinds = [e["action"] for e in events]
    assert "card_move" in kinds
    edit = next(e for e in events if e["action"] == "card_edit")
    assert set(edit["fields"]) >= {"title", "priority"}


def test_diff_noop_returns_empty():
    state = {
        "columns": [{"id": "c1", "title": "A", "cardIds": ["x"]}],
        "cards": {"x": {"id": "x", "title": "X"}},
    }
    assert diff_board_data(state, state) == []


def test_diff_detects_column_rename():
    old = {"columns": [{"id": "c1", "title": "Todo", "cardIds": []}], "cards": {}}
    new = {"columns": [{"id": "c1", "title": "In Progress", "cardIds": []}], "cards": {}}
    events = diff_board_data(old, new)
    assert any(e["action"] == "column_rename" for e in events)


def test_diff_detects_label_changes():
    old = {
        "columns": [{"id": "c1", "title": "A", "cardIds": ["x"]}],
        "cards": {"x": {"id": "x", "title": "X", "labels": ["a"]}},
    }
    new = {
        "columns": [{"id": "c1", "title": "A", "cardIds": ["x"]}],
        "cards": {"x": {"id": "x", "title": "X", "labels": ["a", "b"]}},
    }
    events = diff_board_data(old, new)
    edit = next(e for e in events if e["action"] == "card_edit")
    assert "labels" in edit["fields"]


# Profile update -----------------------------------------------------------


def test_profile_update_display_name_and_email():
    token, user = register_and_token(email="a@example.com")
    res = client.patch(
        "/api/auth/me",
        json={"display_name": "Alice A", "email": "new@example.com"},
        headers=auth(token),
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["display_name"] == "Alice A"
    assert data["email"] == "new@example.com"


def test_profile_update_rejects_duplicate_email():
    _, _ = register_and_token(username="alice", email="alice@example.com")
    bob_token, _ = register_and_token(username="bob", email="bob@example.com")
    res = client.patch(
        "/api/auth/me",
        json={"email": "alice@example.com"},
        headers=auth(bob_token),
    )
    assert res.status_code == 409


def test_profile_update_password_requires_current_password():
    token, _ = register_and_token(username="alice", password="password123")
    bad = client.patch(
        "/api/auth/me",
        json={"current_password": "wrong", "new_password": "newpass123"},
        headers=auth(token),
    )
    assert bad.status_code == 400
    ok = client.patch(
        "/api/auth/me",
        json={"current_password": "password123", "new_password": "newpass123"},
        headers=auth(token),
    )
    assert ok.status_code == 200
    # Old password no longer works.
    fail = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "password123"},
    )
    assert fail.status_code == 401
    success = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "newpass123"},
    )
    assert success.status_code == 200


def test_profile_update_requires_auth():
    res = client.patch("/api/auth/me", json={"display_name": "X"})
    assert res.status_code == 401


# Collaborators / sharing -------------------------------------------------


def _collab_url(board_id: str, user_id: str | None = None) -> str:
    base = f"/api/boards/{board_id}/collaborators"
    return f"{base}/{user_id}" if user_id else base


def test_invite_collaborator_grants_access_and_appears_in_list():
    alice_token, alice = register_and_token(username="alice")
    bob_token, bob = register_and_token(username="bob")
    board = create_board(alice_token, name="Shared")

    res = client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["username"] == "bob"
    assert body["role"] == "editor"
    assert body["is_owner"] is False

    # Bob now sees the board in his list with role=editor / is_shared=True.
    bob_boards = client.get("/api/boards", headers=auth(bob_token)).json()
    shared = next((b for b in bob_boards if b["id"] == board["id"]), None)
    assert shared is not None
    assert shared["role"] == "editor"
    assert shared["is_shared"] is True
    assert shared["owner_username"] == "alice"

    # Alice's own listing keeps role=owner / is_shared=False.
    alice_boards = client.get("/api/boards", headers=auth(alice_token)).json()
    own = next(b for b in alice_boards if b["id"] == board["id"])
    assert own["role"] == "owner"
    assert own["is_shared"] is False


def test_invite_collaborator_validates_target():
    alice_token, _ = register_and_token(username="alice")
    board = create_board(alice_token, name="Solo")

    # Unknown user -> 404
    res = client.post(
        _collab_url(board["id"]),
        json={"username": "nobody", "role": "viewer"},
        headers=auth(alice_token),
    )
    assert res.status_code == 404

    # Invalid role -> 422
    register(username="bob")
    res = client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "admin"},
        headers=auth(alice_token),
    )
    assert res.status_code == 422

    # Self-invite (owner) -> 400
    res = client.post(
        _collab_url(board["id"]),
        json={"username": "alice", "role": "viewer"},
        headers=auth(alice_token),
    )
    assert res.status_code == 400


def test_invite_collaborator_rejects_duplicates():
    alice_token, _ = register_and_token(username="alice")
    register(username="bob")
    board = create_board(alice_token, name="Shared")
    first = client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "viewer"},
        headers=auth(alice_token),
    )
    assert first.status_code == 201
    dup = client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )
    assert dup.status_code == 409


def test_only_owner_can_invite_collaborators():
    alice_token, _ = register_and_token(username="alice")
    bob_token, bob = register_and_token(username="bob")
    register(username="carol")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )
    # Bob (editor) tries to invite Carol -> 403
    res = client.post(
        _collab_url(board["id"]),
        json={"username": "carol", "role": "viewer"},
        headers=auth(bob_token),
    )
    assert res.status_code == 403


def test_viewer_can_read_but_not_write():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "viewer"},
        headers=auth(alice_token),
    )

    # Viewer can GET data and activity.
    assert client.get(f"/api/boards/{board['id']}", headers=auth(bob_token)).status_code == 200
    assert (
        client.get(f"/api/boards/{board['id']}/activity", headers=auth(bob_token)).status_code
        == 200
    )

    # Viewer cannot PUT data, PATCH meta, or DELETE.
    payload = {"columns": [], "cards": {}}
    assert (
        client.put(f"/api/boards/{board['id']}", json=payload, headers=auth(bob_token)).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/boards/{board['id']}", json={"name": "X"}, headers=auth(bob_token)
        ).status_code
        == 403
    )
    assert client.delete(f"/api/boards/{board['id']}", headers=auth(bob_token)).status_code == 403


def test_editor_can_write_data_but_not_meta_or_delete():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )

    payload = {
        "columns": [{"id": "column-1", "title": "Todo", "cardIds": ["c1"]}],
        "cards": {"c1": {"id": "c1", "title": "by-bob", "details": ""}},
    }
    assert (
        client.put(f"/api/boards/{board['id']}", json=payload, headers=auth(bob_token)).status_code
        == 200
    )
    # Meta and delete still owner-only.
    assert (
        client.patch(
            f"/api/boards/{board['id']}", json={"name": "Renamed"}, headers=auth(bob_token)
        ).status_code
        == 403
    )
    assert client.delete(f"/api/boards/{board['id']}", headers=auth(bob_token)).status_code == 403


def test_collaborator_activity_attribution():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )
    payload = {
        "columns": [{"id": "column-1", "title": "Todo", "cardIds": ["c1"]}],
        "cards": {"c1": {"id": "c1", "title": "Bob's card", "details": ""}},
    }
    client.put(f"/api/boards/{board['id']}", json=payload, headers=auth(bob_token))

    entries = client.get(
        f"/api/boards/{board['id']}/activity", headers=auth(alice_token)
    ).json()
    add_event = next(e for e in entries if e["action"] == "card_add")
    assert add_event["username"] == "bob"
    invite_event = next(e for e in entries if e["action"] == "collaborator_add")
    assert invite_event["meta"]["target_username"] == "bob"


def test_update_collaborator_role_and_history():
    alice_token, _ = register_and_token(username="alice")
    bob_token, bob = register_and_token(username="bob")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "viewer"},
        headers=auth(alice_token),
    )
    # Promote bob to editor.
    res = client.patch(
        _collab_url(board["id"], bob["id"]),
        json={"role": "editor"},
        headers=auth(alice_token),
    )
    assert res.status_code == 200
    assert res.json()["role"] == "editor"
    # Bob can now write.
    payload = {
        "columns": [{"id": "column-1", "title": "Todo", "cardIds": []}],
        "cards": {},
    }
    assert (
        client.put(f"/api/boards/{board['id']}", json=payload, headers=auth(bob_token)).status_code
        == 200
    )
    # Activity log captures role change.
    entries = client.get(
        f"/api/boards/{board['id']}/activity", headers=auth(alice_token)
    ).json()
    role_event = next(e for e in entries if e["action"] == "collaborator_role_change")
    assert role_event["meta"]["from"] == "viewer"
    assert role_event["meta"]["to"] == "editor"


def test_owner_can_remove_collaborator():
    alice_token, _ = register_and_token(username="alice")
    bob_token, bob = register_and_token(username="bob")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )
    res = client.delete(_collab_url(board["id"], bob["id"]), headers=auth(alice_token))
    assert res.status_code == 204
    # Bob loses access.
    assert client.get(f"/api/boards/{board['id']}", headers=auth(bob_token)).status_code == 404


def test_collaborator_can_self_leave():
    alice_token, _ = register_and_token(username="alice")
    bob_token, bob = register_and_token(username="bob")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )
    # Bob removes himself.
    res = client.delete(_collab_url(board["id"], bob["id"]), headers=auth(bob_token))
    assert res.status_code == 204
    # Activity log marks self_leave=True.
    entries = client.get(
        f"/api/boards/{board['id']}/activity", headers=auth(alice_token)
    ).json()
    leave = next(e for e in entries if e["action"] == "collaborator_remove")
    assert leave["meta"]["self_leave"] is True


def test_non_owner_cannot_remove_other_collaborator():
    alice_token, _ = register_and_token(username="alice")
    register(username="bob")
    carol_token, carol = register_and_token(username="carol")
    board = create_board(alice_token, name="Shared")
    bob_entry = client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    ).json()
    client.post(
        _collab_url(board["id"]),
        json={"username": "carol", "role": "editor"},
        headers=auth(alice_token),
    )
    # Carol cannot remove Bob.
    res = client.delete(
        _collab_url(board["id"], bob_entry["user_id"]), headers=auth(carol_token)
    )
    assert res.status_code == 403


def test_remove_owner_via_collaborator_endpoint_blocked():
    alice_token, alice = register_and_token(username="alice")
    board = create_board(alice_token, name="Shared")
    res = client.delete(_collab_url(board["id"], alice["id"]), headers=auth(alice_token))
    assert res.status_code == 400


def test_list_collaborators_includes_owner_first():
    alice_token, alice = register_and_token(username="alice")
    register(username="bob")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "viewer"},
        headers=auth(alice_token),
    )
    res = client.get(_collab_url(board["id"]), headers=auth(alice_token))
    assert res.status_code == 200
    rows = res.json()
    assert rows[0]["is_owner"] is True
    assert rows[0]["username"] == "alice"
    assert rows[0]["role"] == "owner"
    assert rows[1]["username"] == "bob"
    assert rows[1]["role"] == "viewer"


def test_collaborator_routes_require_auth():
    assert client.get("/api/boards/x/collaborators").status_code == 401
    assert (
        client.post(
            "/api/boards/x/collaborators", json={"username": "alice", "role": "viewer"}
        ).status_code
        == 401
    )


def test_non_collaborator_cannot_list_collaborators():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = create_board(alice_token, name="Solo")
    res = client.get(_collab_url(board["id"]), headers=auth(bob_token))
    # Hidden from non-collaborators.
    assert res.status_code == 404


def test_viewer_can_list_collaborators():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "viewer"},
        headers=auth(alice_token),
    )
    res = client.get(_collab_url(board["id"]), headers=auth(bob_token))
    assert res.status_code == 200


@patch("backend.routes.ai.ai_client")
def test_ai_chat_editor_can_write_shared_board(mock_ai):
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps(
        {
            "response_text": "Added.",
            "actions": [{"action": "add_card", "column_id": "column-1", "title": "From Bob"}],
        }
    )
    mock_ai.chat.completions.create.return_value = mock_response

    res = client.post(
        "/api/ai/chat",
        json={
            "board_id": board["id"],
            "question": "Add",
            "kanban": DEFAULT_BOARD_DATA,
            "history": [],
        },
        headers=auth(bob_token),
    )
    assert res.status_code == 200
    assert res.json()["board_update"] is not None


@patch("backend.routes.ai.ai_client")
def test_ai_chat_viewer_blocked_on_shared_board(mock_ai):
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = create_board(alice_token, name="Shared")
    client.post(
        _collab_url(board["id"]),
        json={"username": "bob", "role": "viewer"},
        headers=auth(alice_token),
    )
    res = client.post(
        "/api/ai/chat",
        json={
            "board_id": board["id"],
            "question": "Add",
            "kanban": DEFAULT_BOARD_DATA,
            "history": [],
        },
        headers=auth(bob_token),
    )
    assert res.status_code == 403
    mock_ai.chat.completions.create.assert_not_called()


def test_owned_board_summary_marks_role_owner():
    token, _ = register_and_token()
    board = create_board(token, name="MineOnly")
    boards = client.get("/api/boards", headers=auth(token)).json()
    entry = next(b for b in boards if b["id"] == board["id"])
    assert entry["role"] == "owner"
    assert entry["is_shared"] is False
    assert entry["owner_username"]


@patch("backend.routes.ai.ai_client")
def test_ai_add_card_sanitizes_bad_priority(mock_ai):
    token, _ = register_and_token()
    board = create_board(token)

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps(
        {
            "response_text": "ok",
            "actions": [
                {
                    "action": "add_card",
                    "column_id": "column-1",
                    "title": "X",
                    "priority": "critical",  # not allowed -> sanitized to null
                    "due_date": "not-a-date",
                }
            ],
        }
    )
    mock_ai.chat.completions.create.return_value = mock_response

    res = client.post(
        "/api/ai/chat",
        json={
            "board_id": board["id"],
            "question": "Add",
            "kanban": DEFAULT_BOARD_DATA,
            "history": [],
        },
        headers=auth(token),
    )
    data = res.json()
    card = next(iter(data["board_update"]["cards"].values()))
    assert card["priority"] is None
    assert card["due_date"] is None


# Card comments ------------------------------------------------------------


def _comments_url(board_id: str, card_id: str, comment_id: str | None = None) -> str:
    base = f"/api/boards/{board_id}/cards/{card_id}/comments"
    return f"{base}/{comment_id}" if comment_id else base


def _board_with_card(token: str, card_id: str = "c1", title: str = "My card") -> dict:
    board = create_board(token, name="Commented")
    payload = {
        "columns": [{"id": "column-1", "title": "Todo", "cardIds": [card_id]}],
        "cards": {card_id: {"id": card_id, "title": title, "details": ""}},
    }
    res = client.put(f"/api/boards/{board['id']}", json=payload, headers=auth(token))
    assert res.status_code == 200, res.text
    return board


def test_post_comment_returns_entry_and_lists():
    token, _ = register_and_token()
    board = _board_with_card(token)

    res = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "First note"},
        headers=auth(token),
    )
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["body"] == "First note"
    assert created["username"] == "alice"
    assert created["edited"] is False

    listed = client.get(_comments_url(board["id"], "c1"), headers=auth(token)).json()
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]


def test_post_comment_validates_body():
    token, _ = register_and_token()
    board = _board_with_card(token)

    empty = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": ""},
        headers=auth(token),
    )
    assert empty.status_code == 422

    too_long = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "x" * 5000},
        headers=auth(token),
    )
    assert too_long.status_code == 422


def test_post_comment_unknown_card_returns_404():
    token, _ = register_and_token()
    board = _board_with_card(token)
    res = client.post(
        _comments_url(board["id"], "ghost"),
        json={"body": "hi"},
        headers=auth(token),
    )
    assert res.status_code == 404


def test_comment_requires_board_access():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = _board_with_card(alice_token)

    res = client.get(_comments_url(board["id"], "c1"), headers=auth(bob_token))
    # Non-collaborator should see 404 (hidden existence).
    assert res.status_code == 404

    res = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "sneaky"},
        headers=auth(bob_token),
    )
    assert res.status_code == 404


def test_viewer_can_read_but_not_post_comments():
    alice_token, _ = register_and_token(username="alice")
    _register = register_and_token(username="bob")
    bob_token = _register[0]
    board = _board_with_card(alice_token)

    # Alice invites Bob as viewer.
    client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "bob", "role": "viewer"},
        headers=auth(alice_token),
    )
    # Alice posts a comment.
    client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "for the team"},
        headers=auth(alice_token),
    )

    listed = client.get(
        _comments_url(board["id"], "c1"), headers=auth(bob_token)
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    # Bob (viewer) cannot post.
    blocked = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "no way"},
        headers=auth(bob_token),
    )
    assert blocked.status_code == 403


def test_editor_can_post_and_edit_own_comment():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = _board_with_card(alice_token)
    client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )

    created = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "v1"},
        headers=auth(bob_token),
    ).json()

    edited = client.patch(
        _comments_url(board["id"], "c1", created["id"]),
        json={"body": "v2"},
        headers=auth(bob_token),
    )
    assert edited.status_code == 200
    data = edited.json()
    assert data["body"] == "v2"
    assert data["edited"] is True


def test_non_author_cannot_edit_comment():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = _board_with_card(alice_token)
    client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )
    created = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "alice-note"},
        headers=auth(alice_token),
    ).json()

    forbidden = client.patch(
        _comments_url(board["id"], "c1", created["id"]),
        json={"body": "hijack"},
        headers=auth(bob_token),
    )
    assert forbidden.status_code == 403


def test_author_and_owner_can_delete_comment():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = _board_with_card(alice_token)
    client.post(
        f"/api/boards/{board['id']}/collaborators",
        json={"username": "bob", "role": "editor"},
        headers=auth(alice_token),
    )
    bob_comment = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "bob-note"},
        headers=auth(bob_token),
    ).json()
    alice_comment = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "alice-note"},
        headers=auth(alice_token),
    ).json()

    # Author deletes own.
    del_own = client.delete(
        _comments_url(board["id"], "c1", bob_comment["id"]),
        headers=auth(bob_token),
    )
    assert del_own.status_code == 204

    # Owner deletes another user's — but Bob can't delete Alice's.
    # Re-create Bob's comment for testing owner delete.
    bob_comment2 = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "v2"},
        headers=auth(bob_token),
    ).json()
    forbidden = client.delete(
        _comments_url(board["id"], "c1", alice_comment["id"]),
        headers=auth(bob_token),
    )
    assert forbidden.status_code == 403

    # Owner can delete Bob's comment.
    allowed = client.delete(
        _comments_url(board["id"], "c1", bob_comment2["id"]),
        headers=auth(alice_token),
    )
    assert allowed.status_code == 204


def test_comment_delete_nonexistent_is_404():
    token, _ = register_and_token()
    board = _board_with_card(token)
    res = client.delete(
        _comments_url(board["id"], "c1", "not-a-real-id"),
        headers=auth(token),
    )
    assert res.status_code == 404


def test_comment_cascade_on_board_delete():
    from backend.models import CardComment
    token, _ = register_and_token()
    board = _board_with_card(token)
    client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "temp"},
        headers=auth(token),
    )
    # Delete the board, expect the comment is gone via cascade.
    assert (
        client.delete(f"/api/boards/{board['id']}", headers=auth(token)).status_code
        == 204
    )
    db = TestingSessionLocal()
    try:
        remaining = db.query(CardComment).all()
        assert remaining == []
    finally:
        db.close()


def test_comment_activity_recorded():
    token, _ = register_and_token()
    board = _board_with_card(token)
    created = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "note"},
        headers=auth(token),
    ).json()
    client.patch(
        _comments_url(board["id"], "c1", created["id"]),
        json={"body": "note v2"},
        headers=auth(token),
    )
    client.delete(
        _comments_url(board["id"], "c1", created["id"]),
        headers=auth(token),
    )
    entries = client.get(
        f"/api/boards/{board['id']}/activity", headers=auth(token)
    ).json()
    actions = [e["action"] for e in entries]
    assert "comment_add" in actions
    assert "comment_edit" in actions
    assert "comment_delete" in actions


def test_comment_routes_require_auth():
    # card_id and board_id don't matter — request should 401 before reaching.
    assert client.get("/api/boards/x/cards/y/comments").status_code == 401
    assert client.post("/api/boards/x/cards/y/comments", json={"body": "a"}).status_code == 401
    assert client.patch("/api/boards/x/cards/y/comments/z", json={"body": "a"}).status_code == 401
    assert client.delete("/api/boards/x/cards/y/comments/z").status_code == 401


# Board export / import ----------------------------------------------------


def test_export_returns_board_with_cards_and_comments():
    token, _ = register_and_token()
    board = _board_with_card(token, card_id="c1", title="Fix bug")
    client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "check staging"},
        headers=auth(token),
    )
    res = client.get(f"/api/boards/{board['id']}/export", headers=auth(token))
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["version"] == 1
    assert payload["name"] == "Commented"
    assert payload["data"]["cards"]["c1"]["title"] == "Fix bug"
    assert len(payload["comments"]) == 1
    assert payload["comments"][0]["body"] == "check staging"
    assert payload["comments"][0]["username"] == "alice"


def test_export_hidden_from_non_members():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = _board_with_card(alice_token)
    res = client.get(f"/api/boards/{board['id']}/export", headers=auth(bob_token))
    assert res.status_code == 404


def test_export_requires_auth():
    res = client.get("/api/boards/any/export")
    assert res.status_code == 401


def test_import_creates_new_board_for_current_user():
    alice_token, alice = register_and_token(username="alice")
    board = _board_with_card(alice_token, card_id="c1", title="Launch")
    client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "carry-over"},
        headers=auth(alice_token),
    )
    payload = client.get(
        f"/api/boards/{board['id']}/export", headers=auth(alice_token)
    ).json()

    # Bob imports Alice's exported JSON — resulting board is Bob's, not shared.
    bob_token, bob = register_and_token(username="bob")
    res = client.post("/api/boards/import", json=payload, headers=auth(bob_token))
    assert res.status_code == 201, res.text
    new_board = res.json()
    assert new_board["id"] != board["id"]
    assert new_board["owner_username"] == "bob"
    assert new_board["role"] == "owner"

    # Card and comment came along.
    data = client.get(
        f"/api/boards/{new_board['id']}", headers=auth(bob_token)
    ).json()
    assert "c1" in data["cards"]
    comments = client.get(
        _comments_url(new_board["id"], "c1"), headers=auth(bob_token)
    ).json()
    assert len(comments) == 1
    assert comments[0]["body"] == "carry-over"
    # Activity log records the import source.
    activity = client.get(
        f"/api/boards/{new_board['id']}/activity", headers=auth(bob_token)
    ).json()
    create_event = next(e for e in activity if e["action"] == "board_create")
    assert create_event["meta"].get("source") == "import"


def test_import_rejects_missing_data():
    token, _ = register_and_token()
    # Missing `data` entirely.
    res = client.post(
        "/api/boards/import",
        json={"name": "Bad"},
        headers=auth(token),
    )
    assert res.status_code == 422


def test_import_ignores_orphan_comments():
    token, _ = register_and_token()
    # Comment referencing a card that doesn't exist in data.
    payload = {
        "version": 1,
        "name": "Imported",
        "description": "",
        "color": "#123456",
        "data": {
            "columns": [{"id": "c1", "title": "Todo", "cardIds": ["k1"]}],
            "cards": {"k1": {"id": "k1", "title": "task", "details": ""}},
        },
        "comments": [
            {
                "card_id": "k1",
                "body": "keep",
                "created_at": "2026-04-20T00:00:00",
                "updated_at": "2026-04-20T00:00:00",
            },
            {
                "card_id": "ghost",
                "body": "drop",
                "created_at": "2026-04-20T00:00:00",
                "updated_at": "2026-04-20T00:00:00",
            },
            {
                "card_id": "k1",
                "body": "   ",  # blank after strip — drop
                "created_at": "2026-04-20T00:00:00",
                "updated_at": "2026-04-20T00:00:00",
            },
        ],
    }
    res = client.post("/api/boards/import", json=payload, headers=auth(token))
    assert res.status_code == 201, res.text
    new_board = res.json()
    comments = client.get(
        _comments_url(new_board["id"], "k1"), headers=auth(token)
    ).json()
    assert [c["body"] for c in comments] == ["keep"]


def test_import_requires_auth():
    res = client.post(
        "/api/boards/import",
        json={
            "name": "X",
            "data": {
                "columns": [{"id": "c1", "title": "T", "cardIds": []}],
                "cards": {},
            },
        },
    )
    assert res.status_code == 401


# Mentions & notifications ------------------------------------------------


def _invite(owner_token: str, board_id: str, username: str, role: str = "editor"):
    res = client.post(
        f"/api/boards/{board_id}/collaborators",
        json={"username": username, "role": role},
        headers=auth(owner_token),
    )
    assert res.status_code == 201, res.text


def test_mention_creates_notification_for_member():
    alice_token, _ = register_and_token(username="alice")
    bob_token, bob = register_and_token(username="bob")
    board = _board_with_card(alice_token, card_id="c1")
    _invite(alice_token, board["id"], "bob", role="editor")

    res = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "hey @bob please take a look"},
        headers=auth(alice_token),
    )
    assert res.status_code == 201, res.text
    notifs = client.get("/api/notifications", headers=auth(bob_token)).json()
    mention = [n for n in notifs if n["kind"] == "comment_mention"]
    assert len(mention) == 1
    n = mention[0]
    assert n["board_id"] == board["id"]
    assert n["card_id"] == "c1"
    assert n["actor_username"] == "alice"
    assert n["read"] is False


def test_mention_ignored_for_non_members():
    alice_token, _ = register_and_token(username="alice")
    # Bob exists but is not a member of Alice's board.
    bob_token, _ = register_and_token(username="bob")
    board = _board_with_card(alice_token, card_id="c1")

    client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "hey @bob take a look"},
        headers=auth(alice_token),
    )
    notifs = client.get("/api/notifications", headers=auth(bob_token)).json()
    assert notifs == []


def test_self_mention_does_not_notify():
    alice_token, _ = register_and_token(username="alice")
    board = _board_with_card(alice_token, card_id="c1")

    client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "note to self @alice"},
        headers=auth(alice_token),
    )
    notifs = client.get("/api/notifications", headers=auth(alice_token)).json()
    assert notifs == []


def test_edit_only_notifies_new_mentions():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    carol_token, _ = register_and_token(username="carol")
    board = _board_with_card(alice_token, card_id="c1")
    _invite(alice_token, board["id"], "bob")
    _invite(alice_token, board["id"], "carol")

    def mentions_for(token: str) -> list[dict]:
        return [
            n
            for n in client.get("/api/notifications", headers=auth(token)).json()
            if n["kind"] == "comment_mention"
        ]

    created = client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "first draft @bob"},
        headers=auth(alice_token),
    ).json()
    # Bob has 1 mention notification, Carol has 0.
    assert len(mentions_for(bob_token)) == 1
    assert mentions_for(carol_token) == []

    # Edit to mention both: @bob is reused (no re-notify), @carol is new.
    client.patch(
        _comments_url(board["id"], "c1", created["id"]),
        json={"body": "updated draft @bob @carol"},
        headers=auth(alice_token),
    )
    assert len(mentions_for(bob_token)) == 1
    assert len(mentions_for(carol_token)) == 1


def test_notifications_unread_only_and_mark_read():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = _board_with_card(alice_token, card_id="c1")
    _invite(alice_token, board["id"], "bob")

    client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "first @bob"},
        headers=auth(alice_token),
    )
    client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "second @bob"},
        headers=auth(alice_token),
    )

    # Bob receives: 1 collaborator_added + 2 comment_mention = 3 total.
    all_notifs = client.get("/api/notifications", headers=auth(bob_token)).json()
    mention_ids = [n["id"] for n in all_notifs if n["kind"] == "comment_mention"]
    assert len(mention_ids) == 2

    # Mark the oldest mention as read.
    oldest_mention = mention_ids[-1]
    res = client.post(
        f"/api/notifications/{oldest_mention}/read", headers=auth(bob_token)
    )
    assert res.status_code == 204

    unread = client.get(
        "/api/notifications", params={"unread_only": "true"}, headers=auth(bob_token)
    ).json()
    unread_ids = {n["id"] for n in unread}
    assert oldest_mention not in unread_ids
    assert len(unread) == len(all_notifs) - 1

    # Mark-all clears remaining.
    res = client.post("/api/notifications/read-all", headers=auth(bob_token))
    assert res.status_code == 204
    unread_after = client.get(
        "/api/notifications", params={"unread_only": "true"}, headers=auth(bob_token)
    ).json()
    assert unread_after == []


def test_notification_read_requires_ownership():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = _board_with_card(alice_token, card_id="c1")
    _invite(alice_token, board["id"], "bob")
    client.post(
        _comments_url(board["id"], "c1"),
        json={"body": "hi @bob"},
        headers=auth(alice_token),
    )
    bob_notif = client.get("/api/notifications", headers=auth(bob_token)).json()[0]
    # Alice cannot mark Bob's notification as read.
    res = client.post(
        f"/api/notifications/{bob_notif['id']}/read", headers=auth(alice_token)
    )
    assert res.status_code == 404


def test_notifications_require_auth():
    assert client.get("/api/notifications").status_code == 401
    assert client.post("/api/notifications/x/read").status_code == 401
    assert client.post("/api/notifications/read-all").status_code == 401


def test_invite_creates_collaborator_added_notification():
    alice_token, _ = register_and_token(username="alice")
    bob_token, bob = register_and_token(username="bob")
    board = create_board(alice_token, name="Ship")
    _invite(alice_token, board["id"], "bob", role="editor")

    notifs = client.get("/api/notifications", headers=auth(bob_token)).json()
    invite = [n for n in notifs if n["kind"] == "collaborator_added"]
    assert len(invite) == 1
    entry = invite[0]
    assert entry["board_id"] == board["id"]
    assert entry["board_name"] == "Ship"
    assert entry["actor_username"] == "alice"
    assert entry["meta"]["role"] == "editor"
    assert entry["read"] is False


def test_dashboard_aggregates_cards_across_boards():
    from datetime import date, timedelta

    today = date.today()
    yesterday = (today - timedelta(days=1)).isoformat()
    in_three_days = (today + timedelta(days=3)).isoformat()
    in_ten_days = (today + timedelta(days=10)).isoformat()

    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    board = create_board(alice_token, name="Alpha")
    payload = {
        "columns": [
            {"id": "col-a", "title": "Todo", "cardIds": ["k1", "k2"]},
            {"id": "col-b", "title": "Doing", "cardIds": ["k3"]},
        ],
        "cards": {
            "k1": {
                "id": "k1",
                "title": "Overdue ship",
                "due_date": yesterday,
                "priority": "high",
                "labels": ["launch"],
            },
            "k2": {
                "id": "k2",
                "title": "Soon review",
                "due_date": in_three_days,
                "priority": "medium",
            },
            "k3": {
                "id": "k3",
                "title": "Later audit",
                "due_date": in_ten_days,
            },
        },
    }
    client.put(f"/api/boards/{board['id']}", json=payload, headers=auth(alice_token))

    # Bob gets access to a separate board with one more due card.
    bob_board = create_board(bob_token, name="Beta")
    client.put(
        f"/api/boards/{bob_board['id']}",
        json={
            "columns": [{"id": "c1", "title": "Todo", "cardIds": ["kx"]}],
            "cards": {
                "kx": {
                    "id": "kx",
                    "title": "Bob's card",
                    "due_date": in_three_days,
                }
            },
        },
        headers=auth(bob_token),
    )

    # Alice's dashboard: sees Alpha only.
    dash = client.get("/api/dashboard", headers=auth(alice_token)).json()
    assert dash["summary"]["total_boards"] == 1
    assert dash["summary"]["total_cards"] == 3
    assert dash["summary"]["overdue_count"] == 1
    assert dash["summary"]["due_soon_count"] == 1
    upcoming_titles = [c["title"] for c in dash["upcoming"]]
    # Sorted by due_date ascending -> overdue first, then soon, then later.
    assert upcoming_titles[0] == "Overdue ship"
    assert upcoming_titles[1] == "Soon review"
    assert upcoming_titles[2] == "Later audit"
    assert dash["upcoming"][0]["overdue"] is True


def test_dashboard_includes_shared_boards():
    alice_token, _ = register_and_token(username="alice")
    bob_token, _ = register_and_token(username="bob")
    alice_board = create_board(alice_token, name="Alice")
    client.post(
        f"/api/boards/{alice_board['id']}/collaborators",
        json={"username": "bob", "role": "viewer"},
        headers=auth(alice_token),
    )
    # Bob also owns his own board.
    create_board(bob_token, name="BobOwn")

    dash = client.get("/api/dashboard", headers=auth(bob_token)).json()
    names = sorted(b["name"] for b in dash["boards"])
    assert "Alice" in names
    assert "BobOwn" in names
    # The shared board carries role=viewer + is_shared=True in the response.
    alice_entry = next(b for b in dash["boards"] if b["name"] == "Alice")
    assert alice_entry["role"] == "viewer"
    assert alice_entry["is_shared"] is True


def test_dashboard_skips_archived_boards():
    token, _ = register_and_token()
    board = create_board(token, name="Live")
    archived = create_board(token, name="Gone")
    client.patch(
        f"/api/boards/{archived['id']}",
        json={"is_archived": True},
        headers=auth(token),
    )
    dash = client.get("/api/dashboard", headers=auth(token)).json()
    names = [b["name"] for b in dash["boards"]]
    assert "Live" in names
    assert "Gone" not in names


def test_dashboard_requires_auth():
    assert client.get("/api/dashboard").status_code == 401


def test_dashboard_empty_when_no_due_cards():
    token, _ = register_and_token()
    create_board(token)  # default 5-col empty board
    dash = client.get("/api/dashboard", headers=auth(token)).json()
    assert dash["upcoming"] == []
    assert dash["summary"]["total_cards"] == 0
    assert dash["summary"]["overdue_count"] == 0


def test_parse_mentions_helper():
    from backend.mentions import parse_mentions

    assert parse_mentions("hi @alice and @bob!") == ["alice", "bob"]
    # Duplicate + case-insensitive dedupe.
    assert parse_mentions("@Alice @alice") == ["alice"]
    # Email-like strings are NOT mentions.
    assert parse_mentions("send mail to bob@example.com") == []
    # Too-short handles are ignored (min length 3).
    assert parse_mentions("@al") == []
    # Underscores / dots / digits allowed.
    assert parse_mentions("pair with @alice_b and @team.q2") == ["alice_b", "team.q2"]
