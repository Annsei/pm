from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from backend.auth import (
    create_session,
    create_user,
    delete_session,
    get_current_session_token,
    get_current_user,
    hash_password,
    verify_password,
)
from backend.models import User, get_db
from backend.schemas import (
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UpdateProfileRequest,
    UserResponse,
)

router = APIRouter(prefix="/api/auth")


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, db: DbSession = Depends(get_db)) -> AuthResponse:
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    if req.email and db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = create_user(
        db,
        username=req.username,
        password=req.password,
        email=req.email,
        display_name=req.display_name or req.username,
    )
    session = create_session(db, user)
    return AuthResponse(token=session.token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: DbSession = Depends(get_db)) -> AuthResponse:
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not user.is_active or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    session = create_session(db, user)
    return AuthResponse(token=session.token, user=UserResponse.model_validate(user))


@router.post("/logout")
def logout(
    token: str = Depends(get_current_session_token),
    db: DbSession = Depends(get_db),
):
    delete_session(db, token)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse)
def update_profile(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> UserResponse:
    if req.new_password:
        if not req.current_password or not verify_password(
            req.current_password, current_user.password_hash
        ):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        current_user.password_hash = hash_password(req.new_password)

    if req.email is not None and req.email != current_user.email:
        clash = (
            db.query(User)
            .filter(User.email == req.email, User.id != current_user.id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="Email already registered")
        current_user.email = req.email

    if req.display_name is not None:
        current_user.display_name = req.display_name

    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)
