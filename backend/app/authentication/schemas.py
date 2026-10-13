"""Data models for user authentication."""

from typing import Annotated

from password_validator import PasswordValidator
from pydantic import AfterValidator, BaseModel, EmailStr, Field, SecretStr, field_validator


password_checks = (
    (PasswordValidator().has().uppercase(), "Password must contain an uppercase letter."),
    (PasswordValidator().has().lowercase(), "Password must contain a lowercase letter."),
    (PasswordValidator().has().digits(), "Password must contain a number."),
    (PasswordValidator().has().symbols(), "Password must contain a symbol."),
    (PasswordValidator().has().no().spaces(), "Password must not contain spaces."),
)


def validate_password_encoding(value: SecretStr) -> SecretStr:
    try:
        value.get_secret_value().encode("utf-8")
    except UnicodeEncodeError:
        raise ValueError("Password must contain valid Unicode characters.") from None
    return value


Password = Annotated[SecretStr, AfterValidator(validate_password_encoding)]


def validate_username(username: str) -> str:
    if not username or not username[0].isalpha() or not username.isalnum():
        raise ValueError(
            "Username must start with a letter and contain only letters and numbers."
        )
    return username

class UsernameData(BaseModel):
    username: str = Field(min_length=3, max_length=15)

    @field_validator("username")
    @classmethod
    def validate_username(cls, username: str) -> str:
        if not username.isalnum():
            raise ValueError("Username can contain only letters and numbers; no spaces or special characters.")
        if not username[0].isalpha():
            raise ValueError("Username must start with a letter.")
        return username


class RegisterData(UsernameData):
    email: EmailStr = Field(max_length=255)
    password: Password = Field(min_length=7, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_complexity(cls, value: SecretStr) -> SecretStr:
        for check, message in password_checks:
            if not check.validate(value.get_secret_value()):
                raise ValueError(message)
        return value


class UserResponse(BaseModel):
    id: str
    username: str
    email: EmailStr

class LoginData(BaseModel):
    email: EmailStr = Field(max_length=255)
    password: Password = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
