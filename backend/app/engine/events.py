from __future__ import annotations # to treat type hints as strings to avoid circular imports
from fastapi import WebSocket
from .room_models import PlayerInfo, RoomMetaData, RoomSettings, Room, RoomPhase
from pydantic import Field
from statemachine import State
from typing import TYPE_CHECKING
from dataProcessing.ingestion import ( validate_bluff_answer, build_voting_choices, validate_vote, calculate_results ) # import demo functions until we have a proper data processing module
from dataProcessing.achievement import (
    evaluate_game_achievements,
    process_round_achievements,
    reset_game_progress,
)
from dataProcessing.services import load_categories, load_question, save_game_results
from dataProcessing.achievement_persistence import load_unlocked_achievements, persist_new_achievements
from .utils import GameError, Context, clear_data, validate_phase, lobby_update
import asyncio
import random
import math
import logging
import string
from time import monotonic
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

if TYPE_CHECKING: # it evaluates to False at runtime, so the import is only for type checking and avoids circular imports
    from .room_manager import RoomManager

logger = logging.getLogger(__name__)

async def publish_phase_payload(manager: RoomManager, payload: dict, room_id: str):
    """Save the public phase event before broadcasting it for later reconnects."""
    metadata = manager.rooms[room_id].meta_data
    metadata.phase_payload = deepcopy(payload)
    duration = payload["data"].get("duration")
    metadata.phase_deadline = monotonic() + duration if duration is not None else None
    await manager.broadcast(payload, room_id, None)


async def sync_current_phase(manager: RoomManager, room_id: str, player_id: str):
    """sync the current phase to a player who just joined the room or reconnected after a disconnect."""
    metadata = manager.rooms[room_id].meta_data
    if metadata.phase_payload is None:
        return
    payload = deepcopy(metadata.phase_payload)
    if metadata.phase_deadline is not None:
        payload["data"]["duration"] = max(0, math.ceil(metadata.phase_deadline - monotonic()))
    await manager.send_to_player(payload, room_id, player_id)

    # this part is to notify the player of the other players who have already submitted their bluffs or votes,
    # so that they can see the progress of the game
    submissions = {
        "PHASE_QUESTION": ("BLUFF_SUBMITTED", metadata.submitted_bluffs),
        "PHASE_VOTING": ("VOTE_SUBMITTED", metadata.voting_results),
    }.get(payload["event"])
    if submissions is not None:
        event, submitted = submissions
        for submitted_player in list(submitted):
            await manager.send_to_player(
                {"event": event, "data": {"player_id": submitted_player}},
                room_id, player_id,
            )


async def phase_timer(manager: RoomManager, context: Context, deadline: float, expected_phase: State):
    """
        Advance this room only if this timer still owns the expected phase.
    """
    try:
        await asyncio.sleep(max(0, deadline - monotonic()))
        room = manager.rooms.get(context.room_id)
        if room is None:
            return
        async with room.meta_data.phase_lock:
            if (
                manager.rooms.get(context.room_id) is not room
                or room.meta_data.timer_task is not asyncio.current_task()
                or room.meta_data.phase.current_state != expected_phase
            ):
                return
            await to_next_phase(manager, context)
    except asyncio.CancelledError:
        # Task was canceled early (all players submitted before deadline).
        pass


def start_phase_timer(manager: RoomManager, context: Context, room: Room, expected_phase: State):
    deadline = room.meta_data.phase_deadline
    if deadline is None:
        return
    room.meta_data.timer_task = asyncio.create_task(phase_timer(
        manager, context, deadline, expected_phase,
    ))


def join_room(rooms: dict, ws: WebSocket, room_id: str, player_id: str, name: str, db_user_id: int):
    """
        Join or Create Room if it does not exist. If the room exists, add the player to the room. If the room is full, raise an error.
    """
    if len(room_id) != 6 or any(character not in string.ascii_uppercase + string.digits for character in room_id):
        raise GameError("INVALID_ROOM_CODE", "The room code is invalid. Please check it and try again.")
    if rooms.get(room_id) is None:
        raise GameError("ROOM_NOT_FOUND", "This room could not be found. Check the room code and try again.")
    room = rooms[room_id]
    if  player_id not in room.players and len(room.players) >= room.meta_data.settings.max_players:
        raise GameError("FULL_ROOM", "This room is full. Try joining another room.")
    if player_id not in room.players:
        if room.meta_data.phase.current_state != RoomPhase.LOBBY:
            raise GameError("GAME_IN_PROGRESS", "This game is already in progress. You cannot join right now.")
        room.players[player_id] = PlayerInfo(ws=ws, name=name, db_user_id=db_user_id)
    else:
        room.players[player_id].ws = ws
        room.players[player_id].is_present = True
        room.players[player_id].db_user_id = db_user_id


