# Password recovery API

## Configuration

For a backend run directly on the host, add these settings to `backend/.env`,
alongside your existing JWT and Google settings:

```dotenv
SMTP_EMAIL=your-sender@gmail.com
SMTP_PASSWORD=YOUR_GOOGLE_APP_PASSWORD
PASSWORD_RESET_URL=https://your-frontend.example/login?mode=reset-password
```

`PASSWORD_RESET_URL` is the full URL of the frontend reset form. For local development,
set `PASSWORD_RESET_URL=http://localhost:3000/login?mode=reset-password` in `backend/.env`
and restart the backend. The frontend API base URL is configured with
`NEXT_PUBLIC_API_BASE_URL` (defaults to the same origin in production, or
`http://localhost:8000` in local development). Server-rendered pages use
`API_BASE_URL=http://backend:8000` in Docker.
Use HTTPS in deployment. Do not include a fragment (`#...`) in this setting.
It replaces `PUBLIC_BACKEND_URL`. No HTML pages are served by the authentication backend.
Missing or invalid reset-page configuration returns 503 for all forgot-password requests.
Never commit `.env`. Start the backend with `make run` from `backend`.

For Docker Compose, keep only `SMTP_EMAIL` in the root `.env`. Before the first
Vault bootstrap, put the app password in `secrets/smtp_password` and restrict
the file with `chmod 600 secrets/smtp_password`. The directory is mounted
read-only into `vault-bootstrap`, and its contents are ignored by Git. Delete
the file after Vault has initialized; Vault Agent supplies the stored value to
the backend on normal starts.

## API and frontend contract

- POST `/auth/forgot-password`: `{"email":"player@example.com"}`.
  Returns 202 with the same message for eligible, missing, Google-only, and cooldown-limited accounts.
- The email contains `PASSWORD_RESET_URL#token=TOKEN`.
  The frontend reads the fragment, removes it from the address bar, and collects a new password.
- POST `/auth/reset-password`: `{"token":"TOKEN_FROM_EMAIL","password":"NewPassword123!long"}`.
  Returns 200 on success, 400 for an invalid/expired/used link, or 422 for invalid input.
- The `/login?mode=reset-password` page collects and confirms the new password and displays
  backend password-policy errors. Invalid, expired, or used links offer a new reset email.
- After success, the frontend redirects to `/login` with a success message. The user
  signs in normally with the new password. Previous access tokens are revoked.
- The token stays in memory after the fragment is cleared. Reloading the form requires
  reopening the email link.

For backend-only manual testing, use `/docs` to call the two POST endpoints.
Copy the token after `#token=` from the received email; a working frontend form is
not required for this API test. A real frontend form is required for users to follow the link.

## Behavior

Tokens have 256 random bits; only SHA-256 digests are stored. Tokens expire after
15 minutes, work once, and are replaced by a new request after a 60-second cooldown.
Passwords follow the registration policy. Token validity is rechecked after hashing
so concurrent requests cannot consume the same token twice. Login also rechecks
credentials after verification so a login using the old password cannot finish
after a reset and obtain a new session.

Email runs after the HTTP response using BackgroundTasks. A 202 response does not
confirm delivery. SMTP errors or missing credentials are logged without tokens or
credentials. There is no automatic retry. A successful reset also sends a password-change
notification. Google-only accounts continue to use Google sign-in.

## Persistence and limits

Users, reset digests, cooldowns, and session versions are stored in PostgreSQL.
Reset consumption and version changes are atomic across backend processes.
The current cooldown limits emails per account; there are no IP/global request
limits. Email delivery still uses BackgroundTasks without automatic retries.

## Tests

See [database setup and integration tests](database.md). The database tests cover
single-use tokens, expiry, concurrent requests, and revocation. SMTP is mocked;
tests never send real emails.
