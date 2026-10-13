# Frontend Documentation

## 1. Overview

The Trivia Trap frontend is the user-facing part of the multiplayer trivia application. It provides account management, room creation and joining, the real-time game interface, social features, player statistics, achievements, notifications, and settings.

The application is built with Next.js, React, and TypeScript. HTTP is used for account and application data, while WebSockets synchronize live rooms and game phases.

## 2. Responsibilities

The frontend is responsible for:

- Rendering public, authentication, dashboard, profile, and game pages.
- Protecting private routes and redirecting unauthenticated users.
- Sending authenticated HTTP requests to the FastAPI backend.
- Maintaining a WebSocket connection during a live match.
- Converting backend events into visible game phases.
- Displaying room members, scores, timers, chat, and submission progress.
- Providing host controls for settings, player removal, and phase progression.
- Presenting loading, empty, error, and not-found states.
- Adapting the interface for desktop and mobile screens.
- Respecting the user's reduced-motion accessibility preference.

The backend remains authoritative for authentication, room membership, questions, timers, answers, votes, scoring, and achievements.

## 3. Technology

| Technology | Use |
| --- | --- |
| Next.js 16 | App Router, routing, server rendering, and production server |
| React 19 | Component-based user interface |
| TypeScript | Static types for application and server data |
| Tailwind CSS 4 | Utility styling and design tokens |
| Radix UI / Base UI | Accessible interface primitives |
| Motion, GSAP, Anime.js, Theatre.js | Phase transitions and micro-interactions |
| Recharts | Profile and game statistics |
| Native WebSocket API | Live room and game communication |
| pnpm | Dependency and script management |

The exact dependency versions are defined in `frontend/package.json` and locked in `frontend/pnpm-lock.yaml`.

## 4. Directory organization

```text
frontend/
├── public/
│   ├── achievements/           # Achievement images
│   └── images/                 # Branding and category artwork
├── src/
│   ├── animations/             # Animation timelines and phase effects
│   ├── app/                    # Next.js routes and route-level states
│   ├── components/
│   │   ├── achievements/       # Achievement views
│   │   ├── auth/               # Login and username components
│   │   ├── dashboard/          # Dashboard sections
│   │   ├── errors/             # User-facing error components
│   │   ├── friends/            # Friends interface
│   │   ├── game/               # Complete multiplayer game interface
│   │   ├── history/            # Game-history views
│   │   ├── join/               # Room-code form
│   │   ├── landing/            # Public landing page
│   │   ├── notifications/      # Notifications and invitation listener
│   │   ├── profile/            # Profile views and editor
│   │   ├── settings/           # User settings
│   │   └── ui/                 # Reusable design-system components
│   ├── hooks/                  # Game connection and animation hooks
│   ├── lib/                    # API, auth, session, and domain helpers
│   ├── mocks/                  # Development preview data
│   ├── stores/                 # Live game state store
│   └── types/                  # Shared TypeScript types
├── Dockerfile
├── next.config.ts
├── package.json
└── tsconfig.json
```

The TypeScript alias `@/*` maps to `frontend/src/*`.

## 5. Routes

| Route | Access | Description |
| --- | --- | --- |
| `/` | Public | Landing page |
| `/login` | Public | Login and password-reset entry |
| `/register` | Public | Account registration |
| `/choose-username` | Authentication flow | Username setup after provider login |
| `/dashboard` | Private | Main player dashboard |
| `/create-room` | Private | Create a multiplayer room |
| `/join` | Private | Join a room with a code |
| `/room/[coderoom]` | Private | Lobby and live match |
| `/profile` | Private | Current player's profile |
| `/users/[username]` | Private | Another player's profile |
| `/friends` | Private | Friend requests and friend list |
| `/achievements` | Private | Achievement collection |
| `/history` | Private | Previous game results |
| `/notifications` | Private | Invitations and notifications |
| `/settings` | Private | Account preferences |
| `/privacy` | Public | Privacy information |

Private server-rendered routes use `requireUser()` from `src/lib/require-user.ts`. When no valid user is available, the helper redirects to the login page and preserves the intended destination.

## 6. Rendering and data access

The application uses both Server and Client Components.

### Server Components

Server-rendered pages read the `access_token` HttpOnly cookie with Next.js `cookies()`. They call the backend through `API_BASE_URL`, attach the token as a Bearer token, and use `cache: "no-store"` for user-specific data.

Typical uses include:

- Checking the current session.
- Loading profiles, achievements, history, or settings.
- Validating that a requested room exists before rendering the game.
- Redirecting unauthenticated users before private content is displayed.

### Client Components

Interactive components use `apiFetch()` from `src/lib/api.ts`. This helper:

