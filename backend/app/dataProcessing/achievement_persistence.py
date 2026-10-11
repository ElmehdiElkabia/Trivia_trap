"""PostgreSQL storage for the seven live achievement unlocks."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from .database import AsyncSessionLocal
from .models import UserAchievement


ACHIEVEMENT_DEFINITIONS = {
    "FIRST_CORRECT": ("Choose the correct answer for the first time", "/achievements/first_correct.png"),
    "FIRST_BLUFF": ("Receive a vote for your bluff for the first time", "/achievements/first_bluff.png"),
    "ROUND_STAR": ("Earn at least seven points in one round", "/achievements/round_star.png"),
    "PERFECT_ROUND": ("Answer correctly and receive three bluff votes in a round", "/achievements/perfect_round.png"),
    "PERFECT_BLUFF": ("Convince every eligible player to vote for your bluff", "/achievements/perfect_bluff.png"),
    "SHARP_EYE": ("Answer correctly in five rounds of one game", "/achievements/sharp_eye.png"),
    "HIGH_SCORER": ("Finish a game with at least twenty points", "/achievements/high_scorer.png"),
}


async def load_unlocked_achievements(user_ids: set[int]) -> dict[int, set[str]]:
    """Read permanent unlocks for authenticated database users."""
    if not user_ids:
        return {}
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(UserAchievement.user_id, UserAchievement.achievement_code).where(
                UserAchievement.user_id.in_(user_ids),
                UserAchievement.unlocked.is_(True),
            )
        )).all()
    unlocked = {user_id: set() for user_id in user_ids}
    for user_id, code in rows:
        unlocked[user_id].add(code)
    return unlocked


async def save_unlocked_achievements(unlocks: dict[int, list[str]]) -> dict[int, list[str]]:
    """Atomically insert or enable unlocks; report only newly enabled rows."""
    values = []
    for user_id, codes in unlocks.items():
        if type(user_id) is not int:
            raise ValueError("Achievement user IDs must come from authenticated database users")
        for code in dict.fromkeys(codes):
            if code not in ACHIEVEMENT_DEFINITIONS:
                raise KeyError(code)
            values.append({
                "user_id": user_id,
                "achievement_code": code,
                "unlocked": True,
            })
    if not values:
        return {}

    statement = insert(UserAchievement).values(values)
    statement = statement.on_conflict_do_update(
        index_elements=[UserAchievement.user_id, UserAchievement.achievement_code],
        set_={
            "unlocked": True,
        },
        where=UserAchievement.unlocked.is_(False),
    ).returning(UserAchievement.user_id, UserAchievement.achievement_code)
    async with AsyncSessionLocal.begin() as session:
        rows = (await session.execute(statement)).all()
    saved: dict[int, set[str]] = {}
    for user_id, code in rows:
        saved.setdefault(user_id, set()).add(code)
    return {
        user_id: [code for code in dict.fromkeys(unlocks[user_id]) if code in codes]
        for user_id, codes in saved.items()
    }


async def persist_new_achievements(
    newly_unlocked: dict[str, list[str]], player_user_ids: dict[str, int],
) -> dict[str, list[str]]:
    """Bridge room player IDs to trusted database IDs without parsing strings."""
    by_user = {player_user_ids[player_id]: codes for player_id, codes in newly_unlocked.items()}
    inserted = await save_unlocked_achievements(by_user)
    return {
        player_id: inserted[user_id]
        for player_id, user_id in player_user_ids.items()
        if user_id in inserted
    }
