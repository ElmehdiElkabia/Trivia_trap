from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from typing import Annotated
from pydantic import BaseModel, Field, ValidationError
import secrets
import string
from authentication.current_user import get_current_user, get_current_user_ws
from dataProcessing.models import User
from .utils import GameError, lobby_update
from .room_models import Room, RoomMetaData, RoomPhase, RoomSettings
from .events import join_room, process_event, sync_current_phase
from json import JSONDecodeError
from presence import mark_user_online
import asyncio
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/room", tags=["Room"])

class RoomManager():
    def __init__(self):
        self.rooms : Annotated[dict[str, Room], Field(description="Dictionary of rooms with room_id as key and Room object as value")] = {}

    async def connect(self, ws: WebSocket, room_id: str):
        await ws.accept()
        if not ws.state.user_id or not ws.state.user_name or not ws.state.db_user_id:
            raise GameError("INVALID_PAYLOAD", "Missing user_id or user_name in WebSocket state")
        join_room(self.rooms, ws, room_id, ws.state.user_id, ws.state.user_name, ws.state.db_user_id)
        self.rooms[room_id].meta_data.last_activity_at = datetime.now(timezone.utc)
        mark_user_online(ws.state.db_user_id)
        await self.broadcast(lobby_update(self.rooms[room_id]), room_id, None)
        await sync_current_phase(self, room_id, ws.state.user_id)

    async def broadcast(self, data: Annotated[str | dict, Field(description="Data in JSON format")], room_id: str,
                        exclude : Annotated[str, Field(description="Player ID to exclude from broadcast")] = None):
        if room_id not in self.rooms:
            return
        for id, player in self.rooms.get(room_id).players.copy().items():
            if id == exclude:
                continue
            try:
                if player.is_present:
                    await player.ws.send_json(data)
            except Exception:
                self.mark_disconnected(id, room_id)

    async def send_to_player(self, data: Annotated[str | dict, Field(description="Data in JSON format")], room_id: str, player_id: str):
        if room_id not in self.rooms:
            return
        player = self.rooms.get(room_id).players.get(player_id)
        if player is None or not player.is_present:
            return
        try:
            await player.ws.send_json(data)
        except Exception:
            self.mark_disconnected(player_id, room_id)

    async def remove_connection(self, player_id: str, room_id: str):
        """
            remove disconnected user from the list of active rooms
        """
        if room_id not in self.rooms:
            return
        player = self.rooms.get(room_id).players.get(player_id)
        try:
            if player is not None:
                await player.ws.close()
        except Exception:
            pass
        if player is not None:
            del self.rooms[room_id].players[player_id]
        if room_id in self.rooms:
            self.rooms[room_id].meta_data.last_activity_at = datetime.now(timezone.utc)

    def mark_disconnected(self, player_id: str, room_id: str):
        """
            Mark a user as disconnected in the room, but keep them in the room for a while in case they reconnect.
        """
        if room_id not in self.rooms:
            return
        player = self.rooms.get(room_id).players.get(player_id)
        if player is not None:
            player.is_present = False
            # Keep the lobby alive briefly so a temporary WebSocket disconnect does not
            # invalidate the room code while the player reconnects.
            self.rooms[room_id].meta_data.last_activity_at = datetime.now(timezone.utc)

manager = RoomManager()

ROOM_CODE_ALPHABET = string.ascii_uppercase + string.digits


def is_valid_room_code(room_id: str) -> bool:
    return len(room_id) == 6 and all(character in ROOM_CODE_ALPHABET for character in room_id)


async def keep_presence_alive(user_id: int) -> None:
    try:
        while True:
            mark_user_online(user_id)
            await asyncio.sleep(30)
    except asyncio.CancelledError:
        pass


async def send_initial_game_error(ws: WebSocket, error: GameError) -> None:
    """Send a rejected join directly because the player is not in the room yet."""
    try:
        await ws.send_json(error.to_dict())
        await ws.close(code=1008, reason=error.message[:123])
    except Exception:
        # The peer may disappear before the structured error can be delivered.
        pass


