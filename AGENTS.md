# Trivia Trap: agent operating manual

This file describes the repository as checked in. Before changing behavior, confirm it in the relevant code and its callers. Examples in documentation are not automatically the current contract.

## Project overview and stack

- The backend is a FastAPI application on Python >=3.13. It uses Pydantic, `python-statemachine`, async SQLAlchemy/`asyncpg`, Alembic, and `uv` (`backend/pyproject.toml`, `backend/uv.lock`).
- The frontend is Next.js 16, React 19, TypeScript, and Tailwind CSS. `frontend/package.json` declares pnpm; both `pnpm-lock.yaml` and `package-lock.json` are present. The frontend Makefile uses pnpm.
- PostgreSQL is the persistent data store. The application and Alembic both specify the local URL in `backend/app/dataProcessing/database.py` and `backend/alembic.ini`. Docker Compose persists uploaded avatars in the `backend_uploads` volume mounted at `/app/uploads`. Live room state is held in the backend process; Redis is not integrated.
- Docker Compose stores the PostgreSQL, JWT, SMTP, and Grafana credentials in Vault. Vault Agent injects the backend credentials into the FastAPI process. On first initialization, `vault-bootstrap` reads SMTP from the Git-ignored `secrets/smtp_password` file mounted read-only; delete the file after bootstrap. SMTP is not stored in `.env` or backend container metadata.

## Repository map

| Location | Current responsibility |
| --- | --- |
| `backend/app/main.py` | FastAPI setup and HTTP/WebSocket routers; `GET /rooms` exposes the in-process room list. |
| `backend/app/engine/` | WebSocket room manager, Pydantic room state, phase machine, event handling, and broadcasts. |
| `backend/app/dataProcessing/` | Async database sessions and ORM models; question/category reads, bluff/vote rules, scoring, seed import, and a game-result save helper. |
| `backend/app/authentication/`, `backend/app/users/` | HTTP account authentication, password reset, and profile queries. |
| `backend/app/data/questions/` | JSON question sources. The seed loader reads top-level `*.json` files and ignores `drafts/`. |
| `backend/alembic/`, `backend/scripts/` | Schema migrations and local PostgreSQL bootstrap. |
| `frontend/src/app/`, `frontend/src/lib/websocket/`, `frontend/src/hooks/`, `frontend/src/stores/` | Routes, WebSocket client/parser, game hook, and client state. `frontend/src/mocks/` supplies development examples. |
| `docs/`, `backend/docs/` | WebSocket and question documentation; check examples against code. |

## Implemented game behavior

- A new room defaults to 10 maximum players, 10 rounds, 20 seconds for bluffs, 15 seconds for votes, and English. Room language accepts only `en` or `ar`; category and question selection use that authoritative setting, and categories without questions in the selected language are excluded. `RoomSettings.max_players` has a minimum of 2 and no configured upper bound. The host alone can change settings and kick players (`room_models.py`, `events.py`).
- Starting a game requires at least two connected players. The lobby disables the host's start action until this minimum is met, and the backend rejects attempts that bypass the client check.
- The phase machine moves through lobby, category, question/bluff, vote, reveal, and podium. `events.py` drives transitions through client events, timers, and completed submissions. A tie between the top two scores extends the match.
- `seed_database.py` requires exactly three distinct decoys per seed question, also distinct from the correct answer after normalization. This is an import rule, not a guarantee of four live choices.
- `ingestion.build_voting_choices` merges normalized duplicate player bluffs and retains every author ID. It adds available distinct decoys and one correct answer. Its target fake count is 4 with three players, otherwise `max(3, player_count)`. Fewer choices can result when distinct decoys are insufficient; more player bluffs are not trimmed. Do not impose an exact live choice count without changing the implementation deliberately.
- Empty bluffs and bluffs equivalent to the correct answer are rejected. Votes for an unknown choice, a choice authored by the voter, or a second vote are rejected. A correct vote earns 1 point; each vote for a player's bluff earns that author 2 points. Scores accumulate in room state (`ingestion.py`).
- The engine loads random questions from PostgreSQL; it does not track questions already used in a match.

## Database and achievements

- `backend/app/dataProcessing/models.py` and Alembic define users, categories/translations, questions/decoys, friendships, games, player/category results, and user achievements. Keep ORM changes paired with a reviewed Alembic migration. Preserve existing keys, foreign keys, checks, and uniqueness constraints.
- `seed_database.py` validates/imports question JSON. `--with-mock-users` additionally writes development users, game history, friendships, and two sample achievements. The bootstrap script uses that option against a persistent Docker volume. Confirm the target database before seeding or migrating; use isolated data for tests.
- `services.save_game_results` exists but is not called by the live game handlers. In-process scores are not automatically saved as game results.
- Achievement rows have a user/code key, description, image, and `unlocked` flag. The profile API returns the seven `ACHIEVEMENT_DEFINITIONS` entries, marking only persisted true rows unlocked; missing rows appear locked and legacy codes are excluded. `dataProcessing/achievement.py` evaluates five round rules, `SHARP_EYE`, and `HIGH_SCORER`. `achievement_persistence.py` saves new unlocks and loads stored unlocks at game start; current-game progress stays in room memory. Sample achievement names and frontend images do not define unlock rules.

## WebSocket and HTTP contracts

