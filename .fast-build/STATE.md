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
- [x] 4B: storytelling sections (memory story + how-it-works spotlight, everyday-experiences bento, channel continuity, privacy and control)
- [x] 4C: CTA band + footer (Image B) + desktop edge HUD. Landing page complete.
- [ ] App: /chat, /memories, /settings on existing API

## Current slice
- 4C done. Landing complete. Next: web app (/chat first).

## Completed
- 4C (2026-10-09): CtaBand + BottomHud in src/components/landing/Closing.tsx + closing.css; SiteFooter in src/components/brand/SiteFooter.tsx + footer.css; rendered from Landing.tsx (old placeholder footer removed from page.tsx). CTA ribbon = owner-supplied render, public/brand/anghkooey/web/cta-ribbon.webp (1024x576, 40KB, lazy, screen blend + feathered masks), slot in BRAND_ASSETS.ribbon accepts transparent WebP/PNG; CSS conic-ring fallback on load error. Viewfinder CTA "Tell Anghkooey one thing" -> Telegram, destination stated. Footer: real links only (anchors, Telegram, GitHub repo); iMessage "In testing", Web chat "Coming soon" as plain text; no legal pages exist so none linked. HUD desktop-only (>=1024): Telegram button, section counter, dot pager; hidden over hero and footer (visibility hidden, not focusable). No sound toggle (no audio). Duplicate Start Talking row removed from #control. Browser-checked 360/390/768/1280/1440, menu, pager keyboard, reduced motion, ribbon fallback, no overflow.
- 4B (2026-10-09): src/components/landing/Sections.tsx + sections.css, rendered after the hero in Landing.tsx. Sections #story, #experiences, #channels, #control. t-h2/t-h3 in globals.css. Nav pill adds How it works + Privacy from lg up (NAV_LINKS.wide). Motion: ScrollTrigger.batch entrances (show-only, never re-hide), lens drift, spokes clip reveal; reduced motion and no-JS show everything static. Channel status is honest: Telegram available, iMessage in testing (no public number), Web coming soon. Bento lenses are original CSS art, no third-party images. FoldedA hides itself on load error. Browser-checked 360/390/768/1280/1440, reverse scroll, keyboard focus reveal, reduced motion, asset failure, no horizontal overflow.
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
  - status: implemented, transport live. Owner confirmed Telegram and iMessage consolidation and Telegram-to-iMessage Walrus recall. Reverse direction (iMessage-to-Telegram) human check not yet recorded.

## Remaining MVP gaps
- gap: reverse-direction human recall check (state on iMessage, recall on Telegram)
  - why it blocks the demo: only one direction is owner-verified
  - next smallest complete slice: owner runs the check per BACKEND-BLOCKERS.md step 2
- gap: frontend + 3x10 submission evidence
  - why it blocks the demo: hackathon submission needs UI + tester volume
  - next smallest complete slice: frontend build (outside fast-build)

## Blockers
- Owner: reverse-direction recall check (iMessage to Telegram) and 3x10 tester evidence. Consolidation on both channels is done.

## Verification
- 13 tests passed (incl. real-Neon merge state machine). typecheck/lint/build pass. git diff --check clean. Migration 003_merge applied.
- 2026-10-09 recheck after .env restore: tests 13/13, typecheck/lint/build pass, check:integrations db/deepseek/walrus ok, photon:readiness ok. Fresh clone: npm ci + build pass without .env.

## Frontend notes (4A)
- html[data-motion=full|reduced] + data-intro=play|skip|done set by inline boot script in layout before paint. Base CSS = static layout; full-motion rules opt in.
- Hero = sticky stage in 300svh (220svh stacked) section, one scrubbed GSAP timeline per gsap.matchMedia branch (split vs stacked). Wordmark is a fixed overlay that docks onto [data-dock-slot] in SiteNav (measured, pixel exact).
- No orb video supplied: orb is CSS art. Production orb loop still missing.

## Next action
- Web app /chat on existing API, then point START_TALKING at it (src/lib/site.ts). Owner: reverse-direction recall check and 3x10 evidence still pending. Wanted assets: higher-res ribbon (>=2400px, transparent), production orb loop.
