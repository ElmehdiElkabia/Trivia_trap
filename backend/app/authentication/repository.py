"""Persistent user access shared by both authentication methods."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from dataProcessing.database import get_db
from dataProcessing.models import User

DbSession = Annotated[AsyncSession, Depends(get_db)]


class DuplicateUserError(Exception):
    pass


async def find_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    if not 0 < user_id <= 2147483647:
        return None
    return await db.get(User, user_id)


async def find_user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email_key == email.casefold()))


async def find_user_by_google_sub(db: AsyncSession, google_sub: str) -> User | None:
    return await db.scalar(select(User).where(User.google_sub == google_sub))


async def find_user_by_username(db: AsyncSession, username: str) -> User | None:
    return await db.scalar(select(User).where(User.username_key == username.casefold()))


async def create_user(
    db: AsyncSession, username: str, email: str, password_hash: str | None,
    *, google_sub: str | None = None,
) -> User:
    user = User(username=username, email=email, password_hash=password_hash,
                google_sub=google_sub)
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise DuplicateUserError from exc
        raise
    return user