- The WebSocket endpoint is `/room/{room_id}` and authenticates the login cookie, checks the token version and database user, then derives the room player ID from `User.id`. Each player record retains the trusted integer `User.id` for achievement persistence. HTTP authentication separately checks bearer tokens or cookies.
- Messages use `{"event": "...", "data": {...}}`. `backend/app/engine/events.py` defines accepted incoming names: `NEXT_PHASE`, `GET_QUESTION`, `SUBMIT_BLUFF`, `SUBMIT_VOTE`, `LEAVE_ROOM`, `KICK_PLAYER`, `UPDATE_SETTINGS`, `RETURN_TO_LOBBY`, and `CHAT_MESSAGE`. Compare outgoing payloads with `frontend/src/lib/websocket/websocket-events.ts` and `websocket-types.ts`.
- The room manager broadcasts to connected players, generally including the sender; action errors are directed to one player without closing a healthy socket. Rejected initial joins receive a structured `ERROR` event directly before the socket closes because they are not room members. WebSocket room codes must be six uppercase alphanumeric characters, and sockets do not create missing rooms. Reconnection replays the saved phase with remaining time and current bluff/vote submission markers. Check recipients, phase state, reconnects, and disconnects when changing these paths.
- `RESULTS_REVEALED` and `PHASE_PODIUM` data include an `achievements` map of newly saved unlocks, or `{}` when there are none. `PHASE_PODIUM` also includes `game_finished`. `HIGH_SCORER` is checked only at true game end after any tie rounds. New games reset correct-answer progress and reload unlock history from PostgreSQL.
- `docs/websocket/events.md` disagrees with code in places: it describes `START_GAME`/`PHASE_REVEAL`, an `id` lobby field, and host-only phase advancement. Current code uses `NEXT_PHASE`/`RESULTS_REVEALED`, sends `player_id` in lobby entries, and does not guard `NEXT_PHASE` by host. The frontend parser accepts either lobby ID field. Do not turn those documentation examples into hard rules.

## Commands and verification

Run these from the repository root unless a command starts with `cd`.

| Purpose | Command | Note |
| --- | --- | --- |
| Install backend | `cd backend && uv sync` | Also available as `make install` inside `backend/`. |
| Run backend | `cd backend && make run` | Bootstraps persistent local Docker PostgreSQL, syncs, migrates, seeds **mock users**, then runs `fastapi dev app/main.py --port 8000` with `backend/.env`. Root `make backend` delegates here. |
| Install/run frontend | `cd frontend && make install`; `cd frontend && make run` | Delegates to pnpm. Root `make frontend` runs the latter. |
| Frontend checks | `cd frontend && pnpm run lint`; `cd frontend && pnpm run build` | No frontend test script is declared. |
| Backend tests | `cd backend && uv run python -m pytest tests -q` | Pytest config adds `backend` and `backend/app` to the import path. Persistence tests create, migrate, and delete a uniquely named PostgreSQL test database on the configured local server; they require database creation permission and never write to `trivia_db`. `make test` still uses unittest discovery and exits with `NO TESTS RAN`; do not treat it as verification for these tests. |
| Migrate/check schema | `cd backend && uv run alembic upgrade head`; `cd backend && uv run alembic current`; `cd backend && uv run alembic check` | These use the configured PostgreSQL URL. |
| Seed questions | `cd backend && uv run python -m app.dataProcessing.seed_database` | Add `--with-mock-users` only for local fixtures. |
| Bootstrap local DB | `cd backend && bash scripts/bootstrap_local_db.sh` | Starts/creates persistent Docker PostgreSQL, migrates, seeds mock data, and checks schema/content. |
| Vault integration | `./infra/tests/test-vault2.sh` | Requires the Docker Compose stack to be running; checks secret access, isolation, injection, and Docker metadata. |

`backend/.env.example` lists JWT, Google, mail, and password-reset settings. `JWT_SECRET_KEY` is required when importing the backend. Do not commit credentials. The root Makefile also has `make google` to serve authentication docs and cleanup targets. `backend/app/authentication/docs/database.md` describes integration tests that are absent from this checkout.

## Agent workflow and definition of done

1. Before editing, inspect the relevant code, callers, migrations, and available tests. Describe current behavior, a focused plan, affected files, and risks for nontrivial work. If docs and code conflict, report the conflict rather than inventing a rule.
2. Keep transport, game flow, scoring, and persistence responsibilities in their existing modules. Make the smallest focused change and preserve unrelated behavior.
3. Add relevant tests for behavioral changes and establish a real test location/command if needed. Run focused checks, then broader relevant checks. Verify WebSocket delivery/reconnects and database save/reload where affected, using isolated local/test data.
4. Finish with changed files, exact commands and results, and any remaining uncertainty. A feature is complete only when the requested behavior and applicable verification are complete.

## Maintaining this file

AGENTS.md describes the current repository, not planned work.

Update this file only when a completed and verified change modifies one of these:

- architecture or module responsibilities
- runtime technologies or infrastructure
- persistent storage
- important game/business rules
- WebSocket or HTTP contracts
- database/migration workflow
- testing commands or required verification
- major development workflow

Do not update AGENTS.md for small implementation details that do not change how future agents should work.

When updating AGENTS.md:
1. Verify the new behavior in the current code/tests.
2. Remove rules that are no longer true.
3. Do not document planned features as existing behavior.
4. Keep the file concise and operational.
# Trivia Trap working context
