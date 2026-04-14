from sqlalchemy import create_engine, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker
from sqlalchemy.sql import func
import os


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime, default=func.now(), onupdate=func.now())

    boards: Mapped[list["Board"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, default="My Kanban Board")
    data: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime, default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="boards")


# Database setup
DATABASE_URL = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'data', 'kanban.db')}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
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
