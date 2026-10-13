"""Google sign-in with a username choice for new accounts."""

import os
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pydantic import BaseModel, Field, SecretStr

from authentication.repository import (
    DbSession, DuplicateUserError, create_user, find_user_by_email,
    find_user_by_google_sub, find_user_by_username,
)
from authentication.schemas import TokenResponse, UsernameData
from authentication.security import create_access_token
from authentication.session_cookie import set_access_cookie
from authentication.validation_route import AuthRoute


google_router = APIRouter(route_class=AuthRoute)


class GoogleLoginData(BaseModel):
    credential: SecretStr = Field(min_length=1)


class GoogleCompleteData(UsernameData, GoogleLoginData):
    pass


class UsernameRequiredResponse(BaseModel):
    requires_username: Literal[True] = True


def google_identity(claims: dict) -> str:
    google_sub = claims.get("sub")
    if not isinstance(google_sub, str) or not 0 < len(google_sub) <= 255:
        raise HTTPException(status_code=401, detail="Invalid Google identity.")
    return google_sub


def verified_google_email(claims: dict) -> str:
    email = claims.get("email")
    if (not isinstance(email, str) or not 0 < len(email) <= 255
            or claims.get("email_verified") is not True):
        raise HTTPException(status_code=401, detail="A verified Google email is required.")
    return email


@google_router.post("/google", response_model=TokenResponse | UsernameRequiredResponse)
async def google_login(
    data: GoogleLoginData, db: DbSession, request: Request, response: Response,
) -> TokenResponse | UsernameRequiredResponse:
    claims = await run_in_threadpool(verify_google_token, data.credential.get_secret_value())
    google_sub = google_identity(claims)
    user = await find_user_by_google_sub(db, google_sub)
    if user is None:
        email = verified_google_email(claims)
        if await find_user_by_email(db, email) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists. Sign in with your existing method.",
            )
        return UsernameRequiredResponse()

    access_token = create_access_token(user.id, user.auth_version)
    set_access_cookie(response, request, access_token)
    return TokenResponse(access_token=access_token)


@google_router.post("/google/complete", response_model=TokenResponse)
async def complete_google_signup(
    data: GoogleCompleteData, db: DbSession, request: Request, response: Response,
) -> TokenResponse:

    claims = await run_in_threadpool(verify_google_token, data.credential.get_secret_value())
    google_sub = google_identity(claims)
    user = await find_user_by_google_sub(db, google_sub)

    if user is None:
        email = verified_google_email(claims)
        if await find_user_by_email(db, email) is not None:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
    else:
        access_token = create_access_token(user.id, user.auth_version)
        set_access_cookie(response, request, access_token)
        return TokenResponse(access_token=access_token)

    name_owner = await find_user_by_username(db, data.username)
    if name_owner is not None:
        raise HTTPException(status_code=409, detail="That username is already taken.")

    try:
        user = await create_user(db, data.username, email, None, google_sub=google_sub)
    except DuplicateUserError:
        raise HTTPException(status_code=409, detail="That username or account is already taken.") from None

    access_token = create_access_token(user.id, user.auth_version)
    set_access_cookie(response, request, access_token)
    return TokenResponse(access_token=access_token)


def verify_google_token(credential: str) -> dict:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured.")
    try:
        return id_token.verify_oauth2_token(
            credential, GoogleRequest(), audience=client_id,
        )
    except TransportError:
        raise HTTPException(status_code=503, detail="Google sign-in is temporarily unavailable.") from None
    except (ValueError, GoogleAuthError):
        raise HTTPException(status_code=401, detail="Invalid Google token.") from None