- Requires paths to begin with one `/`.
- Selects the configured public API base URL.
- Includes browser credentials automatically.
- Normalizes `localhost` and `127.0.0.1` during development to avoid cookie-host mismatches.

Relative avatar, banner, category, and question image paths are converted into usable URLs with `apiMediaUrl()`.

## 7. Authentication flow

The browser stores the login session in an HttpOnly cookie managed by the backend. Frontend JavaScript does not read the token directly.

```text
User submits credentials
        ↓
Frontend calls the authentication API
        ↓
Backend validates the user and sets an HttpOnly cookie
        ↓
Browser includes the cookie in later requests
        ↓
Protected server pages validate the session
```

Google authentication uses `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Login and registration pages send a `Cross-Origin-Opener-Policy: same-origin-allow-popups` header so the provider popup can communicate with the application.

The `/reset-password` route is redirected by `next.config.ts` to `/login?mode=reset-password`.

## 8. Real-time game architecture

The main game coordinator is `src/components/game/trivia-trap-game.tsx`. It selects the correct phase, maps backend data into UI models, renders shared HUD elements, and connects player actions to the WebSocket hook.

### Connection flow

```text
/room/[coderoom]
        ↓
TriviaTrapGame
        ↓
useGameWebSocket(roomCode, currentUser)
        ↓
GameWebSocketClient
        ↓
ws(s)://current-host/ws/room/{roomCode}
        ↓
Validated server event
        ↓
Game store update → React render
```

The WebSocket URL uses the current page protocol and host. HTTP pages therefore use `ws://`, while HTTPS pages use `wss://`. In the Docker environment, Nginx forwards `/ws` to the backend.

### Game phases

```text
LOBBY
  ↓
CATEGORY
  ↓
TRAP (players submit fake answers)
  ↓
VOTING
  ↓
RESULTS_REVEAL
  ↓
ROUND_RESULTS
  ├── next round → CATEGORY
  └── final round → FINAL_RESULTS
```

Phase components are located in `src/components/game/phases/`. The server controls phase changes; the frontend renders each new phase from the received event data.

### Incoming events

Important backend-to-client events include:

| Event | Frontend effect |
| --- | --- |
| `LOBBY_UPDATE` | Refresh players, settings, host, and scores |
| `RETURNED_TO_LOBBY` | Clear phase state and restore the lobby |
| `CHAT_MESSAGE` | Add a room chat message |
| `PHASE_CATEGORY` | Display category selection |
| `PHASE_QUESTION` | Display the question and trap form |
| `BLUFF_SUBMITTED` | Mark a player as submitted |
| `PHASE_VOTING` | Display shuffled voting choices |
| `VOTE_SUBMITTED` | Mark a player as voted |
| `RESULTS_REVEALED` | Show the correct answer and update scores |
| `PHASE_PODIUM` | Show round standings or the final podium |
| `ERROR` | Present a recoverable game error |

Every incoming message passes through runtime validation in `src/lib/websocket/websocket-events.ts`. Unknown or malformed messages are ignored instead of being inserted into application state. The full protocol is documented separately in `docs/websocket/events.md`.

### Outgoing actions

The client can send actions for chat, room settings, kicking a player, leaving a room, requesting a question, submitting a bluff, submitting a vote, moving to the next phase, and returning to the lobby. Send methods return `false` when the socket is unavailable or input is invalid, allowing the UI to avoid optimistic changes that were never transmitted.

### Game state

`src/stores/game-store.ts` implements a small external store consumed through `useSyncExternalStore`. It contains:

- Connection state and the latest lobby snapshot.
- Current phase and phase-specific server data.
- Scores and player submission indicators.
- The current player's draft, submitted bluff, and selected vote.
- Chat messages.
- Recoverable server errors.

State is reset when leaving the room or when a connection is finally disposed. Connection cleanup is deferred by one browser task so React Strict Mode does not immediately destroy a newly opened development connection.

## 9. Components and UI system

Reusable primitives live in `src/components/ui/`, including buttons, cards, dialogs, dropdown menus, inputs, badges, tooltips, pagination, charts, skeletons, and standard loading/error/empty states.

Feature components should use these primitives rather than recreating base controls. This keeps keyboard behavior, focus treatment, spacing, colors, and error presentation consistent.

The root layout installs the tooltip provider and loads:

- **Plus Jakarta Sans** as the primary interface font.
- **Black Ops One** as the arcade display font.

## 10. Styling and responsive design

Global styles and design tokens are in `src/app/globals.css`. The design uses a dark arcade theme with orange primary actions, indigo secondary actions, yellow host accents, green success states, and red error states.

When extending the interface:

