from dataProcessing.models import User
from authentication.repository import find_user_by_username
from sqlalchemy.orm import Session
from sqlalchemy import select, func, case
from sqlalchemy.orm import aliased, selectinload
from typing import Annotated
from fastapi import Depends
from dataProcessing.database import get_db
from dataProcessing.models import User, GamePlayerResult, UserAchievement
from dataProcessing.achievement_persistence import ACHIEVEMENT_DEFINITIONS
from .schemas import (
    UserStatistics, UserProfile, UserAchievements as achievements, GameHistoryResponse, GameHistoryItem,
    GameHistorySummary, HistoryParticipant,
)
from dataProcessing.models import Game
from fastapi import HTTPException, status


async def get_user_statistics(db: Annotated[Session, Depends(get_db)], user_id: int) -> UserStatistics:
    user_stats = UserStatistics()
    statement = select(
        func.count(GamePlayerResult.user_id).label("total_games"),
        func.sum(case((GamePlayerResult.final_rank == 1, 1), else_= 0)).label("total_wins"),
        func.sum(GamePlayerResult.final_score).label("total_points"),
        func.max(GamePlayerResult.final_score).label("high_score")
    ).where(GamePlayerResult.user_id == user_id)

    try:
        stats = (await db.execute(statement)).first()
        user_stats.total_games = stats.total_games or 0
        user_stats.total_wins = stats.total_wins or 0
        user_stats.total_points = stats.total_points or 0
        user_stats.high_score = stats.high_score or 0
    except Exception:
        pass
    return user_stats



async def get_user_achievements(db: Annotated[Session, Depends(get_db)], user_id: int):
    statement = select(UserAchievement.achievement_code).where(
        UserAchievement.user_id == user_id,
        UserAchievement.unlocked.is_(True),
    )
    unlocked_codes = set((await db.execute(statement)).scalars().all())
    return [
        achievements(name=code, description=description, img=img,
                     unlocked=code in unlocked_codes)
        for code, (description, img) in ACHIEVEMENT_DEFINITIONS.items()
    ]



async def build_user_profile(session: Annotated[Session, Depends(get_db)],
                   user_id: int = None,
                   username: str = None,
                   language: str = 'en') -> UserProfile:
    """
        builds a user profile based on the provided user_id or username.
        If both are provided, user_id takes precedence.
    """
    user = None
    try:
        if user_id is not None:
            user = await session.get(User, user_id)
        elif username is not None:
            user = await find_user_by_username(session, username)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return UserProfile(
        id=user.id,
        username=user.username,
        banner=user.cover_url,
        avatar=user.avatar_url,
        joined_date=user.created_at,
        stats=await get_user_statistics(session, user.id),
        achievements=await get_user_achievements(session, user.id),
    )


async def update_avatar_path(
        session: Annotated[Session, Depends(get_db)],
        user_id: int,
        avatar_path: str,
    ) -> None:
    """
        Updates the avatar URL of a user in the database.
    """
    try:
        user = await session.get(User, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        user.avatar_url = avatar_path
        await session.commit()
        await session.refresh(user)
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user profile: {str(e)}",
        )


async def get_user_game_history(
    session,
    user_id: int,
    *,
    limit: int,
    offset: int,
    result_filter: str,
) -> GameHistoryResponse:
    own_result = aliased(GamePlayerResult)
    filters = [
        own_result.user_id == user_id,
        Game.finished_at.is_not(None),
    ]
    if result_filter == "wins":
        filters.append(own_result.final_rank == 1)
    elif result_filter == "losses":
        filters.append(own_result.final_rank != 1)

    total = await session.scalar(
        select(func.count()).select_from(Game).join(
            own_result, own_result.game_id == Game.id
        ).where(*filters)
    ) or 0
    game_ids = (await session.scalars(
        select(Game.id).join(
            own_result, own_result.game_id == Game.id
        ).where(*filters).order_by(Game.finished_at.desc(), Game.id).limit(limit).offset(offset)
    )).all()

    games = []
    if game_ids:
        loaded = (await session.scalars(
            select(Game).where(Game.id.in_(game_ids)).options(
                selectinload(Game.player_results).selectinload(GamePlayerResult.user)
            )
        )).all()
        games_by_id = {game.id: game for game in loaded}
        games = [games_by_id[game_id] for game_id in game_ids]

    items = []
    for game in games:
        own = next(row for row in game.player_results if row.user_id == user_id)
        outcome = "WIN" if own.final_rank == 1 else "LOSS"
        ordered_results = sorted(game.player_results, key=lambda row: row.final_rank)
        items.append(GameHistoryItem(
            match_id=game.id,
            finished_at=game.finished_at,
            placement=own.final_rank,
            final_score=own.final_score,
            result=outcome,
            participant_count=len(ordered_results),
            participants=[HistoryParticipant(
                username=row.user.username,
                avatar_url=row.user.avatar_url,
                final_score=row.final_score,
                final_rank=row.final_rank,
                is_current_user=row.user_id == user_id,
            ) for row in ordered_results],
            total_rounds=game.total_rounds,
        ))

    summary_row = (await session.execute(
        select(
            func.count(GamePlayerResult.game_id),
            func.sum(case((GamePlayerResult.final_rank == 1, 1), else_=0)),
            func.sum(GamePlayerResult.final_score),
        ).join(Game, Game.id == GamePlayerResult.game_id).where(
            GamePlayerResult.user_id == user_id,
            Game.finished_at.is_not(None),
        )
    )).one()
    games_played = summary_row[0] or 0
    wins = summary_row[1] or 0
    return GameHistoryResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        summary=GameHistorySummary(
            games_played=games_played,
            wins=wins,
            win_rate=(wins / games_played * 100) if games_played else 0,
            total_points=summary_row[2] or 0,
        ),
    )
