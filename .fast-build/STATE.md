# Fast Build State

## Product
- Name: ANGHKOOEY
- Outcome: Memory-powered personal AI concierge for hotels, travel, dining. Real DeepSeek + Walrus Mainnet + Neon, reachable via Web API, Telegram, iMessage.
- Primary demo path: User states a reasoned preference -> Walrus Mainnet blob confirmed -> fresh session recalls it -> DeepSeek gives grounded answer with receipt -> correction supersedes -> same memory across linked channels.

## MVP slices
- [x] Slice 1: Real DeepSeek + Neon + Walrus backend with live cross-session memory proof (core orchestrator, adapters, migration, smoke scripts, health endpoint)
- [x] Slice 2: Identity, security, correction handling, complete frontend-ready HTTP API (sessions, linking, memory endpoints, consent, rate limits)
- [x] Slice 3: Photon Telegram/iMessage worker, secure in-channel linking, deployment docs and evidence tooling

## Frontend stages (landing)
- [x] 4A: brand foundation + folded-A intro + cinematic orb hero + wordmark dock + hero copy + Start Talking
- [ ] 4B: landing sections (features spotlight, memory story, channel continuity), bottom HUD
- [ ] 4C: CTA band + footer (Image B)
- [ ] App: /chat, /memories, /settings on existing API

## Current slice
- 4A done. Next: 4B.

## Completed
- Repo published (2026-10-09): https://github.com/Devendurance/anghkooey, branch main. Commits: deps/config 245a24f, backend+Photon 224b9ed, 4A bd88d96, orb polish eb3beac, typecheck typegen 6b13b1e.
- 4A polish: CSS orb relit (sun point clear of wordmark, rim glare, deeper sky, grass grain). Supplied figure-in-orb reference evaluated locally only: rights unconfirmed and too low-res, not committed.
- Secure account consolidation: migration 003_merge, in-channel MERGE YES/NO state machine (src/server/linking.ts), alias-aware memory union, real-Neon test tests/merge-consolidation.test.ts.
- 4A (2026-10-09): tokens/fonts in src/app/globals.css + layout.tsx (Cormorant, Georama via next/font/google, Satoshi local woff2 src/fonts). Brand primitives src/components/brand/{FoldedA,Wordmark,ButtonLink,SiteNav}. Landing src/components/landing/{Landing,Orb,Ornaments,Aperture}.tsx + landing.css. Trimmed webp derivatives of supplied PNGs in public/brand/anghkooey/web. Links in src/lib/site.ts. Start Talking -> t.me/useanghkooey_bot (owner decision until /chat exists). Visual check via Playwright at 360/390/768/1280/1440, reverse scroll, reduced motion, asset failure, keyboard focus, menu.
- Slice 3 (2026-10-09): spectrum-ts 12.10.1 worker (telegram+imessage), event-derived identity, consent onboarding, in-channel link codes, HTTP confirm hardened to web-only, readiness/evidence/channel-flow scripts, DEPLOY-PHOTON.md. Live: worker<->Photon Cloud connected, Telegram bot + webhook verified, iMessage user registered, channel flow with 1 Mainnet blob (aqYJHj..), cross-channel recall, isolation. Tests 12 pass, typecheck/lint/build pass.
- Slice 2: HTTP API + consent + corrections, live A-J smoke-api. Tests 9 pass.
- Slice 1: orchestrator + adapters + migration, live-verified.

## Existing capabilities
- Next.js 16 App Router + full HTTP API: evidence: src/app/api/*, src/server/*
  - status: working, live-verified
- Photon worker: evidence: workers/photon-worker.ts, src/server/channel-identity.ts, scripts/photon-readiness|channel-evidence|test-channel-flow.ts
  - status: implemented, transport live, human-sent message tests pending owner

## Remaining MVP gaps
- gap: owner-sent Telegram/iMessage message tests
  - why it blocks the demo: end-to-end human proof pending
  - next smallest complete slice: owner runs worker + sends test messages per BACKEND-BLOCKERS.md
- gap: frontend + 3x10 submission evidence
  - why it blocks the demo: hackathon submission needs UI + tester volume
  - next smallest complete slice: frontend build (outside fast-build)

## Blockers
- Owner in-channel consolidation: send web code via Telegram, reply MERGE YES, repeat on iMessage (steps in BACKEND-BLOCKERS.md). Then cross-channel recall check.

## Verification
- 13 tests passed (incl. real-Neon merge state machine). typecheck/lint/build pass. git diff --check clean. Migration 003_merge applied.
- 2026-10-09 recheck after .env restore: tests 13/13, typecheck/lint/build pass, check:integrations db/deepseek/walrus ok, photon:readiness ok. Fresh clone: npm ci + build pass without .env.

## Frontend notes (4A)
- html[data-motion=full|reduced] + data-intro=play|skip|done set by inline boot script in layout before paint. Base CSS = static layout; full-motion rules opt in.
- Hero = sticky stage in 300svh (220svh stacked) section, one scrubbed GSAP timeline per gsap.matchMedia branch (split vs stacked). Wordmark is a fixed overlay that docks onto [data-dock-slot] in SiteNav (measured, pixel exact).
- No orb video supplied: orb is CSS art. Production orb loop still missing.

## Next action
- Frontend 4B (landing sections). Owner: channel consolidation per BACKEND-BLOCKERS.md still pending.
