"""Router for user authentication endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from authentication.repository import DuplicateUserError, create_user, find_user_by_email, find_user_by_username
from authentication.schemas import RegisterData, UserResponse
from authentication.security import hash_password
from authentication.validation_route import AuthRoute
from authentication.schemas import LoginData, TokenResponse
from authentication.security import create_access_token, authenticate_user
from authentication.session_cookie import clear_access_cookie, set_access_cookie
from typing import Annotated

from authentication.current_user import get_current_user
from authentication.google_auth import google_router
from authentication.password_reset import reset_router
from dataProcessing.models import User
from sqlalchemy.ext.asyncio import AsyncSession
from authentication.repository import DbSession


auth_router = APIRouter(prefix="/auth", tags=["AUTH"], route_class=AuthRoute)
auth_router.include_router(google_router)
auth_router.include_router(reset_router)


async def registration_conflict(db: AsyncSession, username: str, email: str) -> str | None:
    if await find_user_by_username(db, username) is not None:
        return "This username is already taken."
    if await find_user_by_email(db, email) is not None:
        return "This email is already registered."
    return None


@auth_router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=UserResponse,
)
async def register(data: RegisterData, db: DbSession) -> UserResponse:
    conflict = await registration_conflict(db, data.username, data.email)
    if conflict is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, conflict)

    password_hash = await run_in_threadpool(
        hash_password,
        data.password.get_secret_value(),
    )
    try:
        user = await create_user(db, data.username, data.email, password_hash)
    except DuplicateUserError:
        # Another registration can claim a name or email after the first check.
        conflict = await registration_conflict(db, data.username, data.email)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            conflict or "This username or email is already registered.",
        ) from None

    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
    )


@auth_router.post("/login", response_model=TokenResponse)
async def login(data: LoginData, db: DbSession, request: Request, response: Response) -> TokenResponse:
    user = await authenticate_user(
        db, data.email,
        data.password.get_secret_value(),
    )

    if user is None:
        account = await find_user_by_email(db, data.email)
        if account is not None and account.google_sub is not None and account.password_hash is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This account uses Google sign-in. Continue with Google instead.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(user.id, user.auth_version)
    set_access_cookie(response, request, access_token)

    return TokenResponse(access_token=access_token)


@auth_router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(get_current_user)],) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
    )


@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    clear_access_cookie(response)
