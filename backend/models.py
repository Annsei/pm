from sqlalchemy import create_engine, Column, String, DateTime, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.sql import func
import os
import json

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationship
    boards = relationship("Board", back_populates="user", cascade="all, delete-orphan")

class Board(Base):
    __tablename__ = "boards"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, default="My Kanban Board")
    data = Column(Text, nullable=False)  # JSON string
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationship
    user = relationship("User", back_populates="boards")

# Database setup
DATABASE_URL = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'data', 'kanban.db')}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def create_tables():
    """Create all tables if they don't exist"""
    os.makedirs(os.path.dirname(DATABASE_URL.replace("sqlite:///", "")), exist_ok=True)
    Base.metadata.create_all(bind=engine)

def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Default board data
DEFAULT_BOARD_DATA = {
    "columns": [
        {"id": "column-1", "title": "To Do", "cardIds": []},
        {"id": "column-2", "title": "In Progress", "cardIds": []},
        {"id": "column-3", "title": "Review", "cardIds": []},
        {"id": "column-4", "title": "Testing", "cardIds": []},
        {"id": "column-5", "title": "Done", "cardIds": []},
    ],
    "cards": {}
}