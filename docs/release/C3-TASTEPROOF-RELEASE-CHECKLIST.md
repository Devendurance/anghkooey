# C3 TasteProof Release Checklist (Option C — NOT yet released)

Branch: `feat/tasteproof-verify`. No merge, no deploy, no Devpost change in C3.

## What C3 changed (vs C2 push 8ce04cc)

- `POST /api/tasteapproval` is owner-issuer gated and the browser no longer
  mints: `VerifyTaste.tsx` shows CLI-only handoff instructions, no token UI.
- `src/lib/app-client.ts` `call()` merges caller headers with the JSON
  default (previously replaced them).
- `POST /api/mcp` enforces the 32KB cap on actual streamed bytes (bounded
  reader, stream cancelled at the cap; declared Content-Length untrusted).
- New owner CLI `scripts/mint-taste-approval.ts` (issuer bearer via env,
  prints approval + MCP call order; never prints secrets).
- `.env.example` documents `TASTEPROOF_APPROVAL_SECRET` +
  `TASTEPROOF_ISSUER_TOKEN` (server-only, never `NEXT_PUBLIC_`).

## Deployment env requirements (all server-only)

Required on any host serving `/api/mcp` or `/api/tasteapproval`:

- `QLOO_API_KEY` (+ optional `QLOO_BASE_URL`, defaults to hackathon endpoint)
- `TASTEPROOF_APPROVAL_SECRET` (32+ random hex; signs approvals — set or
  approval flows fail closed with `not_configured`)
- `TASTEPROOF_ISSUER_TOKEN` (32+ random hex; authorizes minting — set or
  minting fails closed with `issuer_not_configured`)
- `DATABASE_URL` (rate-limit store; without it all gated endpoints fail
  closed with `rate_limit_unavailable` and make zero Qloo calls)
- `WEB_BASE_URL` (public origin; required so Host validation accepts it)

Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Never commit values. Never put tokens in `NEXT_PUBLIC_*`, screenshots or logs.

## Testing instructions (judge / owner)

Prerequisites: the five env vars above set; server built and running.

1. Approve path (owner terminal only):
   `TASTEPROOF_ISSUER_TOKEN=... npx tsx scripts/mint-taste-approval.ts --base <origin> --anchors "Nobu Restaurant" --entity-ids "<id>" --city Lagos --proposed "ILE EROS LAGOS"`
   Expect JSON `{approval, expiresAt, ...}` plus the MCP call order.
2. Anonymous mint must fail: same call without the env var → exit 1,
   `Missing TASTEPROOF_ISSUER_TOKEN`. HTTP without `Authorization` → 401;
   wrong bearer → 403; zero Qloo calls in all three cases.
3. Real MCP client over Streamable HTTP `POST <origin>/api/mcp`:
   `tools/list` → 3 tools; `tasteproof_capabilities {}` → verdict semantics,
   zero Qloo; `tasteproof_verify_shortlist` with the approval → typed
   coverage/items/evidence/trace; `tasteproof_investigate_gap` with a
   REVIEW/NOT_OBSERVED `target` → separate additional evidence, original
   verdicts unchanged.
4. Forged approval (flip 4 chars) → `invalid_approval`; expired (>10 min) →
   `expired_approval`; altered city/IDs → `approval_mismatch`. All with zero
   provider calls.
5. Browser: `/taste/verify` full journey (resolve → confirm → verify) shows
   OBSERVED/REVIEW/NOT_OBSERVED, evidence, limitations, receipt, and the CLI
   handoff panel — and makes zero `/api/tasteapproval` requests.

## Known honest limitations

- Approvals are bearer-for-identical-inputs until expiry (10 min), not
  one-time; clearing any display never revokes. One-time semantics would
  need persistent writes, which are out of scope.
- MCP JSON mode drops mid-call notifications by design (no SSE streaming).
- Gap investigation recomputes verification first (anchor Searches + one
  Insights) then adds at most one Search; provider counts are traced.
- Qloo Search is broad while verdicts are Insights-bounded: a
  NOT_OBSERVED venue may still return Search hits — that is the documented
  bounded-absence semantic, not a contradiction.

## Release blockers remaining (owner decisions)

- Owner must set the five env vars on Preview/Production and run this
  checklist against Preview (live Qloo smoke: Nobu+Sakamoto/Lagos,
  expect ILE EROS-class OBSERVED + REVIEW/NOT_OBSERVED paths + gap evidence).
- No Preview smoke has been run in this session (no Preview credentials
  available here); merge/deploy only after the owner records it.

## 2–3 minute demo plan

1. (30s) Reviewer opens `/taste/verify`, types 2 anchors + Lagos + 3
   AI-proposed venues, approves Search, confirms each entity.
2. (40s) Approves verification → report: OBSERVED exact match, REVIEW
   near-match, NOT_OBSERVED bounded absence + limitations + receipt.
3. (50s) Owner mints CLI approval (issuer bearer, exact inputs) → real MCP
   client `tools/call tasteproof_verify_shortlist` returns the same typed
   verdicts with provider-call trace.
4. (40s) `tasteproof_investigate_gap` on the REVIEW venue → extra Search
   candidates shown separately, original verdicts byte-identical.
5. (20s) Close: show forged-approval rejection + fail-closed 503 with no
   store; state env requirements and bearer-honesty note.
