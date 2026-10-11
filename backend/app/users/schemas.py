from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from typing import Annotated, Literal
from uuid import UUID

from authentication.schemas import validate_username


class UserStatistics(BaseModel):
    total_games: Annotated[int, Field(ge=0)] = 0
    total_wins: Annotated[int, Field(ge=0)] = 0
    total_points: Annotated[int, Field(ge=0)] = 0
    high_score: Annotated[int, Field(ge=0)] = 0

class UserCategoryAnalytics(BaseModel):
    category: Annotated[str, Field(min_length=1, max_length=50)]
    total_rounds: Annotated[int, Field(ge=0)]
    knowledge_accuracy: Annotated[float, Field(ge=0)]
    bluff_efficiency: Annotated[float, Field(ge=0)]

class UserAchievements(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=50)]
    description: Annotated[str, Field(min_length=1, max_length=100)]
    img: Annotated[str, Field(min_length=3, max_length=50)]
    unlocked: bool = False

class UserProfile(BaseModel, arbitrary_types_allowed=True):
    id: Annotated[int, Field(ge=0)]
    username: Annotated[str, Field(min_length=1, max_length=15)]
    banner: Annotated[str | None, Field(min_length=3)] = None
    avatar: Annotated[str | None, Field(min_length=3)] = None
    joined_date: datetime
    stats: UserStatistics
    achievements: list[UserAchievements]
    analytics: list[UserCategoryAnalytics]


class HistoryParticipant(BaseModel):
    username: str
    avatar_url: str | None = None
    final_score: int = Field(ge=0)
    final_rank: int = Field(ge=1)
    is_current_user: bool = False


class GameHistoryItem(BaseModel):
    match_id: UUID
    finished_at: datetime
    placement: int = Field(ge=1)
    final_score: int = Field(ge=0)
    result: Literal["WIN", "LOSS", "DRAW"]
    participant_count: int = Field(ge=1)
    participants: list[HistoryParticipant]
    total_rounds: int = Field(ge=1)
    status: Literal["COMPLETED"] = "COMPLETED"


class GameHistorySummary(BaseModel):
    games_played: int = Field(ge=0)
    wins: int = Field(ge=0)
    win_rate: float = Field(ge=0, le=100)
    total_points: int = Field(ge=0)


class GameHistoryResponse(BaseModel):
    items: list[GameHistoryItem]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)
    summary: GameHistorySummary

class UserProfileUpdateRequest(BaseModel):
    username: Annotated[str, validate_username]
    email: Annotated[EmailStr, Field(min_length=5, max_length=50)]