async def save_achievement_candidates(room: Room, updated_state: dict, newly_unlocked: dict[str, list[str]]) -> dict[str, list[str]]:
    """Commit unlocks before exposing them; retain round progress on a DB failure."""
    if not newly_unlocked:
        room.meta_data.achievement_state = updated_state
        return {}
    player_user_ids = {player_id: player.db_user_id for player_id, player in room.players.items()}
    try:
        saved = await persist_new_achievements(newly_unlocked, player_user_ids)
    except Exception:
        logger.exception("Could not persist achievement unlocks")
        updated_state["unlocked"] = {
            player_id: codes.copy()
            for player_id, codes in room.meta_data.achievement_state["unlocked"].items()
        }
        room.meta_data.achievement_state = updated_state
        return {}
    room.meta_data.achievement_state = updated_state
    return saved


async def leave_room(manager: RoomManager, context: Context):
    """
        Leave the room and remove the player from the room.
        If the player is the host, transfer host to another player.
    """
    room = manager.rooms.get(context.room_id)
    if context.user_id == room.meta_data.host_id:
        if len(room.players) > 1:
            for player_id in room.players:
                if player_id != context.user_id:
                    room.meta_data.host_id = player_id
                    break
    await manager.remove_connection(context.user_id, context.room_id)
    await manager.broadcast(lobby_update(room), context.room_id, context.user_id)



async def get_categories(manager: RoomManager, context: Context):
    """
        Get the list of random categories for the game.
    """
    room = manager.rooms.get(context.room_id)
    categories = await load_categories(room.meta_data.settings.language)
    if not categories:
        raise GameError("ERROR", "Something went wrong while fetching categories")
    room.meta_data.fallback_category = random.choice(categories)
    await publish_phase_payload(manager, {
        "event": "PHASE_CATEGORY",
        "data": {
            "round": room.meta_data.current_round,
            "total_rounds": room.meta_data.settings.total_rounds,
            "duration": room.meta_data.settings.vote_time,
            "categories": categories
            }
        }, context.room_id)
    start_phase_timer(manager, context, room, RoomPhase.CATEGORY)



async def get_question(manager: RoomManager, context: Context):
    """
        get a question from the selected category.
    """
    room = manager.rooms.get(context.room_id)
    clear_data(room)
    current_task = asyncio.current_task()
    if room.meta_data.phase.current_state == RoomPhase.CATEGORY:
        if (
            room.meta_data.timer_task
            and room.meta_data.timer_task is not current_task
            and not room.meta_data.timer_task.done()
        ):
            room.meta_data.timer_task.cancel()
        room.meta_data.timer_task = None
        room.meta_data.phase.cycle()
    category = context.data.get("category")
    if category is None:
        category = room.meta_data.fallback_category
    category_id = category.get("id")
    language = room.meta_data.settings.language
    question = await load_question(category_id, language)
    if question is None:
        raise GameError("ERROR", "Something went wrong while fetching the question")
    room.meta_data.active_question = question.get("question")
    room.meta_data.image_url = question.get("image_url")
    room.meta_data.correct_answer = question.get("correct_answer")
    room.meta_data.fake_answers = question.get("fake_answers", [])
    await publish_phase_payload(manager, {
        "event": "PHASE_QUESTION",
        "data": {
            "category": category.get("name"),
            "question": question.get("question"),
            "question_id": question.get("id"),
            "image_url": room.meta_data.image_url,
            "round": room.meta_data.current_round,
            "total_rounds": room.meta_data.settings.total_rounds,
            "duration": room.meta_data.settings.bluff_time
            }
        }, context.room_id)
    start_phase_timer(manager, context, room, RoomPhase.QUESTION)



