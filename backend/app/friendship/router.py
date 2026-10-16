from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from authentication.current_user import get_current_user
from dataProcessing.models import User
from authentication.repository import DbSession
from friendship.repository import get_friends, search_players, send_friend, accept_request, get_incoming_requests, get_sent_requests, reject_request, cancel_request, remove_friend as delete_friend
from friendship.schemas import FriendResponse, IncomingFriendRequest

friends_router = APIRouter(prefix="/friends", tags=["Friendship"])

CurrentUser = Annotated[User, Depends(get_current_user)]
UserId = Annotated[int, Path(ge=1, le=2147483647)]


@friends_router.get("", response_model=list[FriendResponse])
@friends_router.get("/", response_model=list[FriendResponse], include_in_schema=False)
async def list_friends(current_user: CurrentUser, db: DbSession) -> list[FriendResponse]:
    return await get_friends(db, current_user.id)


@friends_router.get("/search")
async def search_friend_candidates(
    prefix: Annotated[str, Query(min_length=1, max_length=15)],
    current_user: CurrentUser,
    db: DbSession,
):
    if not prefix.isalnum():
        raise HTTPException(status_code=422, detail="Search prefix must contain only letters and numbers.")
    return await search_players(db, current_user.id, prefix)


@friends_router.post("/request/{user_id}")
async def send_friend_request(user_id: UserId, current_user: CurrentUser, db: DbSession):
    try:
        await send_friend(db, current_user.id, user_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"message": "Friend request sent"}

@friends_router.post("/accept/{sender_id}")
async def accept_friend_request(sender_id: UserId, current_user: CurrentUser, db: DbSession):
    try:
        await accept_request(db, current_user.id, sender_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"message": "Friend request accepted"}


@friends_router.get("/requests", response_model=list[IncomingFriendRequest])
async def list_incoming_requests(current_user: CurrentUser, db: DbSession) -> list[IncomingFriendRequest]:
    return await get_incoming_requests(db, current_user.id)


@friends_router.get("/requests/sent")
async def list_sent_requests(current_user: CurrentUser, db: DbSession):
    return await get_sent_requests(db, current_user.id)


@friends_router.post("/reject/{sender_id}")
async def reject_friend_request(sender_id: UserId, current_user: CurrentUser, db: DbSession):
    try:
        await reject_request(db, current_user.id, sender_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"message": "Friend request rejected"}

@friends_router.delete("/request/{receiver_id}")
async def cancel_friend_request(
    receiver_id: UserId,
    current_user: CurrentUser,
    db: DbSession,
):
    try:
        await cancel_request(db, current_user.id, receiver_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"message": "Friend request canceled"}


@friends_router.delete("/{friend_id}")
async def remove_friend(friend_id: UserId, current_user: CurrentUser, db: DbSession):
    try:
        await delete_friend(db, current_user.id, friend_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"message": "Friend removed"}
