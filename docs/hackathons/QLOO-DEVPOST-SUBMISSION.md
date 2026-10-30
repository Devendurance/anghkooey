# Devpost submission — Anghkooey × TasteProof (ready to paste)

> Status: final copy for owner review. All technical claims verified against
> the released repository (`main` @ `4ad4025`) and recorded live Qloo evidence
> from production (2026-10-29). Demo videos are NOT required by the Qloo
> Agentic Hackathon; no video was produced and submission is not waiting on one.

## Title

**Anghkooey × TasteProof**

## Tagline

A consent-first AI concierge that turns cultural taste into explainable discoveries.

## Inspiration — problem and audience

Travel assistants ask what you want every single time — and forget *why* you liked anything. Generic “best restaurants” lists ignore your taste entirely. Worse, AI dining advice invents venues, prices, and availability with total confidence. We built TasteProof for people who want a concierge that remembers the reason behind a preference, asks permission before sharing anything externally, and shows its work: every venue traceable to a real cultural signal, every step inspectable, every claim correctable.

## What the AI agent does

Anghkooey is a personal AI concierge (web chat, Telegram, iMessage) with opt-in Walrus Mainnet memory. For this hackathon we added **TasteProof**, a Qloo-powered cultural-discovery layer with two faces:

1. **Agentic chat lookup** (`/chat`): say *“Find dining like Nobu in Lagos.”* The concierge proposes the exact Qloo lookup — anchor plus city — and waits for your yes. Only after explicit approval *and* explicit entity confirmation does it run Qloo Search, then Qloo Insights, and DeepSeek answers grounded ONLY in the returned venues, with Qloo signal, remembered context, and unverified claims kept visibly separate. Denials, questions, and unrelated messages never trigger a lookup.
2. **TasteProof visual discovery** (`/taste`): the same live evidence as inspectable photographic venue cards — real Qloo photos, descriptions, cultural tags, Qloo affinity (labeled as a ranking signal, never a match percentage) — plus a **multi-anchor mode**: confirm 1–3 cultural references (e.g. Nobu Restaurant + Ryuichi Sakamoto), approve one combined lookup, and receive venues shaped jointly by all of them, with per-anchor attribution, a live single-versus-multi comparison, an execution trace, and a recorded no-Qloo baseline for contrast.

Missing details are asked, never invented. Dining turns are session-only: nothing is written to durable memory. Raw Walrus memory content, reasons, and identifiers are never transmitted to Qloo — Qloo receives only approved anchor/city strings, and only confirmed entity IDs drive Insights.

## Explicit consent and Qloo entity confirmation

Nothing reaches Qloo on first mention. Every lookup is a two-gate flow:

1. **Approve resolving** named anchors through Qloo Search (per-IP fail-closed rate limit verified *before* any provider call).
2. **Confirm each resolved entity** — exact name, Qloo type, and entity ID shown; ambiguous names present choices, gibberish fails honestly, stale selections are rejected with a re-resolve prompt. Insights runs only against freshly revalidated IDs.

The multi-anchor summary names every approved entity and city before the single combined Insights request fires. Changing any anchor or the city invalidates the approval and discards pending responses.

## Multi-anchor discovery (1–3 cultural references, one combined request)

Each anchor resolves and confirms independently; then **one** Qloo Insights request carries all confirmed entity IDs (comma-separated `signal.interests.entities`, `explainability=true`, city filter). Qloo's per-venue explainability is mapped back to the approved anchor names; venues with no attribution say so instead of inventing contributions. Affinities are shown as Qloo's per-request ranking signal — never compared across requests, never labeled a match probability.

**Recorded live proof** (production, Lagos, take 3) — anchor entities `FF6EE520` (Nobu Restaurant flagship) + `B0DEDE63` (Ryuichi Sakamoto, provider-typed `urn:entity:artist`):
single-anchor baseline → Izanagi Japanese Cuisine, ILE EROS LAGOS, Talindo Steak House; combined → ILE EROS LAGOS, Izanagi Japanese Cuisine, **NOK by Alara** — shared 2, Talindo out, NOK in, order flipped, both anchors attributed on every combined venue.

## Live single-versus-multi comparison, execution trace, no-Qloo baseline

- **Comparison**: one extra approved Insights call for the first anchor alone; added/removed/reordered venues computed deterministically from real IDs.
- **Trace**: completed steps only, labeled You-approved (browser) vs Server-observed (Qloo) — a session view, not an immutable audit log.
- **Baseline**: a recorded DeepSeek-only answer to the same request (no Qloo data) showing generic hedged guidance — what is lost without Qloo (IDs, photos, affinity, addresses, attribution) and what risks appear instead. Full prompt, settings, and verbatim output: `docs/hackathons/QLOO-MODEL-ONLY-BASELINE.md`.

