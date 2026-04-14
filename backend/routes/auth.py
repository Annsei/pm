from fastapi import APIRouter, Depends
from fastapi.security import HTTPBasicCredentials
from sqlalchemy.orm import Session

from backend.auth import security, authenticate_user
from backend.models import get_db

router = APIRouter(prefix="/api/auth")


@router.post("/login")
def login(
    credentials: HTTPBasicCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user = authenticate_user(credentials, db)
    return {
        "id": user.id,
        "username": user.username,
        "message": "Login successful",
    }