- Reuse semantic Tailwind tokens such as `bg-primary`, `text-foreground`, and `border-border`.
- Reuse the `trap-*` game colors already declared in the theme.
- Keep the minimum supported page width of 320 pixels in mind.
- Preserve visible `:focus-visible` styling.
- Avoid color as the only status indicator.
- Verify long usernames and translated content do not overflow.

## 11. Animation and accessibility

Animation behavior is separated from most presentation components:

- `src/animations/` contains phase timing, transitions, and effects.
- `use-gsap-context.ts` scopes GSAP work to a component and cleans it up.
- `use-theatre-cinematic.ts` coordinates Theatre.js sequences.
- `use-reduced-motion.ts` detects the user's motion preference.

New animations should have a reduced or immediate equivalent. They must not prevent a user from submitting an answer, voting, leaving a room, or reading results.

## 12. Mock and preview states

Development-only mock data is stored in `src/mocks/`. The room route accepts a development `state` query parameter and can render known mock rooms without a live match. This supports isolated UI work on individual game phases.

Mock behavior must stay behind the development environment check and must not become a source of truth for production gameplay.

## 13. Configuration

For frontend-only development, create `frontend/.env.local` when defaults are insufficient:

```dotenv
# Backend address used by Server Components
API_BASE_URL=http://localhost:8000

# Backend address embedded in browser code
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Public OAuth client identifier
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
```

Never place secrets in a `NEXT_PUBLIC_*` variable. These variables are included in the browser bundle.

In Docker Compose, `API_BASE_URL` is `http://backend:8000`, which is reachable from the frontend container. Browser traffic goes through the HTTPS Nginx gateway.

## 14. Running the frontend

### Full application

From the repository root:

```bash
cp .env.example .env
mkdir -p secrets
printf 'your-smtp-password' > secrets/smtp_password
make
```

Open `https://localhost:8443`. The development certificate can produce a browser warning.

### Frontend only

Requirements are Node.js 22, Corepack, pnpm 12.4.2, and a reachable backend.

```bash
cd frontend
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`.

## 15. Quality checks

Run from `frontend/`:

```bash
pnpm lint
pnpm build
```

`pnpm lint` runs ESLint. `pnpm build` creates the optimized Next.js build and performs framework and TypeScript validation. There is currently no automated frontend test script in `package.json`, so critical authentication and multiplayer flows should also be checked manually.

Recommended manual checks:

1. Register, log in, log out, and complete Google authentication.
2. Create a room and join it from a second browser session.
3. Change room settings and verify host-only controls.
4. Play through every phase in English and Arabic.
5. Submit invalid or duplicate actions and verify error recovery.
6. Disconnect and reconnect during a match.
7. Test keyboard navigation and reduced-motion mode.
8. Check mobile, tablet, and desktop layouts.

## 16. Adding frontend functionality

When adding a new feature:

1. Add or update its TypeScript data model.
2. Put backend access in a `src/lib/` helper instead of directly scattering fetch calls.
3. Use a Server Component when the view does not require browser interaction.
4. Add `"use client"` only to the interactive boundary that needs it.
5. Reuse existing UI primitives and global design tokens.
6. Add route-level `loading.tsx`, `error.tsx`, or `not-found.tsx` where appropriate.
7. Validate new WebSocket payloads before updating the store.
8. Check responsive layout, keyboard access, and reduced motion.
9. Run lint and the production build.

## 17. Troubleshooting

### API requests fail

Confirm that the backend is running and that both API base URLs are reachable from their respective environments. `API_BASE_URL` is resolved by the Next.js server; `NEXT_PUBLIC_API_BASE_URL` is resolved by the user's browser.

### Login works but later requests are unauthorized

Use one hostname consistently. Cookies set for `localhost` do not belong to `127.0.0.1`, even if both addresses reach the same computer.

### The room page does not connect

Check that the application is opened through the expected gateway and that Nginx forwards `/ws`. The WebSocket client deliberately derives the connection from the current browser host rather than from the HTTP API variable.

### Google login popup fails

Verify `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, the authorized JavaScript origin in Google Cloud, and the popup-related response header configured for `/login` and `/register`.

### Images do not load

Check whether the backend returned an absolute or relative media path. Relative backend media paths must be passed through `apiMediaUrl()` or the profile media conversion helper.

## 18. Related documentation

- `frontend/README.md` — quick setup and frontend summary
- `docs/websocket/events.md` — WebSocket protocol
- `docs/db_schema.pdf` — database structure
- `docs/Oauth_and_friendship/Friendship_Flowcharts.pdf` — authentication and friendship flows
- `docs/data_docs/achievement.md` — achievement data and behavior
