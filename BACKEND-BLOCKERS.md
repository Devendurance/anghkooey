# BACKEND-BLOCKERS.md — Slice 3 (2026-10-09)

## Resolved this slice
1. **Photon SDK contract: PINNED.** spectrum-ts 12.10.1 (bundled @spectrum-ts/telegram + @spectrum-ts/imessage). `telegram.config({botToken})`, `imessage.config()`. Installed with --legacy-peer-deps (pre-existing vite/vitest peer conflict, unrelated).
2. **Link-confirm spoofing: HARDENED.** HTTP confirm accepts provider=web only (403 otherwise). Channel links go through the worker with event-derived sender ids.
3. **APP_SESSION_SECRET: SET.** Present (64ch). Worker requires it in production, never generates.
4. **Env loading mismatch: NONE.** All 9 keys load from `.env` via dotenv for scripts/worker; photon CLI needs `set -a; source .env` first (documented).

## Owner-confirmed
- Telegram and iMessage consolidation (step 1) done. Telegram-to-iMessage Walrus recall confirmed. The reverse direction in step 2 and step 4 are still open.

## Active blockers (owner action)
1. **Consolidate existing accounts (Telegram first).** DONE (owner-confirmed). With the worker running (`npm run worker:start`): (a) open your web session and create a link code (`POST /api/link/start`), (b) send the code as one Telegram message to @useanghkooey_bot, (c) read the memory counts and reply MERGE YES, (d) confirm the "shares one memory" reply. Then repeat with a FRESH code on iMessage. Your earlier Telegram/iMessage memories stay recalled; nothing is deleted. If either side shows an unexpected memory count, reply MERGE NO and tell me before confirming.
2. **Cross-channel recall check.** After both merges: state a new food preference on iMessage, then ask about it on Telegram (and reverse). Expect the same memory cited on both.
3. **Live human-sent Telegram test.** (Covered by step 1 if the worker is running; otherwise: DM `/start`, YES, state a preference, follow-up recall question.)
4. **3x10 hackathon evidence.** Needs 3 consenting testers, 10 Mainnet blobs each. Engineering harness blobs do not count.

## Exact next commands (after owner tests)
- `npm run channel:evidence -- --user <uuid>` per tester (counts + blob ids).
- Frontend build, then submission artifacts.
