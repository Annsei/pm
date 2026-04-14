import hashlib
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.orm import Session

from backend.models import User, SessionLocal, get_db

security = HTTPBasic()


def hash_password(password: str) -> str:
    """Simple password hashing (MVP - use bcrypt in production)"""
    return hashlib.sha256(password.encode()).hexdigest()


def authenticate_user(
    credentials: HTTPBasicCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Authenticate user with basic auth"""
    user = db.query(User).filter(User.username == credentials.username).first()
    if not user or user.password_hash != hash_password(credentials.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return user


def seed_default_user():
    """Create the default MVP user if it doesn't exist"""
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "user").first()
        if not existing:
            user = User(
                id=str(uuid.uuid4()),
                username="user",
                password_hash=hash_password("password"),
            )
            db.add(user)
            db.commit()
    finally:
        db.close()
