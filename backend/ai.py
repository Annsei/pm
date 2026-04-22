import os
import uuid
from datetime import date

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY", ""),
    timeout=30.0,
)

MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = """\
You are a Kanban board assistant. Reply in the user's language.
Respond with JSON: {"response_text":"...","actions":[]}

If the user wants to change the board, add actions. Action types:
- {"action":"add_card","column_id":"column-1","title":"...","details":"...","labels":["bug"],"priority":"high","due_date":"2026-05-01"}
- {"action":"move_card","card_id":"card-x","to_column_id":"column-2"}
- {"action":"edit_card","card_id":"card-x","title":"...","details":"...","labels":["..."],"priority":"low","due_date":"..."}
- {"action":"delete_card","card_id":"card-x"}

Priority must be one of: low, medium, high, urgent (or null).
Due date must be ISO YYYY-MM-DD (or null).
Labels is a list of short strings (max 40 chars each).
Omit optional fields when the user doesn't mention them.

If no board changes needed, use empty actions: []
Keep response_text short.
"""

ALLOWED_PRIORITIES = {"low", "medium", "high", "urgent"}


def _sanitize_labels(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [
        item.strip()[:40]
        for item in raw[:20]
        if isinstance(item, str) and item.strip()
    ]


def _sanitize_priority(raw) -> str | None:
    if isinstance(raw, str) and raw.lower() in ALLOWED_PRIORITIES:
        return raw.lower()
    return None


def _sanitize_due_date(raw) -> str | None:
    if not isinstance(raw, str) or not raw:
        return None
    try:
        date.fromisoformat(raw)
    except ValueError:
        return None
    return raw


CARD_FIELD_SANITIZERS = {
    "title": lambda v: v,
    "details": lambda v: v,
    "labels": _sanitize_labels,
    "priority": _sanitize_priority,
    "due_date": _sanitize_due_date,
}


def _remove_card_from_columns(columns: list[dict], card_id: str) -> None:
    for col in columns:
        card_ids = col.get("cardIds") or []
        if card_id in card_ids:
            card_ids.remove(card_id)
            return


def _append_card_to_column(columns: list[dict], column_id: str, card_id: str) -> None:
    for col in columns:
        if col.get("id") == column_id:
            col.setdefault("cardIds", []).append(card_id)
            return


def apply_actions(actions: list, kanban: dict) -> dict | None:
    """Apply a list of AI actions to a board. Returns the updated board or None if unchanged."""
    if not isinstance(actions, list):
        return None

    columns = kanban.get("columns", [])
    cards = kanban.get("cards", {})
    column_ids = {col["id"] for col in columns if isinstance(col, dict) and "id" in col}
    changed = False

    for act in actions:
        if not isinstance(act, dict):
            continue
        action = act.get("action")

        if action == "add_card":
            col_id = act.get("column_id")
            if col_id not in column_ids:
                continue
            card_id = f"card-{uuid.uuid4().hex[:6]}"
            cards[card_id] = {
                "id": card_id,
                "title": act.get("title", "Untitled"),
                "details": act.get("details", ""),
                "labels": _sanitize_labels(act.get("labels")),
                "priority": _sanitize_priority(act.get("priority")),
                "due_date": _sanitize_due_date(act.get("due_date")),
            }
            _append_card_to_column(columns, col_id, card_id)
            changed = True

        elif action == "move_card":
            card_id = act.get("card_id")
            to_col = act.get("to_column_id")
            if card_id not in cards or to_col not in column_ids:
                continue
            _remove_card_from_columns(columns, card_id)
            _append_card_to_column(columns, to_col, card_id)
            changed = True

        elif action == "edit_card":
            card_id = act.get("card_id")
            if card_id not in cards:
                continue
            card = cards[card_id]
            for field, sanitize in CARD_FIELD_SANITIZERS.items():
                if field in act:
                    card[field] = sanitize(act[field])
            changed = True

        elif action == "delete_card":
            card_id = act.get("card_id")
            if card_id not in cards:
                continue
            cards.pop(card_id)
            _remove_card_from_columns(columns, card_id)
            changed = True

    if not changed:
        return None
    return {"columns": columns, "cards": cards}