class RoomResponse(BaseModel):
    room_id: str


class RoomStatusResponse(BaseModel):
    room_id: str
    status: str


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    current_user: Annotated[User, Depends(get_current_user)],
) -> RoomResponse:
    for _ in range(20):
        room_id = "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(6))
        if room_id not in manager.rooms:
            manager.rooms[room_id] = Room(
                meta_data=RoomMetaData(
                    host_id=str(current_user.id),
                    settings=RoomSettings(),
                ),
                players={},
            )
            return RoomResponse(room_id=room_id)
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not allocate a room code")


@router.get("/{room_id}", response_model=RoomStatusResponse)
async def get_room_status(
    room_id: str,
    _current_user: Annotated[User, Depends(get_current_user)],
) -> RoomStatusResponse:
    normalized = room_id.strip().upper()
    if not is_valid_room_code(normalized):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid room code")
    room = manager.rooms.get(normalized)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    if sum(1 for player in room.players.values() if player.is_present) >= room.meta_data.settings.max_players:
        room_status = "full"
    elif room.meta_data.phase.current_state != RoomPhase.LOBBY:
        room_status = "in_progress"
    else:
        room_status = "open"
    return RoomStatusResponse(room_id=normalized, status=room_status)

def get_available_rooms(manager: RoomManager = manager) -> dict[str, Room]:
    """
        Get available rooms with their player count and settings.
        Empty rooms that were never joined are removed after 10 minutes.
    """
    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(minutes=10)

    stale_room_ids = [
        room_id
        for room_id, room in manager.rooms.items()
        if not any(player.is_present for player in room.players.values())
        and room.meta_data.last_activity_at <= stale_before
    ]
    for room_id in stale_room_ids:
        manager.rooms.pop(room_id, None)

    return {
        room_id: {
            "player_count": sum(1 for player in room.players.values() if player.is_present),
            "settings": room.meta_data.settings.model_dump(),
        }
        for room_id, room in manager.rooms.items()
        if room.meta_data.phase.current_state == RoomPhase.LOBBY
        and sum(1 for player in room.players.values() if player.is_present) < room.meta_data.settings.max_players
    }

@router.websocket("/{room_id}")
async def room(ws: WebSocket, room_id: str, user: Annotated[User, Depends(get_current_user_ws)]):

    user_id = str(user.id)
    room_id = room_id.strip().upper()
    ws.state.user_id = user_id
    ws.state.user_name = user.username
    ws.state.db_user_id = user.id
    presence_task = asyncio.create_task(keep_presence_alive(user.id))

    try:
        await manager.connect(ws, room_id)
        while True:
            try:
                if (
                    room_id not in manager.rooms
                    or user_id not in manager.rooms[room_id].players
                    or manager.rooms[room_id].players[user_id].ws is not ws
                ):
                    break  # The room, player, or connection is no longer active
                request = await ws.receive_json()
                event_name = request.get("event")
                data = request.get("data")
                await process_event(manager, room_id, user_id, user.username, event_name, data)
            except GameError as e:
                await manager.send_to_player(e.to_dict(), room_id, user_id)
            except JSONDecodeError:
                await manager.send_to_player({"event": "ERROR", "data": {"code": "INVALID_PAYLOAD", "message": "Invalid JSON format"}}, room_id, user_id)
            except ValidationError:
                await manager.send_to_player({"event": "ERROR", "data": {"code": "INVALID_PAYLOAD", "message": "Invalid Data"}}, room_id, user_id)
    except WebSocketDisconnect:
        manager.mark_disconnected(user_id, room_id)
        if room_id in manager.rooms:
            await manager.broadcast(lobby_update(manager.rooms[room_id]), room_id, user_id)
    except GameError as e:
        await send_initial_game_error(ws, e)
    except Exception as e:
        print(f"An unexpected error occurred. Type: {type(e).__name__} | Message: {e}")
        await manager.remove_connection(user_id, room_id)
    finally:
        presence_task.cancel()
