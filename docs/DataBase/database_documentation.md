# Database Documentation

## Overview

The Trivia Trap backend uses **PostgreSQL** with **SQLAlchemy ORM** and **Alembic** for database migrations.

The database stores users, trivia content, game results, friendships, room invitations, and achievements.

---

## `users`

Stores user account and authentication data.

| Field | Purpose |
|---|---|
| `id` | User ID |
| `username` | Public username |
| `username_key` | Normalized username |
| `email` | User email |
| `email_key` | Normalized email |
| `avatar_url` | Profile image |
| `cover_url` | Profile cover image |
| `password_hash` | Password authentication |
| `google_sub` | Google authentication ID |
| `auth_version` | Authentication/session version |
| `reset_digest` | Password reset token digest |
| `reset_expires` | Password reset expiration |
| `reset_sent_at` | Password reset request time |
| `created_at` | Account creation time |

Rules:
- A user must have either a password or a Google account.
- Username and email identities must stay unique.

---

## `categories`

Stores trivia categories.

| Field | Purpose |
|---|---|
| `id` | Category ID |
| `image_url` | Category image |

---

## `category_translations`

Stores translated category names.

| Field | Purpose |
|---|---|
| `category_id` | Category ID |
| `language_code` | Language code such as `en` or `ar` |
| `name` | Category name in that language |

Rules:
- One translation per category and language.
- The same category name cannot be duplicated in the same language.

---

## `questions`

Stores trivia questions.

| Field | Purpose |
|---|---|
| `id` | Question ID |
| `category_id` | Question category |
| `language_code` | Question language |
| `question_text` | Question text |
| `correct_answer` | Correct answer |
| `image_url` | Optional question image |

---

## `question_decoys`

Stores incorrect answers for questions.

| Field | Purpose |
|---|---|
| `id` | Decoy ID |
| `question_id` | Related question |
| `decoy_text` | Incorrect answer text |

Rules:
- The same decoy cannot be repeated for the same question.

---

## `games`

Stores completed game information.

| Field | Purpose |
|---|---|
| `id` | Game UUID |
| `host_user_id` | Game host |
| `total_rounds` | Number of rounds |
| `started_at` | Game start time |
| `finished_at` | Game end time |

Rules:
- `total_rounds` must be greater than `0`.
- `finished_at` cannot be before `started_at`.

---

## `game_player_results`

Stores the final result of each player in a game.

| Field | Purpose |
|---|---|
| `game_id` | Game ID |
| `user_id` | Player ID |
| `final_score` | Final score |
| `final_rank` | Final position |

Rules:
- `final_score` cannot be negative.
- `final_rank` must be at least `1`.

---

## `friendships`

Stores friendship requests and friendship status.

| Field | Purpose |
|---|---|
| `requester_id` | User who sent the request |
| `receiver_id` | User who received the request |
| `status` | `pending`, `accepted`, or `rejected` |
| `created_at` | Creation time |

Rules:
- A user cannot send a friend request to themselves.
- Only valid friendship statuses are allowed.
- The same pair of users cannot have duplicate friendship rows.

---

## `room_invitations`

Stores invitations to join a game room.

| Field | Purpose |
|---|---|
| `id` | Invitation UUID |
| `sender_id` | User sending the invitation |
| `recipient_id` | Invited user |
| `room_code` | Room code |
| `status` | `pending`, `accepted`, `declined`, or `expired` |
| `created_at` | Creation time |
| `expires_at` | Expiration time |

Rules:
- Only valid invitation statuses are allowed.
- The same active pending invitation cannot be duplicated for the same sender, recipient, and room.

---

## `user_achievements`

Stores achievement state for each user.

| Field | Purpose |
|---|---|
| `user_id` | User ID |
| `achievement_code` | Achievement identifier |
| `unlocked` | Whether the achievement is unlocked |

Rules:
- Each user has one row per achievement code.

---

## Summary

The current database contains:

- users and authentication data
- categories and translations
- questions and decoy answers
- completed games and final player results
- friendships
- room invitations
- user achievements

Unused per-category game analytics are not part of the current schema.
