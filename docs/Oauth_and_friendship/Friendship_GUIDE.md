# Friendship API

Friend requests and accepted friendships are persisted in PostgreSQL by
`friendship/repository.py`, using the shared `Friendship` model and per-request
async sessions. All endpoints require an application JWT from the login cookie or
Authorization bearer header. The authenticated user ID comes from the database-backed
`get_current_user` dependency.

## Endpoints

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/friends/` | List accepted friends in either direction |
| GET | `/friends/search?prefix=ham` | Return up to 10 other players whose usernames start with the prefix, sorted by normalized username |
| POST | `/friends/request/{user_id}` | Send a request to another existing user |
| GET | `/friends/requests` | List incoming pending requests |
| GET | `/friends/requests/sent` | List outgoing pending requests |
| POST | `/friends/accept/{sender_id}` | Accept a pending request addressed to you |
| POST | `/friends/reject/{sender_id}` | Delete a pending request addressed to you |
| DELETE | `/friends/request/{receiver_id}` | Cancel a pending request you sent |
| DELETE | `/friends/{friend_id}` | Remove an accepted friendship in either direction |

List and search responses contain `{ "id": "123", "username": "Player", "avatar_url": "/uploads/123_avatar.png" }` objects. `avatar_url` is nullable. Search requires a 1–15 character prefix containing only letters and numbers, and matches without regard to case. Other characters return 422.
IDs in responses remain strings; path parameters must be positive database integers.
Existing success messages are preserved. Invalid friendship actions return 400,
invalid path IDs return 422, and missing/invalid authentication returns 401.

## Persistence and concurrency

- New requests are stored with status `pending`; acceptance changes it to `accepted`.
- Rejecting or canceling deletes the pending row, preserving the ability to resend.
- Removing a friend deletes the accepted row.
- Existing `rejected` rows can be reused for a new request in either direction.
- The unordered-pair unique index prevents duplicate and crossed requests.
- Conditional updates/deletes ensure that only one competing accept/cancel action
  succeeds and that callers can only modify their own relationships.
- Mutations commit before returning success. Restarting the API does not lose data.

Apply the existing migrations with `uv run alembic upgrade head` from `backend/`.
No additional migration is required specifically for friendship persistence.
See [database setup and tests](../../authentication/docs/database.md) for the
connection settings and PostgreSQL integration test command.
