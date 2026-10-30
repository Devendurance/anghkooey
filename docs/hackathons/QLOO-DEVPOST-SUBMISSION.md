# Devpost submission — Anghkooey × TasteProof (ready to paste)

> Status: final copy for owner review. Accurate against released
> `main` @ `139edba` (live, MCP-verified) plus recorded live Qloo evidence
> from production (2026-10-30) and the released demo video
> `videos/tasteproof-demo/tasteproof-demo-1080p.mp4` (124s, 1080p, captioned;
> owner uploads to YouTube and pastes the link below — Devpost hosts no files).

## Title

**Anghkooey × TasteProof**

## Tagline

AI agents can recommend anything. TasteProof makes them show the evidence.

## Inspiration — problem and audience

Travel assistants ask what you want every single time — and forget *why* you liked anything. Worse, AI dining tips invent restaurants with total confidence. We built TasteProof for people who want a concierge that remembers the reason behind a preference, asks permission before sharing anything externally, and shows its work: every venue traceable to a real cultural signal, every step inspectable, every claim correctable — and now, consumable by other AI agents through real MCP tooling.

## What the AI agent does

Anghkooey is a personal AI concierge (web chat, Telegram, iMessage) with opt-in Walrus Mainnet memory. For this hackathon we added **TasteProof**, a Qloo-powered cultural-verification layer with three faces:

