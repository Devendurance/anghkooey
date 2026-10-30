# TasteProof demo script — 2–3 minutes, released video `videos/tasteproof-demo/tasteproof-demo-1080p.mp4` (124s, 1080p, captioned)

> Recorded live against production (`main` @ `139edba`) with real Qloo calls
> via automated Chromium, plus the sanitized real-MCP transcript. No fixtures
> presented as live, no credentials on screen, no invented metrics.
> Captions are burnt into the video; read them below as the narration script.
> Owner action remaining: upload the MP4 to YouTube and paste the link into
> the Devpost entry (Devpost accepts no file uploads).

## Beat 1 — Title / hook (0:00–0:08)

**Say:** “AI agents can recommend anything. TasteProof makes them show what the evidence actually supports.”

**Show:** title card — Anghkooey × Qloo, live on production.

## Beat 2 — Consent-first discovery (0:08–0:14)

**Say:** “First, consent. On the live site, nothing reaches Qloo until a reviewer approves.”

**Show:** production `/taste` — anchor pre-filled, approval gate visible, no auto-lookup.

## Beat 3 — Reviewer confirms Nobu + Sakamoto (0:14–0:30)

**Say:** “Two anchors, one city, three AI-proposed venues. The reviewer approves resolving them through Qloo Search. Both names are genuinely ambiguous — so the reviewer picks the exact entities.”

**Show:** `/taste/verify` inputs → Approve resolving → live choice lists → confirm `Nobu Restaurant [FF6EE520]` + `Ryuichi Sakamoto [B0DEDE63]`.

## Beat 4 — One combined check, three honest verdicts (0:30–0:54)

**Say:** “Confirmed anchors, city and shortlist on screen. One combined Insights check. OBSERVED means an exact match in this result set. REVIEW means look closer. NOT OBSERVED means absent from these results — never proof a place doesn't exist.”

**Show:** Approve verification → report: OBSERVED ILE EROS LAGOS, REVIEW NOK, NOT_OBSERVED Ghost Bistro Xyz → scroll evidence, receipt, limitations.

## Beat 5 — Same verification, callable by another agent (0:54–1:13)

**Say:** “The same verification, callable by another AI agent. Standard MCP — not a mock. Tools list, capabilities, then verify shortlist with an owner-minted approval. Three provider calls.”

**Show:** transcript card — `tools/list` (3 tools), `capabilities` (zero Qloo), `verify_shortlist` coverage 1/1/1, `providerCalls: 3`.

## Beat 6 — Bounded follow-up, unchanged originals (1:13–1:36)

**Say:** “The uncertain venue gets one bounded follow-up. Separate Search evidence, reported alongside — the original REVIEW never changes. A forged approval is rejected with zero provider calls, and the browser never holds tokens.”

**Show:** transcript card — `investigate_gap(target=NOK)`, eligible, additional identities, `providerCalls: 4`, forged → `invalid_approval`; CLI handoff panel screenshot.

## Beat 7 — Receipt and close (1:36–2:04)

**Say:** “Every run ends with a receipt: IDs, counts, explicit limits. Affinity is a ranking signal, never a match percentage. Try it live — no account, no keys. TasteProof: receipts, not vibes.”

**Show:** receipt/limitations card → closing card (`/taste/verify` URL, repo, MCP route).

## Shot list (all recorded/verified)

| # | Shot | Source |
|---|------|--------|
| 1 | `/taste` consent gate, live | video 0:08–0:14 (production capture) |
| 2 | Verify inputs + shortlist | `docs/media/qloo-verify-inputs.png` (production capture) |
| 3 | Resolve → live choices → confirm both entities | video 0:14–0:30 (production capture) |
| 4 | Verification report with 3 verdicts | `docs/media/qloo-verify-report.png` + video 0:30–0:54 |
| 5 | MCP tools/list + capabilities transcript | sanitized real-MCP transcript card (production run, token redacted) |
| 6 | Verify coverage + provider counts | sanitized real-MCP transcript card (production run) |
| 7 | Investigate gap + forged rejection | sanitized real-MCP transcript card (production run) |
| 8 | Owner CLI handoff panel | `docs/media/qloo-verify-handoff.png` (production capture) |

## Do-not-claim list

- No availability, price, rating, or booking claims.
- No affinity-as-probability (or cross-request comparison) language.
- No memory-recall claims: anchors are typed by hand with saving OFF.
- No live tokens on screen: credential-bearing MCP steps use the sanitized transcript only.
- No fixtures-as-live: every venue, verdict, and count is from recorded production calls.
- No autonomous-agent claims: the agent checks recommendations; the reviewer approves every step.
