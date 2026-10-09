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

## Stage 4D: functional web app (one slice per session)
- [x] 4D.1: /chat + session UX (done 2026-10-09)
- [ ] 4D.2: /memories, real records + corrections (GET /api/memories is metadata only: inspect MemWal SDK before showing any memory text; label semantic search honestly; correction UI updates only after Walrus confirms)
- [ ] 4D.3: /profile (link code via POST /api/link/start, expiry countdown, copy, channel status read API if needed, MERGE YES guidance) + /settings (GET/PATCH /api/settings, session expiry, DELETE /api/session, session end != Walrus erase)
- [ ] 4D.4: integrated browser QA + release verification (chat -> save -> new conv -> recall -> review -> correct -> recall; link flow; 360/390/768/1280/1440)
- Identity rules: no wallet, no email, no fake unlink/delete. Add each route to APP_NAV in src/lib/site.ts only when its page exists.

## Current slice
- 4D.1 done. Next: 4D.2 /memories.

## Completed
- 4D.1 (2026-10-09): /chat = src/app/chat/page.tsx + src/components/app/{AppShell,Chat}.tsx + app.css. New minimal API src/app/api/conversations/route.ts: POST creates an owned web conversation, GET ?id= returns the unexpired transcript (ownership-checked, 24h TTL = RECENT_MESSAGE_TTL_HOURS in repo.ts, getConversationMessages). ChatResult/POST /api/chat now also return savedBlobIds (confirmed Walrus writes only). Client: session via POST /api/session, conversation id in localStorage ak:conv:<userId>, idempotencyKey per message reused on Retry (failed events are reclaimable), 409 reloads transcript, 401 shows the session-ended banner, 404 drops the conversation, 429/502 messages, unsent text kept (Retry/Edit). Receipts show recalled fact + domain + short blob, "No saved memory matched", "Saved to Walrus Mainnet <blob>", "Memory save failed", "Memory off, nothing saved". Memory switch opens the consent panel and PATCHes /api/settings. Light Markdown rendered without HTML injection. START_TALKING -> /chat; the CTA band goes to /chat with a Telegram alt link; Web channel card + footer now say web chat is available. FoldedA marked "use client" (onError broke server use).
- 4D.1 live check: real DeepSeek reply with memory off (no write); 1 Mainnet write after consent (blob y7ZvRr..4h_U, badge appeared only after confirmation); fresh conversation recalled it with a receipt; reload restored the transcript; second session got 404 reading or posting into another user's conversation; 401/400/403 paths verified with curl. No overflow at 360/768/1280/1440 (390 visually checked), reduced motion stops the typing dots.
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
- 4D.1: 25 tests passed, 4 skipped (6 files), typecheck/lint/build pass, git diff --check clean.
- 13 tests passed (incl. real-Neon merge state machine). typecheck/lint/build pass. git diff --check clean. Migration 003_merge applied.
- 2026-10-09 recheck after .env restore: tests 13/13, typecheck/lint/build pass, check:integrations db/deepseek/walrus ok, photon:readiness ok. Fresh clone: npm ci + build pass without .env.

## Frontend notes (4A)
- html[data-motion=full|reduced] + data-intro=play|skip|done set by inline boot script in layout before paint. Base CSS = static layout; full-motion rules opt in.
- Hero = sticky stage in 300svh (220svh stacked) section, one scrubbed GSAP timeline per gsap.matchMedia branch (split vs stacked). Wordmark is a fixed overlay that docks onto [data-dock-slot] in SiteNav (measured, pixel exact).
- No orb video supplied: orb is CSS art. Production orb loop still missing.

## Next action
- 4D.2 /memories. Owner: reverse-direction recall check and 3x10 evidence still pending. Wanted assets: higher-res ribbon (>=2400px, transparent), production orb loop.
- Dev gotcha: Next allows one `next dev` per repo dir. A long-running dev server keeps a stale cached env (getEnv) across hotfixes: it sent no DeepSeek `thinking.type` and got 422. For live checks use `next build && next start -p <port>`, or restart dev.
