from .database import AsyncSessionLocal
from .ingestion import (
    get_category_list,
    get_random_question,
)


async def load_categories(
    language_code: str,
) -> list[dict] | None:
    async with AsyncSessionLocal() as session:
        return await get_category_list(
            session=session,
            language_code=language_code,
        )


async def load_question(
    category_id: int,
    language_code: str,
) -> dict | None:
    async with AsyncSessionLocal() as session:
        return await get_random_question(
            session=session,
            category_id=category_id,
            language_code=language_code,
        )

from datetime import datetime, timezone
from uuid import UUID

from .database import AsyncSessionLocal
from .models import (
    Game,
    GamePlayerCategoryResult,
    GamePlayerResult,
)


async def save_game_results(
    *,
    game_id: UUID,
    host_user_id: int,
    total_rounds: int,
    started_at: datetime,
    player_results: list[dict],
    category_results: list[dict],
) -> UUID:
    if not isinstance(host_user_id, int):
        raise ValueError("host_user_id must be an integer")

    if total_rounds < 1:
        raise ValueError("total_rounds must be positive")

    finished_at = datetime.now(timezone.utc)

    async with AsyncSessionLocal.begin() as session:
        if await session.get(Game, game_id) is not None:
            return game_id
        game = Game(
            id=game_id,
            host_user_id=host_user_id,
            total_rounds=total_rounds,
            started_at=started_at,
            finished_at=finished_at,
        )

        session.add(game)

        await session.flush()

        game_id = game.id

        results = [
            GamePlayerResult(
                game_id=game_id,
                user_id=result["user_id"],
                final_score=result["final_score"],
                final_rank=result["final_rank"],
            )
            for result in player_results
        ]

        session.add_all(results)

        await session.flush()

        category_statistics = [
            GamePlayerCategoryResult(
                game_id=game_id,
                user_id=result["user_id"],
                category_id=result["category_id"],
                questions_played=result["questions_played"],
                correct_answers=result["correct_answers"],
                bluff_votes_received=result["bluff_votes_received"],
            )
            for result in category_results
        ]

        session.add_all(category_statistics)

    return game_id