1. **Agentic chat lookup** (`/chat`): say *“Find dining like Nobu in Lagos.”* The concierge proposes the exact Qloo lookup — anchor plus city — and waits for your yes. Only after explicit approval *and* explicit entity confirmation does it run Qloo Search, then Qloo Insights, and DeepSeek answers grounded ONLY in the returned venues, with Qloo signal, remembered context, and unverified claims kept visibly separate. Denials, questions, and unrelated messages never trigger a lookup.
2. **TasteProof visual discovery** (`/taste`): the same live evidence as inspectable photographic venue cards — real Qloo photos, descriptions, cultural tags, Qloo affinity (a ranking signal, never a match probability) — plus correction/Undo, a **multi-anchor mode** (1–3 cultural references, one combined Insights request, per-anchor attribution, single-vs-multi comparison, execution trace, recorded no-Qloo baseline).
3. **Evidence-gated verification** (`/taste/verify`, released): a reviewer approves resolving 1–3 anchors, confirms each exact Qloo entity, approves one combined Insights check — then receives typed verdicts against an AI-proposed shortlist: **OBSERVED** (exact match in this result set), **REVIEW** (near-match or ambiguous identity), **NOT_OBSERVED** (absent from the bounded set — never proof a venue doesn't exist). Every run ends with a receipt (anchor/candidate IDs, city, provider-call counts) and explicit limitations.
4. **Real MCP tools** (`POST /api/mcp`, Streamable HTTP, released): `tasteproof_capabilities` (zero Qloo calls), `tasteproof_verify_shortlist` (approval-gated C1 engine, one combined Insights, deterministic verdicts with trace), `tasteproof_investigate_gap` (at most one extra Search for REVIEW/NOT_OBSERVED targets; original verdicts preserved). Approvals are short-lived input-bound HMAC bearers minted owner-side via CLI — the browser never holds tokens, forged/expired/mismatched approvals are rejected with zero provider calls, and every endpoint fails closed when the rate-limit store is unavailable.

Missing details are asked for, never invented. Dining/verification turns are session-only: nothing is written to durable memory. Raw Walrus memory content, reasons, and identifiers are never transmitted to Qloo — Qloo receives only approved anchor/city strings, and only confirmed entity IDs drive Insights.

## Explicit consent and Qloo entity confirmation

Nothing reaches Qloo on first mention. Every lookup is a two-gate flow:

1. **Approve resolving** named anchors through Qloo Search (per-IP fail-closed rate limit verified *before* any provider call).
2. **Confirm each resolved entity** — exact name, Qloo type, and entity ID shown; ambiguous names present choices, gibberish fails honestly, stale selections are rejected with a re-resolve prompt. Insights runs only against freshly revalidated IDs.

The verification summary names every approved entity, city, and proposed venue before the single combined Insights request fires. Changing any anchor, the city, or the shortlist invalidates the approval and discards pending responses.

## Recorded live proof (production, `main` @ `139edba`, Lagos)

Anchor entities `FF6EE520` (Nobu Restaurant flagship) + `B0DEDE63` (Ryuichi Sakamoto, provider-typed `urn:entity:artist`); proposed `ILE EROS LAGOS, NOK, Ghost Bistro Xyz` — verified over HTTP and via the real MCP client on production:

- `OBSERVED`: ILE EROS LAGOS → exact match, result #1 (`8D713FBF…`)
- `REVIEW`: NOK → near-match of `NOK by Alara` (`D1794390…`), wording differs
- `NOT_OBSERVED`: Ghost Bistro Xyz → absent from the 5 returned venues
- `providerCalls: 3` (2 Search + 1 Insights); investigate_gap on NOK → eligible, 3 distinct Search identities reported separately, original REVIEW unchanged (`providerCalls: 4`); forged approval → `invalid_approval`, zero calls

## Multi-anchor discovery (1–3 cultural references, one combined request)

Each anchor resolves and confirms independently; then **one** Qloo Insights request carries all confirmed entity IDs (comma-separated `signal.interests.entities`, `explainability=true`, city filter). Qloo's per-venue explainability is mapped back to the approved anchor names; venues with no attribution say so instead of inventing contributions. Affinities are shown as Qloo's per-request ranking signal — never compared across requests, never labeled a match probability.

## Live single-versus-multi comparison, execution trace, no-Qloo baseline

- **Comparison**: one extra approved Insights call for the first anchor alone; added/removed/reordered venues computed deterministically from real IDs.
- **Trace**: completed steps only, labeled You-approved (browser) vs Server-observed (Qloo) — a session view, not an immutable audit log.
- **Baseline**: a recorded DeepSeek-only answer to the same request (no Qloo data) showing generic hedged guidance — what is lost without Qloo (IDs, photos, affinity, addresses, attribution) and what risks appear instead. Full prompt, settings, and verbatim output: `docs/hackathons/QLOO-MODEL-ONLY-BASELINE.md`.

## Technical architecture and challenges

- `src/server/qloo.ts` → `/api/tasteproof` + `/api/tasteverify` → `/taste`, `/taste/verify`, `/chat` dining path; DeepSeek composes answers strictly from returned entities.
- `src/server/taste-verify.ts` (pure deterministic verdict engine), `src/server/taste-approval.ts` (HMAC input-bound approvals, 10-min expiry, bearer-for-identical-inputs documented), `src/app/api/mcp/route.ts` (stateless Streamable HTTP via the MCP TypeScript SDK v2 `createMcpHandler`, trusted-host validation, 32KB streamed body cap) + `src/app/api/tasteapproval/route.ts` (owner-issuer bearer gate: 401/403/503 fail-closed before any Qloo call).
- Qloo supplies **no free-text explanations** (verified by probing): evidence is built only from `query.affinity`, `explainability.signal.interests.entities[]`, tags, disambiguation addresses, and property descriptions. Search returns generic `entity` kinds for these anchors, so the UI never invents place/artist/film classifications.
- **Consent cannot be a prefix match** (“Okay, what's the weather?”, “Yes, but don't”): reject-first filter plus full-message allowlist, proven by zero-Qloo-call regression tests.
- **Photos never mismatch**: https + Qloo host + own-entity-ID-in-path, verified per venue on production.
- **Fail-closed public proxy**: unverifiable rate-limit storage yields honest 503, never an unbounded Qloo proxy; approval minting requires the owner issuer credential; stale async UI responses are discarded by request-generation tokens.
- Verified: 351 unit tests pass (67 intentional DB-less skips), 42/42 intercepted Chromium journeys, typecheck/lint/production build green, `npm audit --omit=dev` zero high/critical (18 moderate Spectrum/OTel worker-telemetry advisories with no compatible fix).

## Real-world value and future potential

A concierge that remembers taste *and* proves cultural fit generalizes: hotels with verified-quiet evidence, events matching your scene, neighborhood discovery from the music and films you love. The consent-first, evidence-disciplined pattern — approve, confirm, attribute, compare, verify — transfers to any external cultural API, and the MCP surface lets any agent check its own recommendations the same way.

## Exact demo / testing instructions (no credentials needed)

Live app: https://anghkooey.vercel.app/taste/verify (anchors and city pre-filled; demo video `videos/tasteproof-demo/tasteproof-demo-1080p.mp4`, 124s, captioned — real production footage plus the sanitized MCP transcript)

1. Review the pre-filled anchors, city, and proposed shortlist, then press **Approve resolving via Qloo Search** — confirm `Nobu Restaurant [FF6EE520]` and `Ryuichi Sakamoto [B0DEDE63]` from the live choices.
2. Review the confirmed summary, press **Approve verification** — expect OBSERVED (ILE EROS LAGOS), REVIEW (NOK), NOT_OBSERVED (Ghost Bistro Xyz) with real Qloo evidence, receipt, limitations, and the owner-CLI handoff panel (the browser never shows tokens).
3. Developers: `POST /api/mcp` → `tools/list`, `tasteproof_capabilities` (no approval, zero Qloo) — full verify/investigate calls require an owner-minted approval (see `docs/release/C3-TASTEPROOF-RELEASE-CHECKLIST.md`); forged approvals are rejected with zero provider calls.
4. Or `/taste`: anchor `Nobu Restaurant` → **Find dining candidates**, confirm `FF6EE520` → photographic venues; correct the anchor for a real before/after comparison with Undo.
5. Or `/chat`: *“Find dining like Nobu in Lagos”* → *“Yes”* → confirm the exact entity → grounded recommendation. Try gibberish or a denial — expect honest refusal, never a silent lookup.

## Required links and checklist

- Functional hosted app: https://anghkooey.vercel.app/taste/verify (also `/`, `/taste`, `/chat`, `/api/health`)
- Public repository: https://github.com/Devendurance/anghkooey (MIT — covers original software only; brand assets and third-party Qloo venue photos excluded, see LICENSE)
- Project description: this entry (accurate to released code + recorded provider evidence)
- Testing instructions: above (judge-runnable, no accounts or keys; MCP verify/investigate are owner-gated by design)
- Demo video: recorded (124s, 1080p, captioned); owner uploads to YouTube and pastes the link here

## Honest limitations

- Venue notes depend on Qloo coverage; thin venues show names + ranking only.
- Affinity is a per-request ranking signal, not a match probability and not comparable across requests.
- Availability, prices, and bookings are never verified.
- Dining/verification turns are session-only; the demo types anchors by hand with memory saving OFF, so it demonstrates no recalled-memory claims.
- MCP approvals are 10-minute input-bound bearers (replayable for identical inputs, not one-time — one-time semantics would need persistent writes); clearing any display never revokes an issued token.
- Qloo venue photos display with Qloo credit under the organizers' confirmed in-entry display permission; no ownership or broader licensing rights claimed.
- The recorded demo uses automated Chromium against production with real Qloo calls (no fixtures presented as live); credential-bearing MCP steps are shown as a sanitized transcript, never live tokens.
