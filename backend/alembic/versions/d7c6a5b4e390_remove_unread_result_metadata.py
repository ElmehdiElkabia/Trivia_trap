"""Remove result and achievement values with no current readers.

Revision ID: d7c6a5b4e390
Revises: d4e5f6a7b8c9
"""

from alembic import op
import sqlalchemy as sa


revision = "d7c6a5b4e390"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "check_game_player_result_bluff_votes",
        "game_player_results",
        type_="check",
    )
    op.drop_column("game_player_results", "bluff_votes_received")
    op.drop_column("games", "language_code")
    op.drop_column("user_achievements", "description")
    op.drop_column("user_achievements", "img")


def downgrade() -> None:
    # The old values cannot be reconstructed after upgrade. Backfill valid
    # placeholders so existing rows satisfy their original NOT NULL columns.
    op.add_column(
        "user_achievements",
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "user_achievements",
        sa.Column("img", sa.String(length=50), nullable=False, server_default=""),
    )
    op.alter_column("user_achievements", "description", server_default=None)
    op.alter_column("user_achievements", "img", server_default=None)

    op.add_column(
        "games",
        sa.Column("language_code", sa.String(length=5), nullable=False, server_default="en"),
    )
    op.alter_column("games", "language_code", server_default=None)

    op.add_column(
        "game_player_results",
        sa.Column(
            "bluff_votes_received", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.create_check_constraint(
        "check_game_player_result_bluff_votes",
        "game_player_results",
        "bluff_votes_received >= 0",
    )