async def get_vote_choices(manager: RoomManager, context: Context):
    """
        get the vote list for the current question. This includes the correct answer and all bluff answers submitted by players.
    """
    room = manager.rooms.get(context.room_id)
    room.meta_data.voting_choices = build_voting_choices(
        len(room.players),
        room.meta_data.submitted_bluffs,
        room.meta_data.correct_answer,
        room.meta_data.fake_answers,
    )
    public_choices = [
        {
            "id": choice["id"],
            "text": (
                choice["text"].lower()
                if room.meta_data.settings.language == "en"
                else choice["text"]
            ),
        }
        for choice in room.meta_data.voting_choices
    ]
    await publish_phase_payload(manager, {
        "event": "PHASE_VOTING",
        "data": {
            "round": room.meta_data.current_round,
            "total_rounds": room.meta_data.settings.total_rounds,
            "duration": room.meta_data.settings.vote_time,
            "question": {
                "text": room.meta_data.active_question,
                "image_url": room.meta_data.image_url
            },
            "choices": public_choices
            }
        }, context.room_id)
    start_phase_timer(manager, context, room, RoomPhase.VOTE)



async def reveal_results(manager: RoomManager, context: Context):
    """
        Reveal the results of the round, including the correct answer, votes, and updated scores.
    """
    room = manager.rooms.get(context.room_id)
    results, player_stats, choices_by_id = calculate_results(
        votes=room.meta_data.voting_results,
        players=room.players,
        voting_choices=room.meta_data.voting_choices,
    )
    updated_state, newly_unlocked = process_round_achievements(
        player_stats,
        choices_by_id,
        set(room.players),
        room.meta_data.achievement_state,
    )
    results["achievements"] = await save_achievement_candidates(room, updated_state, newly_unlocked)
    room.meta_data.podium = results.get("leaderboard", [])
    results["round"] = room.meta_data.current_round
    results["total_rounds"] = room.meta_data.settings.total_rounds
    room.meta_data.current_round += 1
    await publish_phase_payload(manager, {
        "event": "RESULTS_REVEALED",
        "data": results
    }, context.room_id)



async def podium(manager: RoomManager, context: Context):
    """
        Leaderboard for the current round. This includes the players and their scores for the current round.
    """
    room = manager.rooms.get(context.room_id)
    # if the current round is greater than the total rounds, end the game and reset the room phase to LOBBY
    newly_unlocked = {}
    game_finished = room.meta_data.current_round > room.meta_data.settings.total_rounds
    if game_finished:
        updated_state, newly_unlocked = evaluate_game_achievements(
            {entry["player_id"]: entry["score"] for entry in room.meta_data.podium},
            room.meta_data.achievement_state,
            game_finished=True,
        )
        newly_unlocked = await save_achievement_candidates(room, updated_state, newly_unlocked)
        if not room.meta_data.game_results_saved and not room.meta_data.game_results_saving:
            room.meta_data.game_results_saving = True
            try:
                await save_game_results(
                    game_id=room.meta_data.game_id,
                    host_user_id=room.players[room.meta_data.host_id].db_user_id,
                    total_rounds=room.meta_data.current_round - 1,
                    started_at=room.meta_data.game_started_at,
                    player_results=[
                        {
                            "user_id": room.players[entry["player_id"]].db_user_id,
                            "final_score": entry["score"],
                            "final_rank": entry["rank"],
                        }
                        for entry in room.meta_data.podium
                    ],
                )
                room.meta_data.game_results_saved = True
            except Exception:
                pass
            finally:
                room.meta_data.game_results_saving = False
        room.meta_data.phase.end()
    await publish_phase_payload(manager, {
        "event": "PHASE_PODIUM",
        "data": {
            "round": room.meta_data.current_round,
            "total_rounds": room.meta_data.settings.total_rounds,
            "leaderboard": room.meta_data.podium,
            "achievements": newly_unlocked,
            "game_finished": game_finished,
        }
    }, context.room_id)


game_phases = {
    RoomPhase.CATEGORY : get_categories,
    RoomPhase.QUESTION : get_question,
    RoomPhase.VOTE : get_vote_choices,
    RoomPhase.REVEAL : reveal_results,
    RoomPhase.PODIUM : podium
}


