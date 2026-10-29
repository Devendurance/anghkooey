# Qloo Agentic Hackathon — Devpost Submission Draft (Anghkooey × TasteProof)

> Status: draft for owner review. Do not submit verbatim without confirming
> the demo video link and test accounts. All technical claims verified
> against the repository at the submission commit unless marked otherwise.

## Project title

**Anghkooey × TasteProof — a memory-aware concierge that proves its taste with Qloo**

## Tagline

Your tastes, remembered. Cultural fit, backed by Qloo. Decisions you can inspect — and change.

## Inspiration / problem

Travel assistants ask what you want every single time. They forget *why* you liked a place, and generic “best restaurants” lists ignore your taste entirely. Worse, AI dining advice invents venues, prices, and availability with total confidence. We wanted a concierge that remembers the reason behind a preference, asks permission before sharing anything externally, and shows its work — every venue traceable to a real cultural signal.

## What it does

Anghkooey is a personal AI concierge (web chat, Telegram, iMessage) with opt-in Walrus Mainnet memory. For this hackathon we added **TasteProof**, a Qloo-powered dining layer with two faces:

1. **Agentic chat lookup** (`/chat`): say *“Find dining like Nobu in Lagos.”* The concierge proposes the exact Qloo lookup — anchor plus city — and waits for your yes. On approval it runs live Qloo Search + Insights and DeepSeek answers grounded ONLY in the returned venues, with Qloo signal, remembered context, and unverified claims kept visibly separate.
2. **TasteProof visual discovery** (`/taste`): the same live evidence as photographic venue cards — real Qloo photos, descriptions, cultural tags, Qloo affinity (labeled as a ranking signal, never a match percentage), plus anchor correction with a real before/after comparison and one-click Undo.

Missing details are asked, never invented. Denials and unrelated questions never trigger a lookup. Dining turns are session-only: nothing is written to durable memory, and raw memory text never leaves the server.

## How we built it

- **Server-only Qloo adapter** (`src/server/qloo.ts`): hackathon endpoint, `X-Api-Key` header, 12s timeout, typed failures, `feature.explainability=true`, strict field-by-field parsing (tags deduped/capped, affinity float, matched-signal entity, address, description, entity-matched photo URLs). Only caller-supplied anchor/city strings cross to Qloo.
- **Fail-closed rate limiting** (`checkRateLimitStrict`): the public Qloo endpoint verifies its Postgres allowance before every call — 503 when unverifiable, 429 when exhausted. The legacy fail-open helper is untouched for existing endpoints.
- **Chat approval gate** (`src/server/dining.ts`): explicit-request detection, proposal marker, full-message affirmative precision (15 accepts / 12 rejects), latest-proposal-only validity, correction re-proposal, trip-mode precedence.
- **Evidence-grounded prompting** (`buildDiningMessages`): Qloo-only venues, woven genuine details, one consolidated note for thin coverage, never-invent rules, `/taste` close.
- **TasteProof UI** (`src/components/app/Taste.tsx`): lazy consented-memory panel, exact-string approval copy, photographic cards with branded no-photo fallback, before/after ID-based comparison, Undo.
- **Verification**: 69 focused synthetic tests DB-less, typecheck, lint, production build, 12/12 intercepted desktop/mobile Playwright journeys, plus live production smokes (entity IDs stable across sessions, all photos `200 image/jpeg`).

## How Qloo makes the agent genuinely different

Without Qloo, the concierge can recall that you liked Nobu — but it cannot *discover* anything from that fact. Qloo turns a remembered anchor into live cultural discovery: the same anchor resolves to real, ranked, photographed venues in an unfamiliar city, with tags and affinity explaining the cultural fit. The agent doesn't parrot Qloo either — it enforces approval, grounds every claim in returned entities, and says plainly what isn't verified. Qloo is the discovery engine; consent and evidence discipline are the product.

## Technical challenges and verified accomplishments

- **Qloo gives no free-text explanations** (verified by probing the live API): we built the evidence story from what genuinely exists — `query.affinity`, `explainability.signal.interests.entities[]`, tags, disambiguation addresses, property descriptions — and say so when coverage is thin.
- **Consent cannot be a prefix match**: “Okay, what's the weather?” and “Yes, but don't do it” must not authorize external calls. Fixed with a reject-first filter plus full-message allowlist, proven by zero-Qloo-call regression tests.
- **Photos must never mismatch**: every accepted image URL is https, Qloo-hosted, and embeds its own venue's entity ID — verified per venue on production.
- **Fail-closed public proxy**: the rate limiter reports unverifiable storage instead of allowing, so a DB outage yields an honest 503, never an unbounded Qloo proxy.

## Potential impact and future direction

A concierge that remembers taste *and* proves cultural fit generalizes beyond dining: hotels with verified-quiet evidence, events matching your scene, neighborhood discovery. Next: recorded owner chat pass, judge feedback incorporation, and surfacing Qloo tags as memory-search facets.

## Exact demo testing instructions (no credentials needed)

1. Open https://anghkooey.vercel.app/taste (anchor/city pre-filled: Nobu Restaurant, Lagos).
2. Press **Find dining candidates** — expect Izanagi Japanese Cuisine, ILE EROS LAGOS, Talindo Steak House with photos and evidence.
3. Enter `Terra Kulture`, press **Approve revised Qloo lookup** — expect a changed before/after comparison. Press **Undo** — expect Nobu results restored without a new lookup.
4. Or open `/chat`: send *“Find dining like Nobu in Lagos”*, then *“Yes”* — expect a proposal first, then a venue-grounded answer.
5. Try *“Find dining in Lagos”* — expect it to ask for a named anchor rather than guessing.

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, DeepSeek Flash, Qloo Taste AI (hackathon endpoint), Walrus Mainnet via MemWal SDK, Neon PostgreSQL, Photon Spectrum (Telegram/iMessage), Vercel, Vitest, Playwright (Chromium).

## Links

- Live demo: https://anghkooey.vercel.app/taste
- Web chat: https://anghkooey.vercel.app/chat
- Source: https://github.com/Devendurance/anghkooey (MIT, see LICENSE; brand/screenshot assets excluded from the code license grant)
- Qloo docs: https://docs.qloo.com/

## Honest limitations

- Venue notes depend on Qloo coverage; thin venues show names + ranking only.
- Qloo affinity is a ranking signal, not a match probability.
- Availability, prices, and bookings are never verified.
- Dining turns are session-only and create no durable memories.
- The live chat voice pass is owner-verified by browser, not yet recorded on video.
- Qloo venue photos are displayed with Qloo credit; no separate redistribution license is conveyed — confirm organizer terms before reuse outside this submission.
