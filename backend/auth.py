import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session as DbSession

from backend.models import Session, SessionLocal, User, get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_BEARER_UNAUTHORIZED = {"WWW-Authenticate": "Bearer"}


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers=_BEARER_UNAUTHORIZED,
    )


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify password; falls back to SHA256 for legacy pre-bcrypt rows."""
    try:
        if pwd_context.identify(password_hash):
            return pwd_context.verify(password, password_hash)
    except ValueError:
        pass
    return hashlib.sha256(password.encode()).hexdigest() == password_hash


def create_session(db: DbSession, user: User) -> Session:
    session = Session(
        token=secrets.token_urlsafe(32),
        user_id=user.id,
        expires_at=Session.default_expiry(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def delete_session(db: DbSession, token: str) -> None:
    session = db.get(Session, token)
    if session:
        db.delete(session)
        db.commit()


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def get_current_session_token(authorization: str | None = Header(default=None)) -> str:
    token = _extract_bearer(authorization)
    if not token:
        raise _unauthorized("Missing or invalid Authorization header")
    return token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: DbSession = Depends(get_db),
) -> User:
    """Resolve the current user from a Bearer session token."""
    token = get_current_session_token(authorization)
    session = db.get(Session, token)
    if not session:
        raise _unauthorized("Invalid session token")

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        raise _unauthorized("Session expired")

    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise _unauthorized("User no longer exists")
    return user


def create_user(
    db: DbSession,
    username: str,
    password: str,
    email: str | None = None,
    display_name: str | None = None,
) -> User:
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        email=email,
        display_name=display_name or username,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def seed_default_user() -> None:
    """Create the default demo user on first boot (backwards compatibility)."""
    with SessionLocal() as db:
        if not db.query(User).filter(User.username == "user").first():
            create_user(db, username="user", password="password", display_name="Demo User")
