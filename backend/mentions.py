"""Parse @username mentions from free text."""
import re

# Must match the username pattern used for registration.
# @ followed by 3-32 chars of [A-Za-z0-9_.-]; case-insensitive.
# Boundary rules: preceded by start or non-word/non-@, so "email@x" is NOT a mention.
_MENTION_RE = re.compile(r"(?:(?<=^)|(?<=[^A-Za-z0-9_@.]))@([A-Za-z0-9_.-]{3,32})")


def parse_mentions(body: str) -> list[str]:
    """Return a de-duplicated, lowercased list of usernames mentioned in body."""
    if not body:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for match in _MENTION_RE.finditer(body):
        uname = match.group(1).lower()
        if uname in seen:
            continue
        seen.add(uname)
        out.append(uname)
    return out
