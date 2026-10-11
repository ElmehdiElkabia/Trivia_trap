"""Browser session cookie settings shared by both login methods."""

from fastapi import Request, Response

from authentication.security import ACCESS_TOKEN_EXPIRE_MINUTES

COOKIE_NAME = "access_token"
ALLOWED_BROWSER_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:8443",
    "https://127.0.0.1:8443",
)


def set_access_cookie(response: Response, request: Request, token: str) -> None:
    # Permit plain HTTP cookies only for local development.
    secure = request.url.scheme == "https" or request.url.hostname not in {
        "localhost", "127.0.0.1",
    }
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_access_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        samesite="lax",
        path="/",
    )
