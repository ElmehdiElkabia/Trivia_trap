from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from .database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )
    image_url: Mapped[str | None] = mapped_column(Text)

    translations: Mapped[list["CategoryTranslation"]] = relationship(
        back_populates="category",
        cascade="all, delete-orphan",
    )
    questions: Mapped[list["Question"]] = relationship(
        back_populates="category",
        passive_deletes=True,
    )
    player_results: Mapped[list["GamePlayerCategoryResult"]] = relationship(
        back_populates="category",
        passive_deletes=True,
    )


class CategoryTranslation(Base):
    __tablename__ = "category_translations"
    __table_args__ = (
        UniqueConstraint(
            "language_code",
            "name",
            name="uq_category_translation_language_name",
        ),
    )

    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    )
    language_code: Mapped[str] = mapped_column(
        String(5),
        primary_key=True,
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    category: Mapped["Category"] = relationship(
        back_populates="translations",
    )


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        Index(
            "ix_questions_category_language",
            "category_id",
            "language_code",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey(
            "categories.id",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )
    language_code: Mapped[str] = mapped_column(
        String(5),
        nullable=False,
    )
    question_text: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    correct_answer: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )
    image_url: Mapped[str | None] = mapped_column(Text)

    category: Mapped["Category"] = relationship(
        back_populates="questions",
    )
    decoys: Mapped[list["QuestionDecoy"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class QuestionDecoy(Base):
    __tablename__ = "question_decoys"
    __table_args__ = (
        UniqueConstraint(
            "question_id",
            "decoy_text",
            name="uq_question_decoy_text",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey(
            "questions.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    decoy_text: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    question: Mapped["Question"] = relationship(
        back_populates="decoys",
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "password_hash IS NOT NULL OR google_sub IS NOT NULL",
            name="check_user_if_has_auth_method",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True,
    )
    username: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        unique=True,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
    )
    avatar_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    cover_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    password_hash: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    google_sub: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        unique=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Preserve the casefold matching used by authentication, including Unicode.
    username_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    email_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    auth_version: Mapped[int] = mapped_column(
        nullable=False, default=0, server_default=text("0"),
    )
    reset_digest: Mapped[str | None] = mapped_column(String(64), index=True)
    reset_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reset_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @validates("username", "email")
    def normalize_identity(self, key: str, value: str) -> str:
        setattr(self, f"{key}_key", value.casefold())
        return value

    hosted_games: Mapped[list["Game"]] = relationship(
        back_populates="host",
    )
    game_results: Mapped[list["GamePlayerResult"]] = relationship(
        back_populates="user",
    )
    achievements: Mapped[list["UserAchievement"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    sent_friendships: Mapped[list["Friendship"]] = relationship(
        back_populates="requester",
        foreign_keys="Friendship.requester_id",
        passive_deletes=True,
    )
    received_friendships: Mapped[list["Friendship"]] = relationship(
        back_populates="receiver",
        foreign_keys="Friendship.receiver_id",
        passive_deletes=True,
    )


class Game(Base):
    __tablename__ = "games"
    __table_args__ = (
        CheckConstraint(
            "finished_at IS NULL OR finished_at >= started_at",
            name="check_game_valid_dates",
        ),
        CheckConstraint(
            "total_rounds > 0",
            name="check_game_total_rounds",
        ),
        Index(
            "ix_games_host_user_id",
            "host_user_id",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    host_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    total_rounds: Mapped[int] = mapped_column(
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    host: Mapped["User"] = relationship(
        back_populates="hosted_games",
    )
    player_results: Mapped[list["GamePlayerResult"]] = relationship(
        back_populates="game",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class GamePlayerResult(Base):
    __tablename__ = "game_player_results"

    __table_args__ = (
        CheckConstraint(
            "final_score >= 0",
            name="check_game_player_result_score",
        ),
        CheckConstraint(
            "final_rank >= 1",
            name="check_game_player_result_rank",
        ),
        Index(
            "ix_game_player_results_user_id",
            "user_id",
        ),
    )

    game_id: Mapped[UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    final_score: Mapped[int] = mapped_column(
        nullable=False,
        server_default=text("0"),
    )
    final_rank: Mapped[int] = mapped_column(
        nullable=False,
    )
    game: Mapped["Game"] = relationship(
        back_populates="player_results",
    )
    user: Mapped["User"] = relationship(
        back_populates="game_results",
    )
    category_results: Mapped[list["GamePlayerCategoryResult"]] = relationship(
        back_populates="game_player_result",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class GamePlayerCategoryResult(Base):
    __tablename__ = "game_player_category_results"
    __table_args__ = (
        ForeignKeyConstraint(
            ["game_id", "user_id"],
            [
                "game_player_results.game_id",
                "game_player_results.user_id",
            ],
            ondelete="CASCADE",
            name="fk_player_category_result_game_player",
        ),
        CheckConstraint(
            "questions_played >= 0",
            name="check_player_category_questions",
        ),
        CheckConstraint(
            "correct_answers >= 0",
            name="check_player_category_correct_answers",
        ),
        CheckConstraint(
            "correct_answers <= questions_played",
            name="check_player_category_valid_answers",
        ),
        Index(
            "ix_player_category_results_user_category",
            "user_id",
            "category_id",
        ),
    )

    game_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
    )
    user_id: Mapped[int] = mapped_column(
        primary_key=True,
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    questions_played: Mapped[int] = mapped_column(
        nullable=False,
        server_default=text("0"),
    )
    correct_answers: Mapped[int] = mapped_column(
        nullable=False,
        server_default=text("0"),
    )
    bluff_votes_received: Mapped[int] = mapped_column(
        nullable=False,
        server_default=text("0"),
    )

    game_player_result: Mapped["GamePlayerResult"] = relationship(
        back_populates="category_results",
    )
    category: Mapped["Category"] = relationship(
        back_populates="player_results",
    )


class Friendship(Base):
    __tablename__ = "friendships"

    requester_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    receiver_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default=text("'pending'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "requester_id <> receiver_id",
            name="check_friendship_not_self",
        ),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected')",
            name="check_friendship_status",
        ),
        Index(
            "ix_friendships_receiver_id",
            "receiver_id",
        ),
        Index(
            "uq_friendship_user_pair",
            func.least(requester_id, receiver_id),
            func.greatest(requester_id, receiver_id),
            unique=True,
        ),
    )

    requester: Mapped["User"] = relationship(
        back_populates="sent_friendships",
        foreign_keys=[requester_id],
    )
    receiver: Mapped["User"] = relationship(
        back_populates="received_friendships",
        foreign_keys=[receiver_id],
    )


class RoomInvitation(Base):
    __tablename__ = "room_invitations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'expired')",
            name="check_room_invitation_status",
        ),
        Index("ix_room_invitations_recipient_status", "recipient_id", "status"),
        Index(
            "uq_room_invitation_active",
            "sender_id", "recipient_id", "room_code",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    room_code: Mapped[str] = mapped_column(String(6), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'pending'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    achievement_code: Mapped[str] = mapped_column(
        String(50),
        primary_key=True,
    )
    unlocked: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    user: Mapped["User"] = relationship(
        back_populates="achievements",
    )
