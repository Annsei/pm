import secrets
import uuid
from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session as DbSession

from backend.models import Session, SessionLocal, User, get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password with bcrypt."""
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash. Supports legacy SHA256 hashes."""
    try:
        if pwd_context.identify(password_hash):
            return pwd_context.verify(password, password_hash)
    except ValueError:
        pass
    # Legacy SHA256 fallback for pre-existing MVP data.
    import hashlib
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


def delete_session(db: DbSession, token: str) -> bool:
    session = db.get(Session, token)
    if not session:
        return False
    db.delete(session)
    db.commit()
    return True


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2:
        return None
    scheme, token = parts[0].lower(), parts[1].strip()
    if scheme != "bearer" or not token:
        return None
    return token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: DbSession = Depends(get_db),
) -> User:
    """Resolve the current user from a Bearer session token."""
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    session = db.get(Session, token)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
        )
    return user


def get_current_session_token(authorization: str | None = Header(default=None)) -> str:
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


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


def seed_default_user():
    """Create the default MVP user if it doesn't exist (backwards compatibility)."""
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "user").first()
        if not existing:
            create_user(db, username="user", password="password", display_name="Demo User")
    finally:
        db.close()
