# Anghkooey Frontend Playbook

Saved preferences and working rules from the build that produced the story-driven site (landing 4A-4C, app 4D.1-4D.3). Read this with `DESIGN.md` before touching UI. DESIGN.md is the visual spec. This file is how we work and what went wrong.

## 1. Product feel

- Story first. The landing page leads with one luminous orb and the folded-A, then walks through memory, everyday experiences, channel continuity and privacy, and ends with a CTA band and footer.
- Intimate, quiet, editorial. A personal archive, not an analytics dashboard.
- Dark only. No white dashboard, no light mode.
- The product is honest. Nothing on screen is invented: no fake memories, counts, percentages, charts, connection states or tester data.

## 2. Workflow that worked

1. Read `.fast-build/STATE.md` first. One slice per session. Stop when the slice is done.
2. Confirm repo identity, then keep discovery narrow: a few targeted reads, no repo-wide crawling.
3. Build vertically: logic, API if needed, UI, focused verification. Reuse existing endpoints and helpers.
4. Browser QA on a production build (`next build && next start -p 3200`), not a long-lived dev server.
5. QA widths: 360, 390, 768, 1280, 1440. Check overflow, keyboard focus, reduced motion, loading, empty, failure and success states.
6. Completion checks once at the end: focused tests, `npm test`, typecheck, lint, build, `git diff --check`.
7. Secret scan staged files, commit only the slice, push to `origin/main` without force, verify the remote SHA and the Vercel status.
8. Update `.fast-build/STATE.md` and log new gotchas in `AGENTS.md`.
9. Report briefly: what was built, real data versus unsupported data, tests, QA, SHA, remaining limits.

Landing was built in stages: 4A hero and brand, 4B storytelling sections, 4C CTA and footer. App pages were built in slices: chat, memories, profile and settings.

## 3. Design rules

- Colors: Night `#05080F`, Raised `#0B1119`, Cream `#F4EEDF` for type, Icy Periwinkle `#D8DCFF` for the folded-A, wordmark and focus rings, Electric Indigo `#4F5CFF` as a restrained accent (switch on-state, halo).
- The wordmark is Periwinkle, never cream. Aurora colors live only in the CTA band and footer. Use Ember once per view at most.
- Fonts: Cormorant for display, Satoshi for interface, Georama for labels. Inter appears nowhere.
- Cormorant uses old-style numerals that read as letters. Use `font-variant-numeric: lining-nums` on any big number.
- Glass cards and hairline borders, 1px cream lines for ornament. Light is the only decoration.
- Focus ring: `2px solid #D8DCFF`, offset 3px. Touch targets at least 44px. Every input has a visible label.
- Motion: GSAP and ScrollTrigger on the landing, one scrubbed timeline per `gsap.matchMedia` branch. Entrances only show, never re-hide. Reduced motion shows everything static (`html[data-motion=reduced]` plus `prefers-reduced-motion`).
- The aperture is a transition device only. The ring-and-pupil mark is retired.
- The app uses the quiet shell (`AppShell`, `app.css`, `mem-*` and `acct-*` classes). Add a route to `APP_NAV` only when its page exists.
- No wallet or email login UI. Start Talking goes to `/chat`, with Telegram as the alternative.

## 4. Honesty and privacy copy

- Say: Walrus Mainnet through the default MemWal relayer, Seal encryption managed by the relayer, Anghkooey runs the Walrus account and reserves a namespace per user.
- Never say: user-held keys, end-to-end or client-side encryption, individual wallet custody, "belongs to you" about encryption.
- Memory off stops new saves only. Existing blobs remain and can still be recalled.
- Ending a session or clearing cookies does not erase memory. There is no account recovery. Linked chats keep working.
- No permanent delete, no unlink, no fake connection states.
- A channel is "Linked" only after the backend confirms it from a verified Photon event. Generating, copying or sending a code proves nothing.
- Link codes live in React state only. Never in URLs, storage, cookies, logs or analytics.
- The browser cannot supply a provider sender ID. `MERGE YES` happens in the channel only.
- Archive shows metadata only. Plaintext appears only through the labelled "Matching memories" search, never as a full inventory.

## 4. Code patterns

- Shared browser helpers in `src/lib/app-client.ts` (`call`, `errorMessage`, `shortBlob`).
- Pages: thin `page.tsx` wrapping `AppShell` plus one client component with phases `loading | failed | ready`, a Try again button, and a reset of per-session state at the start of `load`.
- State-changing routes: origin check, session check, rate limit, zod validation. Ownership comes from the session, resolved through canonical and merged identities server side.
- Chat sends an idempotency key per message and reuses it on Retry.
- Receipts and saves show only after Walrus confirms.
- Tests against real Neon use throwaway users, a fake Walrus writer and `}, 60000);` timeouts. `vitest.config.mts` maps `@/`.
- Schema changes: `db:generate` then `db:migrate`. Never drizzle push.

## 5. Mistakes to avoid

- Importing less than you render: missing `Link` and `ArrowUpRight` imports broke the CTA and landing.
- Passing event handlers (`onError`) from a server component. Mark such components `"use client"`.
- `Date.now()` or `new Date()` in prerendered components (cacheComponents is on), including `useState(() => Date.now())`.
- A long-running `next dev` keeps a stale cached env. It sent no DeepSeek `thinking.type` and got 422. Test on a fresh production build.
- Killing the exec shell does not stop `next start`. Find and stop the PID on the port. Stale servers serve deleted chunks.
- `.mem` must stay `position: relative`, or `sr-only` spans stretch the document.
- Next keeps visited routes mounted and re-runs effects. Reset UI state on load or stale notices leak across sessions.
- `POST /api/session` allows 10 per minute per IP. Big browser sweeps hit 429.
- Truncating a receipt in a shared server path hides facts. Fix presentation in the client when the worker shares the code.
- Treating semantic top-K search as the full list. The MemWal SDK has no get-by-blob.
- Chat-initiated corrections for merged accounts still supersede under the canonical id only. Fixing it needs a worker redeploy and approval.
- Do not start two slices, expand scope, refactor unrelated code, restart the AWS Photon worker, run a local worker beside AWS, or make paid Mainnet writes without need.
- Do not claim a real channel link without a verified Photon event. Synthetic DB fixtures are labelled as such.

## 6. Open items

- Real Telegram link from `/profile` (code, MERGE YES, Check status) not yet run.
- Reverse-direction recall (iMessage save, Telegram recall) and 3x10 tester evidence are owner tasks.
- Production orb loop and a higher-resolution ribbon asset are still wanted.
- Next slice: 4D.4 integrated QA and release verification.
