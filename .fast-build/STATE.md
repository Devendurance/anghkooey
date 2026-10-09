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
- [x] 4D.2: /memories, real records + corrections (done 2026-10-09)
- [x] 4D.3: /profile + /settings (done 2026-10-09)
- [x] 4D.4: integrated browser QA + release verification (done 2026-10-09; 56/56 live checks, 46 unit tests, README + LICENSE committed, prod verified)
- Identity rules: no wallet, no email, no fake unlink/delete. Add each route to APP_NAV in src/lib/site.ts only when its page exists.

## Current slice
- 4D.4 done. Release milestone complete. No further slices planned.

## Completed
- 4D.4 (2026-10-09): cross-channel chat corrections (orchestrator now retires priors across canonical + merged alias set under each blob's real owner; foreign blobs untouched) + session reuse before rate limiting (valid cookie returns reused:true without spending creation quota). tests/cross-channel-correction.test.ts (4 tests, mocked Walrus) + tests/session-reuse.test.ts (3 tests, real Neon). Live browser QA 56/56: intro play/done + skip + reduced motion at 360/390/768/1280/1440, no overflow or page errors; /chat session reuse, memory-off no-save, 1 Mainnet save with honest receipt, new-conversation recall, /memories metadata + matching-labelled search, UI correction to superseded, /profile real code (not sent), /settings switch focus ring + revocation. Commits 9911e8c (fixes) + 4205aba (README + LICENSE). Prod verified: / + /api/health 200 without login, 12/12 session reuses after deploy. No worker update needed (orchestrator change is web-path; worker shares code on next AWS pull only if desired). Owner still to run: real Telegram link from /profile + reverse-direction recall check + 3x10 tester evidence.
- 4D.3 (2026-10-09): /profile = src/app/profile/page.tsx + src/components/app/Profile.tsx; /settings = src/app/settings/page.tsx + Settings.tsx (acct-* in app.css, reuses mem-*). APP_NAV gains Profile + Settings, Telegram nav link hidden <768px. New GET /api/channels -> getChannelStatus() in linking.ts: per provider {linked, verified, verifiedAt, approvalExpiresAt}, alias-aware via canonical + user_merges, plus consolidatedAccounts count. No sender ids, user ids or memory counts. Profile: code via POST /api/link/start kept in React state only, countdown, copy, auto-cleared on expiry or once its channel is linked/awaiting; Check status + refresh on tab return; "Awaiting MERGE YES" banner from pending merge_requests. Note: the worker's resolveChannelUser creates a channel user before the code is checked, so a first link nearly always goes through MERGE YES. Settings: role=switch consent with confirm before enabling, storage/Seal/relayer accuracy copy, session expiry, End session with confirm -> DELETE /api/session, clears ak:conv:* keys, ended state. Copy fixed: Memories/Chat no longer imply user-held encryption. vitest.config.mts adds the @ alias so tests can import route handlers. tests/account-linking.test.ts (real Neon, 9 tests).
- 4D.3 QA: real code generated + copied (clipboard matched, not in URL/storage/cookie), expiry clears it. Linked/awaiting states checked with a synthetic sender fixture (DB only, deleted after), not a real Photon event. Consent on/off and End session (401 after, keys cleared, new identity on return) on a throwaway session. No overflow 360-1440, focus ring on all controls, reduced motion. The Playwright test identity (memory VfuxUL) was re-issued a session server-side after its cookie was replaced during QA.
- 4D.2 (2026-10-09): /memories = src/app/memories/page.tsx + src/components/app/Memories.tsx (mem-* in app.css); APP_NAV gains Memories. Shared browser helpers in src/lib/app-client.ts (call, errorMessage, shortBlob, factText, topicLabel), Chat.tsx reuses them. MemWal 0.1.8 has no get-by-blob: restore() returns counts only, recall() is semantic top-K. So the archive shows metadata only (category, topic from memory_key, saved date, state, short blob + copy, replaced-by link). Text appears only via POST /api/memories/search (bounded recall across alias namespaces, limit 8, hits kept only if metadata is in the alias set, labelled "Matching memories"). GET /api/memories adds totals {active, superseded}.
- 4D.2 security fix: PATCH /api/memories/[id] -> src/server/corrections.ts correctMemory(). Ownership = getMemoryForUsers(getAliasUserIds(session user)), new fact saved to canonical namespace, markSuperseded under the old row's real owner id (merged blobs now drop out of recall), per-blob lock claimCorrectionLock on inbound_events provider 'memory-correction' (failed or >5 min stale reclaimable, no migration), failed write -> 502 with old memory active, 6/min rate limit. tests/memory-correction.test.ts (real Neon, fake saveFact): canonical, merged, unauthorized incl. merged-id-as-caller, failed write + retry, concurrent conflict.
- 4D.2 live check: search returned real stored text; 1 Mainnet correction write y7ZvRr..4h_U -> VfuxUL..R-0I, UI showed pending then new blob, counts 1 active / 1 replaced, Replaced filter shows "Replaced by"; chat recall afterwards used only VfuxUL. A second session got empty list/search, 403 without consent, 404 patching the other user's blob. No overflow at 360/390/768/1280; keyboard filters with focus ring; empty state; offline settings failure keeps state.
- Known gap (orchestrator, not changed): in-chat corrections (extract correction_of / findActiveBlobForKey) still supersede under the canonical id only, so a fact in a merged namespace corrected via chat stays recallable. Fix needs the same owner lookup in orchestrator.ts and a Photon worker redeploy.
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
- 4D.3: 39 tests passed, 4 skipped (8 files), typecheck/lint/build pass, git diff --check clean.
- 4D.2: 30 tests passed, 4 skipped (7 files), typecheck/lint/build pass, git diff --check clean.
- 4D.1: 25 tests passed, 4 skipped (6 files), typecheck/lint/build pass, git diff --check clean.
- 13 tests passed (incl. real-Neon merge state machine). typecheck/lint/build pass. git diff --check clean. Migration 003_merge applied.
- 2026-10-09 recheck after .env restore: tests 13/13, typecheck/lint/build pass, check:integrations db/deepseek/walrus ok, photon:readiness ok. Fresh clone: npm ci + build pass without .env.

## Frontend notes (4A)
- html[data-motion=full|reduced] + data-intro=play|skip|done set by inline boot script in layout before paint. Base CSS = static layout; full-motion rules opt in.
- Hero = sticky stage in 300svh (220svh stacked) section, one scrubbed GSAP timeline per gsap.matchMedia branch (split vs stacked). Wordmark is a fixed overlay that docks onto [data-dock-slot] in SiteNav (measured, pixel exact).
- No orb video supplied: orb is CSS art. Production orb loop still missing.

## Next action
- 4D.4 integrated QA. Owner: a real Telegram link from /profile (send code to the bot, MERGE YES, Check status) has not been run yet. Owner: reverse-direction recall check and 3x10 evidence still pending. Wanted assets: higher-res ribbon (>=2400px, transparent), production orb loop.
- Dev gotcha: Next allows one `next dev` per repo dir. A long-running dev server keeps a stale cached env (getEnv) across hotfixes: it sent no DeepSeek `thinking.type` and got 422. For live checks use `next build && next start -p <port>`, or restart dev.