async def to_next_phase(manager: RoomManager, context: Context):
    """
        Transition to the next phase of the game.
        This function is called when the host triggers the next phase
        or when all players have submitted their answers/bluffs/votes
        or when the timer for the current phase has expired.
    """
    room = manager.rooms.get(context.room_id)
    # start game
    if room.meta_data.phase.current_state == RoomPhase.LOBBY:
        present_player_count = sum(
            player.is_present for player in room.players.values()
        )
        if present_player_count < 2:
            raise GameError(
                "NOT_ENOUGH_PLAYERS",
                "At least 2 connected players are required to start the game",
            )
        player_user_ids = {player_id: player.db_user_id for player_id, player in room.players.items()}
        stored = await load_unlocked_achievements(set(player_user_ids.values()))
        room.meta_data.achievement_state = reset_game_progress(room.meta_data.achievement_state)
        room.meta_data.achievement_state["unlocked"] = {
            player_id: stored.get(user_id, set()).copy()
            for player_id, user_id in player_user_ids.items()
        }
        room.meta_data.current_round = 1
        room.meta_data.game_id = uuid4()
        room.meta_data.game_started_at = datetime.now(timezone.utc)
        room.meta_data.game_results_saved = False
        room.meta_data.game_results_saving = False
        clear_data(room)
        for player in room.players.values():
            player.score = 0
        room.meta_data.phase.start()
        await get_categories(manager, context)
        return
    if room.meta_data.phase.current_state not in game_phases:
        raise GameError("INVALID_PHASE", "Cannot advance to next phase from current phase")
    current_task = asyncio.current_task()
    old_timer = room.meta_data.timer_task
    room.meta_data.timer_task = None
    if old_timer and old_timer is not current_task and not old_timer.done():
        old_timer.cancel()
    room.meta_data.phase.cycle()
    handler = game_phases[room.meta_data.phase.current_state]
    await handler(manager, context)



async def submit_bluff(manager: RoomManager, context: Context):
    room = manager.rooms.get(context.room_id)
    bluff_answer = context.data.get("bluff_answer")
    if bluff_answer is None:
        raise GameError("INVALID_PAYLOAD", "Missing bluff answer in request")
    validate_bluff = validate_bluff_answer(bluff_answer, room.meta_data.correct_answer)
    if not validate_bluff.get("is_valid"):
        raise GameError("BLUFF_REJECTED", validate_bluff.get("reason", "EXACT_TRUTH"))
    room.meta_data.submitted_bluffs[context.user_id] = bluff_answer
    if len(room.meta_data.submitted_bluffs) >= len(room.players):
        await to_next_phase(manager, context)
    else:
        await manager.broadcast({
            "event": "BLUFF_SUBMITTED",
            "data": {
                "player_id": context.user_id,
            }
        }, context.room_id, None)





async def submit_vote(manager: RoomManager, context: Context):
    room = manager.rooms.get(context.room_id)
    vote_choice = context.data.get("choice_id")
    if vote_choice is None:
        raise GameError("INVALID_PAYLOAD", "Missing vote choice in request")
    validation = validate_vote(
        voter_id=context.user_id,
        choice_id=vote_choice,
        choices=room.meta_data.voting_choices,
        votes=room.meta_data.voting_results,
        player_ids=set(room.players.keys()),
    )

    if not validation["is_valid"]:
        raise GameError(
            "VOTE_REJECTED",
            f"{validation['reason']}",
        )

    room.meta_data.voting_results[context.user_id] = vote_choice
    if len(room.meta_data.voting_results) >= len(room.players):
        await to_next_phase(manager, context)
    else:
        await manager.broadcast({
            "event": "VOTE_SUBMITTED",
            "data": {
                "player_id": context.user_id,
            }
        }, context.room_id, None)





async def kick_player(manager: RoomManager, context: Context):
    """
        Kick a player from the room. Only the host can kick players.
    """
    room = manager.rooms.get(context.room_id)
    if context.user_id != room.meta_data.host_id:
        raise GameError("FORBIDDEN", "Only the host can kick players")
    player_id = context.data.get("player_id")
    if player_id not in room.players:
        raise GameError("PLAYER_NOT_FOUND", "Player not found in the room")
    await manager.remove_connection(player_id, context.room_id)
    await manager.broadcast(lobby_update(room), context.room_id, None)



