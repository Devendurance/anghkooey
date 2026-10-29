# TasteProof — Production Release Checklist (integrated feature)

Branch: `feat/qloo-tasteproof` → `main`. No new project, database, domain, or infra.
Production: https://anghkooey.vercel.app. Last reviewed commit: `3550284`.

## Merge readiness

- `origin/main` (1fe41c6) is an ancestor of the branch: fast-forward, no conflicts.
- Diff vs main: 21 files, +1849/−7. Feature-only: Qloo adapter, `/api/tasteproof`,
  `/taste` page + UI, evidence helper, strict limiter addition, nav entry, 5 test
  files, QA guard + config, 2 reports. Support-only: `.gitignore` QA ignores,
  Playwright devDep + scripts, vitest e2e exclusion.
- Untouched: `workers/`, Gmail, hotel search, Walrus/MemWal, `db/migrations`,
  `scripts/migrate.ts`. No new tables. **No migration required.**
- Secrets: no key values in diff (names only). Qloo key stays server-only
  (`src/server/qloo.ts`, imported only by the API route). No `NEXT_PUBLIC` Qloo.

## Verification (this session, release candidate)

- Focused unit: 33/33 pass with `DATABASE_URL` empty (no prod connection).
- Typecheck pass. Touched-file eslint clean. `git diff --check` clean.
- Production build pass (`/taste`, `/api/tasteproof` present).
- DB-less Playwright: 12/12 intercepted journeys pass (desktop+mobile).
- Fail-closed proven live on the built server: empty store →
  `503 rate_limit_unavailable`, Qloo never called.
- Excluded: live-Qloo browser test (needs store + key) and any DB-writing test.

## Required Vercel environment variables (production)

- `QLOO_API_KEY` — hackathon key. **New, required.** Add to Production.
- `QLOO_BASE_URL` — optional. Defaults to `https://hackathon.api.qloo.com`.
  Set explicitly to the same value for clarity.
- Nothing else changes. Existing `DATABASE_URL` already supports the
  `rate_limits` table used by the strict limiter. No other new variables.

## Safe release procedure (owner approval required — NOT yet run)

1. Vercel → anghkooey → Settings → Environment Variables: add `QLOO_API_KEY`
   (Production) and `QLOO_BASE_URL=https://hackathon.api.qloo.com` (Production).
2. Locally: `git checkout main && git pull origin main` (must still be 1fe41c6;
   if main moved, re-run this checklist).
3. `git merge feat/qloo-tasteproof` (expect fast-forward) → `git push origin main`.
4. Vercel builds Production automatically. Wait for READY.
5. Validate on https://anghkooey.vercel.app/taste (real session, prod DB is
   correct here): Nobu Restaurant → Lagos returns 3 real candidates; revise to
   Terra Kulture → changed before/after; Undo restores; empty anchor and
   gibberish anchor show honest states; no key material in responses.
6. Spot-check existing app: `/chat` reply, `/memories` search, no console errors.
7. Do NOT restart the Photon worker, touch Gmail/AWS, or run `npm run migrate`.
8. Rollback if needed: `git revert` the merge or redeploy the previous
   Production deployment in Vercel. No schema to roll back.

## Genuine blockers

- None in code. Release is gated only on owner approval + adding the two env vars.
