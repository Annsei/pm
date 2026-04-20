import json
import os
import uuid

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
    cleaned: list[str] = []
    for item in raw[:20]:
        if isinstance(item, str):
            stripped = item.strip()
            if stripped:
                cleaned.append(stripped[:40])
    return cleaned


def _sanitize_priority(raw):
    if raw is None:
        return None
    if isinstance(raw, str) and raw.lower() in ALLOWED_PRIORITIES:
        return raw.lower()
    return None


def _sanitize_due_date(raw):
    if raw is None or raw == "":
        return None
    if not isinstance(raw, str):
        return None
    from datetime import date
    try:
        date.fromisoformat(raw)
    except ValueError:
        return None
    return raw


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
            for col in columns:
                if col["id"] == col_id:
                    col["cardIds"].append(card_id)
                    break
            changed = True

        elif action == "move_card":
            card_id = act.get("card_id")
            to_col = act.get("to_column_id")
            if card_id not in cards or to_col not in column_ids:
                continue
            for col in columns:
                if card_id in col.get("cardIds", []):
                    col["cardIds"].remove(card_id)
                    break
            for col in columns:
                if col["id"] == to_col:
                    col["cardIds"].append(card_id)
                    break
            changed = True

        elif action == "edit_card":
            card_id = act.get("card_id")
            if card_id not in cards:
                continue
            if "title" in act:
                cards[card_id]["title"] = act["title"]
            if "details" in act:
                cards[card_id]["details"] = act["details"]
            if "labels" in act:
                cards[card_id]["labels"] = _sanitize_labels(act["labels"])
            if "priority" in act:
                cards[card_id]["priority"] = _sanitize_priority(act["priority"])
            if "due_date" in act:
                cards[card_id]["due_date"] = _sanitize_due_date(act["due_date"])
            changed = True

        elif action == "delete_card":
            card_id = act.get("card_id")
            if card_id not in cards:
                continue
            cards.pop(card_id)
            for col in columns:
                if card_id in col.get("cardIds", []):
                    col["cardIds"].remove(card_id)
                    break
            changed = True

    if not changed:
        return None
    return {"columns": columns, "cards": cards}