async def update_settings(manager: RoomManager, context: Context):
    room = manager.rooms.get(context.room_id)
    if context.user_id != room.meta_data.host_id:
        raise GameError("FORBIDDEN", "Only the host can update settings")
    try:
        total_rounds = context.data.get("total_rounds")
        bluff_time = context.data.get("bluff_time")
        vote_time = context.data.get("vote_time")
        max_players = context.data.get("max_players")
        language = context.data.get("language")
        new_settings = RoomSettings(total_rounds=total_rounds, bluff_time=bluff_time,
                        vote_time=vote_time, max_players=max_players, language=language)
        room.meta_data.settings = new_settings
        await manager.broadcast(lobby_update(room), context.room_id, None)
    except Exception:
        raise GameError("INVALID_PAYLOAD", "Invalid settings in request")


async def return_to_lobby(manager: RoomManager, context: Context):
    """Reset match progress and return every player to the existing lobby."""
    room = manager.rooms.get(context.room_id)
    if context.user_id != room.meta_data.host_id:
        raise GameError("FORBIDDEN", "Only the host can return to the lobby")
    if room.meta_data.phase.current_state == RoomPhase.PODIUM:
        room.meta_data.phase.end()
    elif room.meta_data.phase.current_state != RoomPhase.LOBBY:
        raise GameError("INVALID_PHASE", "The game has not finished yet")

    if room.meta_data.timer_task and not room.meta_data.timer_task.done():
        room.meta_data.timer_task.cancel()
    room.meta_data.timer_task = None
    room.meta_data.phase_payload = None
    room.meta_data.phase_deadline = None
    room.meta_data.current_round = 1
    room.meta_data.achievement_state = reset_game_progress(room.meta_data.achievement_state)
    room.meta_data.fallback_category = {}
    room.meta_data.podium = []
    clear_data(room)
    for player in room.players.values():
        player.score = 0

    update = lobby_update(room)
    await manager.broadcast({
        "event": "RETURNED_TO_LOBBY",
        "data": update["data"],
    }, context.room_id, None)



async def handle_chat_message(manager: RoomManager, context: Context):
    """
        Handle a chat message sent by a player in the room.
    """
    room = manager.rooms.get(context.room_id)
    message = context.data.get("message")
    if message is None or len(message.strip()) == 0:
        raise GameError("INVALID_PAYLOAD", "Missing or empty chat message in request")
    player_info = room.players.get(context.user_id)
    if player_info is None:
        raise GameError("PLAYER_NOT_FOUND", "Player not found in the room")
    await manager.broadcast({
        "event": "CHAT_MESSAGE",
        "data": {
            "player" : {
                "id": context.user_id,
                "username": player_info.name,
                "avatar_url": player_info.avatar_url
            },
            "message": message
        }
    }, context.room_id, None)

event_handlers = {
    "NEXT_PHASE" : to_next_phase,
    "GET_QUESTION" : get_question,
    "SUBMIT_BLUFF" : submit_bluff,
    "SUBMIT_VOTE" : submit_vote,
    "LEAVE_ROOM" : leave_room,
    "KICK_PLAYER" : kick_player,
    "UPDATE_SETTINGS" : update_settings,
    "RETURN_TO_LOBBY" : return_to_lobby,
    "CHAT_MESSAGE" : handle_chat_message,
}


async def process_event(manager: RoomManager, room_id: str, user_id: str, user_name: str, event_name: str, data: dict
            ) -> None:
    """
        Process incoming events from the client and return a payload to broadcast to all players in the room,
        or raise a GameError if the event is invalid or cannot be processed.
    """
    if event_name not in event_handlers:
        raise GameError("INVALID_PAYLOAD", "Invalid event")
    room = manager.rooms.get(room_id)
    if room is None:
        raise GameError("ROOM_NOT_FOUND", "Room not found")
    if data is None:
        raise GameError("INVALID_PAYLOAD", "Missing data in request")
    async with room.meta_data.phase_lock:
        if manager.rooms.get(room_id) is not room:
            raise GameError("ROOM_NOT_FOUND", "Room not found")
        if user_id not in room.players:
            raise GameError("PLAYER_NOT_FOUND", "Player not found in the room")
        validate_phase(room.meta_data.phase.current_state, event_name)
        handler = event_handlers[event_name]
        context = Context(room_id=room_id, user_id=user_id, user_name=user_name, data=data)
        await handler(manager, context)
