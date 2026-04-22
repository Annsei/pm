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
        if not col_id:
            continue
        title = col.get("title", "")
        for card_id in col.get("cardIds") or []:
            out[card_id] = (col_id, title)
    return out


def _card_edited_fields(old_c: dict, new_c: dict) -> list[str]:
    changed = [
        field
        for field in TRACKED_CARD_FIELDS
        if (old_c.get(field) or None) != (new_c.get(field) or None)
    ]
    if sorted(old_c.get("labels") or []) != sorted(new_c.get("labels") or []):
        changed.append("labels")
    return changed


def diff_board_data(old: dict, new: dict) -> list[dict]:
    """Compare two board-data dicts and return a list of activity events.

    Each event is a dict suitable for ActivityLog.meta with a `action` key
    identifying what happened. Empty list = no material change.
    """
    old = old or {}
    new = new or {}
    old_cards = old.get("cards") or {}
    new_cards = new.get("cards") or {}
    old_cols = old.get("columns") or []
    new_cols = new.get("columns") or []

    old_loc = _card_locations(old_cols)
    new_loc = _card_locations(new_cols)

    events: list[dict] = []
    old_ids = set(old_cards)
    new_ids = set(new_cards)

    for cid in sorted(new_ids - old_ids):
        events.append({
            "action": "card_add",
            "card_id": cid,
            "title": new_cards[cid].get("title", ""),
            "column_title": new_loc.get(cid, ("", ""))[1],
        })

    for cid in sorted(old_ids - new_ids):
        events.append({
            "action": "card_delete",
            "card_id": cid,
            "title": old_cards[cid].get("title", ""),
        })

    for cid in sorted(old_ids & new_ids):
        old_c = old_cards[cid]
        new_c = new_cards[cid]

        old_here = old_loc.get(cid)
        new_here = new_loc.get(cid)
        if old_here and new_here and old_here[0] != new_here[0]:
            events.append({
                "action": "card_move",
                "card_id": cid,
                "title": new_c.get("title", ""),
                "from_column": old_here[1],
                "to_column": new_here[1],
            })

        changed = _card_edited_fields(old_c, new_c)
        if changed:
            events.append({
                "action": "card_edit",
                "card_id": cid,
                "title": new_c.get("title", ""),
                "fields": changed,
            })

    old_col_titles = {c.get("id"): c.get("title", "") for c in old_cols if c.get("id")}
    for col in new_cols:
        col_id = col.get("id")
        if col_id in old_col_titles and old_col_titles[col_id] != col.get("title", ""):
            events.append({
                "action": "column_rename",
                "column_id": col_id,
                "from_title": old_col_titles[col_id],
                "to_title": col.get("title", ""),
            })

    return events
