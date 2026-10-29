# Qloo Gate 4 — Session 1: Preview-readiness report

Date: 2026-10-29. Branch: `feat/qloo-tasteproof`. No code changes in this session.

## Verdicts

- Preview: READY (deployment is live and public) but NOT judge-testable for Qloo yet.
- Qloo: BLOCKED (no `QLOO_API_KEY` / `QLOO_BASE_URL` on Vercel in any environment).
- Database isolation: NOT isolated. `DATABASE_URL` + `DATABASE_URL_POOLED` are scoped
  Production+Preview. Treat Preview as production-touching until an isolated branch exists.

## Tested deployment

- URL: https://anghkooey-549aijgz2-endy-s-winning-szn.vercel.app
- Alias confirms branch: `anghkooey-git-feat-qloo-tasteproof-...`
- Deployment list: SHA `caeb889ff50790806f9cd0a4c72d57e2727819ae`, ref `feat/qloo-tasteproof`, state READY.
- `GET /taste` → HTTP 200, public, no auth challenge.
- `GET /api/tasteproof?anchor=Nobu%20Restaurant&city=Lagos` → HTTP 503
  `{"ok":false,"error":{"code":"qloo_not_configured","message":"Qloo dining lookup is not configured on this server."}}`
  Honest unconfigured state, no stack trace.
- `GET /api/health` → HTTP 200.

## What was NOT run (deliberately)

- No `POST /api/session`, no memory search, no Playwright suite against Preview:
  with prod-scoped `DATABASE_URL`, any session creation would write production data.
- No full Task B browser validation (needs Qloo LIVE first).

## Key-leak check (Preview, public)

- Response headers: no `x-api-key`, no `set-cookie` on `/api/tasteproof`.
- Response body: only the honest `qloo_not_configured` code string; no key material.
- `/taste` HTML: no key patterns. Qloo key stays server-only (`src/server/qloo.ts`).

## Rate-limit / abuse note (code, not probed live)

- `src/server/rate-limit.ts`: Postgres fixed-window; `checkRateLimit` FAILS OPEN
  (`allowed:true`) when the DB is unreachable. `/api/tasteproof` (20/min/IP) also
  fails open when the store is unavailable.
- Consequence: a database-disconnected Preview has NO rate limit on the public
  Qloo proxy (upstream Qloo 429 mapping + 12s timeout remain). With prod DB,
  the limit is enforced but every check touches production.
- Do not expose the key-backed endpoint without either an isolated DB (limit
  enforced, writes safe) or a follow-up bound (e.g. in-memory fallback limit).

## Reference: real Qloo evidence (local build, Slice 3, same commit)

- Nobu Restaurant → Lagos: entity `FF6EE520-...` → Izanagi Japanese Cuisine,
  ILE EROS LAGOS, Talindo Steak House.
- Terra Kulture → Lagos: entity `B15A3789-...` → Lekki Leisure, EbonyLife Place,
  Alliance Française de Lagos. Real changed IDs, verified 2026-10-29.
- Local Playwright 14/14 (desktop+mobile) on the DB-less QA server.

## Owner actions required (exact, no secrets printed)

1. Add `QLOO_API_KEY` (hackathon key) scoped to Preview only — preferably
   branch-scoped to `feat/qloo-tasteproof`. Never add it to Production.
2. Add `QLOO_BASE_URL=https://hackathon.api.qloo.com` with the same Preview scope.
3. Database isolation (pick one before judge testing with sessions):
   a. Preferred: provision an isolated Neon branch, scope its URL to Preview
      (or the feature branch), then run `npm run qa:approve` locally against it.
      Until then, do NOT click "Search memories" on Preview (it POSTs `/api/session`).
   b. Minimal: remove `DATABASE_URL`/`DATABASE_URL_POOLED` from Preview scope
      (or override empty for this branch) → database-disconnected Preview.
      Manual anchor discovery + correction keep working; memory panel honestly
      reports failure; rate limit is unenforced (see abuse note).
4. Do not copy production credentials into new vars; do not remove/overwrite Production vars.
5. After 1–3, re-run this session's Task B checks (Nobu→Lagos, Terra correction,
   undo, empty/unavailable states, desktop+mobile).

## Known limitations

- Judges currently see the honest "not configured" state for any Qloo lookup.
- Memory-backed discovery on Preview is unsafe until isolation (uses prod DB).
- No Photon/Gmail/Walrus/production changes in this session. No main merge.
