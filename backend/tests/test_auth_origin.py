import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Request

from authentication import current_user


def _cookie_request(origin: str) -> Request:
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/users/me/presence",
        "headers": [
            (b"cookie", b"access_token=test-token"),
            (b"origin", origin.encode()),
        ],
    })


def test_cookie_write_allows_local_https_ip_but_rejects_other_origins(monkeypatch):
    user = SimpleNamespace(id=1, auth_version=0)
    monkeypatch.setattr(current_user, "decode_access_token", lambda token: (1, 0))

    async def find_user(db, user_id):
        return user

    monkeypatch.setattr(current_user, "find_user_by_id", find_user)

    async def authenticate(origin):
        return await current_user.get_current_user(
            None, None, _cookie_request(origin)
        )

    assert asyncio.run(authenticate("https://127.0.0.1:8443")) is user
    with pytest.raises(HTTPException) as error:
        asyncio.run(authenticate("https://other.example"))
    assert error.value.status_code == 403
