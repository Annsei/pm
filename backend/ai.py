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
- {"action":"add_card","column_id":"column-1","title":"...","details":"..."}
- {"action":"move_card","card_id":"card-x","to_column_id":"column-2"}
- {"action":"edit_card","card_id":"card-x","title":"...","details":"..."}
- {"action":"delete_card","card_id":"card-x"}

If no board changes needed, use empty actions: []
Keep response_text short.
"""


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
