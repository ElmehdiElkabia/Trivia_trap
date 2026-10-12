"""Drop unused game player category results.

Revision ID: dd6eaad59dfb
Revises: d7c6a5b4e390
Create Date: 2026-10-12 18:15:22.214094

"""
from alembic import op
import sqlalchemy as sa


revision = "dd6eaad59dfb"
down_revision = "d7c6a5b4e390"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("game_player_category_results")


def downgrade() -> None:
    # The old rows cannot be reconstructed after upgrade.
    op.create_table(
        "game_player_category_results",
        sa.Column("game_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("questions_played", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("correct_answers", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("bluff_votes_received", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.CheckConstraint("questions_played >= 0", name="check_player_category_questions"),
        sa.CheckConstraint("correct_answers >= 0", name="check_player_category_correct_answers"),
        sa.CheckConstraint("correct_answers <= questions_played", name="check_player_category_valid_answers"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["game_id", "user_id"],
            ["game_player_results.game_id", "game_player_results.user_id"],
            name="fk_player_category_result_game_player",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("game_id", "user_id", "category_id"),
    )
    op.create_index(
        "ix_player_category_results_user_category",
        "game_player_category_results",
        ["user_id", "category_id"],
    )
