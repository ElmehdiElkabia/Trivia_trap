from fastapi import APIRouter, Depends, Query, File, Form, UploadFile, HTTPException, status
from pydantic import EmailStr
from dataProcessing.database import get_db
from authentication.current_user import get_current_user
from dataProcessing.models import User
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated
from users.utils import build_user_profile, update_avatar_path
from .schemas import UserProfile, GameHistoryResponse
from users.utils import get_user_game_history
from typing import Literal
from pathlib import Path
from presence import mark_user_offline, mark_user_online
from authentication.schemas import validate_username


router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(get_current_user)])


def validate_language(language: str = Query('en', min_length=2, max_length=2)) -> str:
    if language not in ['en', 'ar']:
        language = 'en'
    return language

@router.get("/me")
async def get_profile(db: Annotated[AsyncSession, Depends(get_db)],
                    current_user: Annotated[User, Depends(get_current_user)],
                    language: Annotated[str, Depends(validate_language)]) -> UserProfile:
    return await build_user_profile(
            db,
            user_id=current_user.id,
            language=language
        )

@router.put("/me")
async def update_profile(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    username: Annotated[str, Form(min_length=1, max_length=15)],
    email: Annotated[EmailStr, Form(min_length=5, max_length=30)],
) -> UserProfile:
    """
        Update the current user's profile information.
        username and email
    """

    try:
        validate_username(username)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    existing_user = await db.scalar(
        select(User).where(
            or_(User.username == username, User.email == email),
            User.id != current_user.id,
        )
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email is already taken."
        )

    current_user.username = username
    current_user.email = email
    await db.commit()
    await db.refresh(current_user)
    return await build_user_profile(
        db,
        user_id=current_user.id,
        language='en'
    )


@router.get("/me/history", response_model=GameHistoryResponse)
async def get_my_game_history(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    offset: Annotated[int, Query(ge=0)] = 0,
    result: Literal["all", "wins", "losses", "draws"] = "all",
) -> GameHistoryResponse:
    return await get_user_game_history(
        db, current_user.id, limit=limit, offset=offset, result_filter=result
    )


@router.post("/me/presence", status_code=status.HTTP_204_NO_CONTENT)
async def update_my_presence(
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    mark_user_online(current_user.id)


@router.delete("/me/presence", status_code=status.HTTP_204_NO_CONTENT)
async def clear_my_presence(
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    mark_user_offline(current_user.id)



@router.get("/{username}")
async def get_user_profile(username: str,
                           db: Annotated[AsyncSession, Depends(get_db)],
                           language: Annotated[str, Depends(validate_language)]) -> UserProfile:
    return await build_user_profile(
            db,
            username=username,
            language=language
        )



UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
FILE_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

@router.post("/me/upload")
async def upload_avatar(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
)-> dict:
    """
        Upload a profile avatar for the current user.
        stores the file in the 'uploads' directory with a safe filename: {user_id}_avatar.{extension}.
    """
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types are: {', '.join(ALLOWED_MIME_TYPES)}"
        )

    file_size = file.size
    if file_size and file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File is too large. Maximum allowed size is 5MB."
        )

    prefix = "".join(c for c in str(user.id) if c.isalnum() or c in ("-", "_")).strip()
    file_extension = FILE_EXTENSIONS[file.content_type]
    safe_filename = f"{prefix}_avatar{file_extension}"

    file_path = UPLOAD_DIR / safe_filename

    try:
        with file_path.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # Read in chunks of 1MB
                buffer.write(chunk)
    finally:
        await file.close()
    await update_avatar_path(db, user.id, f"/uploads/{safe_filename}")
    return {
        "status": "success",
        "filename": safe_filename,
        "size_bytes": file_size
    }
