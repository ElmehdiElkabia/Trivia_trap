"""Dependency to get the current authenticated user."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status, WebSocket, WebSocketException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError

from authentication.repository import DbSession, find_user_by_id
from dataProcessing.models import User
from authentication.security import decode_access_token, decode_websocket_ticket
from authentication.session_cookie import COOKIE_NAME


bearer_scheme = HTTPBearer(auto_error=False)


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DbSession,
    request: Request,
) -> User:
    token = credentials.credentials if credentials is not None else request.cookies.get(COOKIE_NAME)
    if not token:
        raise unauthorized()
    try:
        user_id, version = decode_access_token(token)
    except InvalidTokenError:
        raise unauthorized() from None
    user = await find_user_by_id(db, user_id)
    if user is None or user.auth_version != version:
        raise unauthorized()
    return user


async def get_current_user_ws(websocket: WebSocket, db: DbSession) -> User:
    # Browsers cannot attach Authorization headers to WebSocket constructors.
    # Use a short-lived ticket obtained through the same-origin authenticated API.
    ticket = websocket.query_params.get("ticket")
    if ticket:
        try:
            user_id, version = decode_websocket_ticket(ticket)
        except InvalidTokenError:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Invalid or expired WebSocket ticket",
            ) from None
    else:
        # Backward-compatible fallback for local development and older clients.
        token = websocket.cookies.get(COOKIE_NAME)
        if not token:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Could not validate credentials",
            )
        try:
            user_id, version = decode_access_token(token)
        except InvalidTokenError:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Could not validate credentials",
            ) from None

    user = await find_user_by_id(db, user_id)
    if user is None or user.auth_version != version:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Could not validate credentials",
        )
    return user
