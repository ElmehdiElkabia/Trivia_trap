"""Security utilities for user authentication."""

import os
import jwt
from jwt.exceptions import InvalidTokenError
from datetime import datetime, timedelta, timezone
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from fastapi.concurrency import run_in_threadpool
from authentication.repository import find_user_by_email
from dataProcessing.models import User
from sqlalchemy.ext.asyncio import AsyncSession


JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

if not JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is missing. Set it before starting the backend.")

password_hasher = PasswordHash.recommended() #password hashing and verification


def hash_password(password: str) -> str:
    return password_hasher.hash(password) #hash password


def verify_password(password: str, password_hash: str) -> bool: #check password in db
    try:
        return password_hasher.verify(password, password_hash)
    except UnknownHashError:
        return False


def create_access_token(user_id: int, auth_version: int) -> str: #create JWT for user
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "ver": auth_version,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> tuple[int, int]:
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "iat", "exp", "ver"]},
        )
    except (TypeError, ValueError, OverflowError) as exc:
        raise InvalidTokenError("Invalid token claims") from exc

    for claim in ("iat", "exp", "nbf"):
        if claim in payload and type(payload[claim]) is not int:
            raise InvalidTokenError("Token timestamps must be integers")

    user_id = payload["sub"]

    if (not isinstance(user_id, str) or not user_id.isascii()
            or not user_id.isdecimal() or len(user_id) > 10
            or not 0 < int(user_id) <= 2147483647):
        raise InvalidTokenError("Invalid user ID")

    version = payload["ver"]
    if type(version) is not int or version < 0:
        raise InvalidTokenError("Invalid session version")
    return int(user_id), version


DUMMY_PASSWORD_HASH = hash_password("DummyPassword123!ThisIsNeverARealAccount")

async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:

    user = await find_user_by_email(db, email)
    password_hash = user.password_hash if user is not None else None
    auth_version = user.auth_version if user is not None else 0

    password_matches = await run_in_threadpool(
        verify_password,
        password,
        password_hash or DUMMY_PASSWORD_HASH,
    )

    if user is None or not password_hash or not password_matches:
        return None

    # Refresh after the thread-pool await to observe concurrent password resets.
    await db.refresh(user)
    if user.password_hash != password_hash or user.auth_version != auth_version:
        return None

    return user