## Existing Anghkooey infrastructure vs new hackathon Qloo features

Pre-existing (not hackathon work): DeepSeek Flash chat, Walrus Mainnet memory with consent/correction/supersession, Neon identity with channel linking, Photon Telegram/iMessage worker, Next.js App Router product. New for Qloo: server-only adapter with trustworthy resolution and per-entity explainability parsing, `/api/tasteproof` (GET single-anchor + POST multi-anchor, both fail-closed rate-limited), `/taste` single + multi-anchor UI with correction/Undo and comparison/trace/baseline, chat dining approval gate with affirmative-precision consent, Qloo-grounded prompting, and 30+ synthetic regression tests plus 28 intercepted Chromium checks.

## Technical architecture and challenges

- `src/server/qloo.ts` → `/api/tasteproof` → `/taste` + `/chat` dining path; DeepSeek composes answers strictly from returned entities.
- Qloo supplies **no free-text explanations** (verified by probing): evidence is built only from `query.affinity`, `explainability.signal.interests.entities[]`, tags, disambiguation addresses, and property descriptions. Search returns generic `entity` kinds for these anchors, so the UI never invents place/artist/film classifications.
- **Consent cannot be a prefix match** (“Okay, what's the weather?”, “Yes, but don't”): reject-first filter plus full-message allowlist, proven by zero-Qloo-call regression tests.
- **Photos never mismatch**: https + Qloo host + own-entity-ID-in-path, verified per venue on production.
- **Fail-closed public proxy**: unverifiable rate-limit storage yields honest 503, never an unbounded Qloo proxy; stale async UI responses are discarded by request-generation tokens.
- Verified: 319 unit tests pass (67 intentional DB-less skips), typecheck/lint/production build green, 28/28 intercepted Chromium journeys, `npm audit --omit=dev` zero high/critical (18 moderate Spectrum/OTel worker-telemetry advisories with no compatible fix).

## Real-world value and future potential

A concierge that remembers taste *and* proves cultural fit generalizes: hotels with verified-quiet evidence, events matching your scene, neighborhood discovery from the music and films you love. The consent-first, evidence-disciplined pattern — approve, confirm, attribute, compare — transfers to any external cultural API.

## Exact demo / testing instructions (no credentials needed)

Live app: https://anghkooey.vercel.app/taste (anchors pre-filled)

1. Press **Resolve anchors**, confirm `Nobu Restaurant` (`FF6EE520`), press **Approve combined discovery** — expect 3 Lagos venues with photos, tags, affinity, addresses.
2. Press **Add another anchor**, enter `Ryuichi Sakamoto`, resolve, pick the `urn:entity:artist` choice, confirm both, approve — expect the joint set (ILE EROS, Izanagi, NOK by Alara) with per-venue anchor attribution.
3. Press **Compare with Nobu Restaurant alone** — expect added (NOK by Alara) / removed (Talindo Steak House) computed from real IDs.
4. Check **What actually ran** — You-approved vs Server-observed steps, no invented reasoning.
5. Open the **What happens without Qloo** panel — the recorded model-only baseline.
6. Or `/chat`: *“Find dining like Nobu in Lagos”* → *“Yes”* → confirm the entity → grounded answer. Try gibberish or a denial — expect honest refusal, never a silent lookup.

## Required links and checklist

- Functional hosted app: https://anghkooey.vercel.app/taste (also `/`, `/chat`, `/api/health`)
- Public repository: https://github.com/Devendurance/anghkooey (MIT — covers original software only; brand assets and third-party Qloo venue photos excluded, see LICENSE)
- Project description: this entry (accurate to released code + recorded provider evidence)
- Testing instructions: above (judge-runnable, no accounts or keys)
- Demo video: not required by the hackathon; none produced, none blocking

## Honest limitations

- Venue notes depend on Qloo coverage; thin venues show names + ranking only.
- Affinity is a per-request ranking signal, not a match probability and not comparable across requests.
- Availability, prices, and bookings are never verified.
- Dining turns are session-only; the demo types anchors by hand with memory saving OFF, so it demonstrates no recalled-memory claims.
- Qloo venue photos display with Qloo credit under the organizers' confirmed in-entry display permission; no ownership or broader licensing rights claimed, and no new photo-bearing screenshots were published beyond the previously approved set.
- The live agentic chat path is unit-verified including consent regressions; the owner browser pass is pending.
