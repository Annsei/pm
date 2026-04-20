"""Activity log helpers: record events and diff board data into discrete events."""
import json
import uuid

from sqlalchemy.orm import Session as DbSession

from backend.models import ActivityLog


TRACKED_CARD_FIELDS = ("title", "details", "priority", "due_date")


def record_activity(
    db: DbSession,
    *,
    board_id: str,
    user_id: str,
    action: str,
    meta: dict | None = None,
) -> ActivityLog:
    entry = ActivityLog(
        id=str(uuid.uuid4()),
        board_id=board_id,
        user_id=user_id,
        action=action,
        meta=json.dumps(meta or {}, ensure_ascii=False),
    )
    db.add(entry)
    return entry


def _card_locations(columns: list[dict]) -> dict[str, tuple[str, str]]:
    """Return {card_id: (column_id, column_title)} for the given columns list."""
    out: dict[str, tuple[str, str]] = {}
    for col in columns or []:
        col_id = col.get("id")
        title = col.get("title", "")
        for card_id in col.get("cardIds", []) or []:
            if col_id:
                out[card_id] = (col_id, title)
    return out


def diff_board_data(old: dict, new: dict) -> list[dict]:
    """Compare two board-data dicts and return a list of activity events.

    Each event is a dict suitable for ActivityLog.meta with a `action` key
    identifying what happened. Empty list = no material change.
    """
    old_cards = (old or {}).get("cards", {}) or {}
    new_cards = (new or {}).get("cards", {}) or {}
    old_cols = (old or {}).get("columns", []) or []
    new_cols = (new or {}).get("columns", []) or []

    old_loc = _card_locations(old_cols)
    new_loc = _card_locations(new_cols)

    events: list[dict] = []
    old_ids = set(old_cards.keys())
    new_ids = set(new_cards.keys())

    for cid in sorted(new_ids - old_ids):
        card = new_cards[cid]
        column_title = new_loc.get(cid, ("", ""))[1]
        events.append(
            {
                "action": "card_add",
                "card_id": cid,
                "title": card.get("title", ""),
                "column_title": column_title,
            }
        )

    for cid in sorted(old_ids - new_ids):
        card = old_cards[cid]
        events.append(
            {
                "action": "card_delete",
                "card_id": cid,
                "title": card.get("title", ""),
            }
        )

    for cid in sorted(old_ids & new_ids):
        old_c = old_cards[cid]
        new_c = new_cards[cid]

        old_here = old_loc.get(cid)
        new_here = new_loc.get(cid)
        if old_here and new_here and old_here[0] != new_here[0]:
            events.append(
                {
                    "action": "card_move",
                    "card_id": cid,
                    "title": new_c.get("title", ""),
                    "from_column": old_here[1],
                    "to_column": new_here[1],
                }
            )

        changed: list[str] = []
        for field in TRACKED_CARD_FIELDS:
            if (old_c.get(field) or None) != (new_c.get(field) or None):
                changed.append(field)
        old_labels = sorted(old_c.get("labels", []) or [])
        new_labels = sorted(new_c.get("labels", []) or [])
        if old_labels != new_labels:
            changed.append("labels")
        if changed:
            events.append(
                {
                    "action": "card_edit",
                    "card_id": cid,
                    "title": new_c.get("title", ""),
                    "fields": changed,
                }
            )

    old_col_by_id = {c.get("id"): c for c in old_cols if c.get("id")}
    for col in new_cols:
        col_id = col.get("id")
        if col_id and col_id in old_col_by_id:
            old_title = old_col_by_id[col_id].get("title", "")
            new_title = col.get("title", "")
            if old_title != new_title:
                events.append(
                    {
                        "action": "column_rename",
                        "column_id": col_id,
                        "from_title": old_title,
                        "to_title": new_title,
                    }
                )

    return events
