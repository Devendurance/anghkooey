# Current checkpoint
- Task: Slice Gmail-A backend complete (OAuth authorize/callback, encrypted storage, status/disconnect). No UI page yet.
- Done: migration 004, gmail.ts, 4 routes, env additions, 10 unit tests pass + 2 DB tests skip (no DATABASE_URL in sandbox). Typecheck, eslint, build pass. Commit pending, then push.
- Next: Gmail settings UI slice, then owner Google credentials (GOOGLE_CLIENT_ID/SECRET, GMAIL_TOKEN_KEY) and live connect test. Untested: real Google OAuth, DB boundary tests in this sandbox.
- Evidence limits: stubbed fetch only, no live Google calls. No email sent. Tokens never leave the server.
