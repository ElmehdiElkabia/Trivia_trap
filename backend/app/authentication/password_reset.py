"""Persistent, single-use password recovery."""

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from urllib.parse import urlsplit

from sqlalchemy import or_, select, update
from dataProcessing.models import User

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr, Field, SecretStr, field_validator
from fastapi.concurrency import run_in_threadpool

from authentication.mailer import send_email
from authentication.repository import DbSession
from authentication.schemas import Password, RegisterData
from authentication.security import hash_password
from authentication.validation_route import AuthRoute

reset_router = APIRouter(route_class=AuthRoute)
RESET_SECONDS = 15 * 60
RESEND_SECONDS = 60
GENERIC_MESSAGE = "If an eligible account exists, a password reset email will be sent."


class ForgotPasswordData(BaseModel):
    email: EmailStr = Field(max_length=255)


class ResetPasswordData(BaseModel):
    token: SecretStr = Field(min_length=43, max_length=43)
    password: Password = Field(min_length=7, max_length=128)

    @field_validator("token")
    @classmethod
    def validate_token(cls, value: SecretStr) -> SecretStr:
        token = value.get_secret_value()
        if not token.isascii() or not all(c.isalnum() or c in "-_" for c in token):
            raise ValueError("Invalid reset token.")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: SecretStr) -> SecretStr:
        return RegisterData.validate_password_complexity(value)

@reset_router.post("/forgot-password", status_code=202)
async def forgot_password(data: ForgotPasswordData, background_tasks: BackgroundTasks, db: DbSession):
    """Initiate a password reset for the given email address."""

    reset_url = os.environ.get("PASSWORD_RESET_URL", "")
    try:
        url = urlsplit(reset_url)
        valid_url = (url.scheme in ("http", "https") and url.hostname
                     and not url.fragment and not url.username and not url.password)
    except ValueError:
        valid_url = False
    if not valid_url:
        raise HTTPException(503, "Password recovery is not configured.")
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)

    email = await db.scalar(
        update(User).where(
            User.email_key == data.email.casefold(),
            User.password_hash.is_not(None),
            or_(User.reset_sent_at.is_(None),
                User.reset_sent_at <= now - timedelta(seconds=RESEND_SECONDS)),
        ).values(
            reset_digest=hashlib.sha256(token.encode()).hexdigest(),
            reset_expires=now + timedelta(seconds=RESET_SECONDS),
            reset_sent_at=now,
        ).returning(User.email)
    )
    await db.commit()
    if email is not None:
        link = f"{reset_url}#token={token}"
        background_tasks.add_task(
            send_email, email, "Reset your Trivia Trap password",
            f"Open this link to choose a new password:\n\n{link}\n\n"
            "This link expires in 15 minutes and can be used once.\n"
            "If you did not request this, ignore this email.",
        )
    return {"message": GENERIC_MESSAGE}


@reset_router.post("/reset-password")
async def reset_password(data: ResetPasswordData, background_tasks: BackgroundTasks, db: DbSession):
    digest = hashlib.sha256(data.token.get_secret_value().encode()).hexdigest()
    eligible = await db.scalar(select(User.id).where(
        User.reset_digest == digest,
        User.reset_expires > datetime.now(timezone.utc),
    ))
    if eligible is None:
        raise HTTPException(400, "Invalid or expired reset link.")
    password_hash = await run_in_threadpool(hash_password, data.password.get_secret_value())

    email = await db.scalar(
        update(User).where(
            User.id == eligible,
            User.reset_digest == digest,
            User.reset_expires > datetime.now(timezone.utc),
        ).values(
            password_hash=password_hash,
            reset_digest=None,
            reset_expires=None,
            auth_version=User.auth_version + 1,
        ).returning(User.email)
    )
    if email is None:
        await db.rollback()
        raise HTTPException(400, "Invalid or expired reset link.")
    await db.commit()
    background_tasks.add_task(
        send_email, email, "Your Trivia Trap password was changed",
        "Your password has been reset. Sign in with your new password.\n"
        "If you did not do this, reset your password immediately.",
    )
    return {"message": "Password reset. Sign in with your new password."}

