# Anghkooey Release Gate 2 QA: Product Experience

Date: 2026-10-20. Deadline: October 23, 2026.
Baseline: `febc94d` (contains Gate 1 `83c4e31`, plus agent-state checkpoint only).
Gate 1 is not repeated. Its 255-test result stands.

How this gate was verified:
- Production build (`npm run build`) then `next start -p 3107`, checked with system Chrome through Playwright.
- All six routes loaded on mobile 390x844 and desktop 1280x800 with zero page errors and zero console errors, and zero horizontal overflow on landing and chat.
- Fresh-browser API checks: `POST /api/session`, `GET /api/gmail/status`, `GET /api/memories` after the rate-limit window. Session creates, Gmail reports not connected for a fresh identity, memories returns an empty list.
- Code-path review of `workers/photon-worker.ts` and the server formatters it calls. No live iMessage was sent or received by this agent. Anything needing a real phone is marked NOT TESTED and left for the owner script below.
- Focused vitest: `gmail-ui`, `hotel-contacts`, `trip-brief` (76 passed, 5 skipped), plus `gmail-send`, `gmail-batch`, `memory-recall-status`, `memories-search-status` (43 passed, 23 skipped; skips are DB-gated suites without a test database, same as Gate 1).
- `npm run typecheck` PASS, `npm run build` PASS, `git diff --check` PASS, secret scan PASS (no sk-live, sk-test, xox, ghp, AIza, or private key markers in src, workers, scripts, or tests).
- Not performed by the agent: no Walrus blob writes, no Gmail live sends, no OAuth mutation, no production migrations, no AWS restarts. `GMAIL_BATCH_LIVE` was unset for the whole gate, so batch code paths ran in test mode by construction.

## 1. Web experience (browser-verified)

| Check | Result | Evidence |
|---|---|---|
| Landing `/` mobile + desktop | PASS | 200 both viewports, h1 renders, no console or page errors, no horizontal overflow |
| Landing navigation | PASS | Start Talking links to `/chat`, Telegram links to `https://t.me/useanghkooey_bot`, Privacy links to `/privacy` and `#control`. No dead entries. `APP_NAV` lists only routes that exist |
| `/chat` mobile + desktop | PASS | 200 both, memory switch reads Memory off, composer present, 3 starters, empty state copy explains memory off and session expiry to Nov 19, messages retained 24 hours |
| `/chat` loading, empty, error, recovery | PASS | Empty welcome state verified live. Loading typing state and per-message Retry and Edit controls are in code and match the failed-send handler. Session expiry banner with Start a new session is in code |
| `/memories` mobile + desktop | PASS | 200 both. Empty archive returns zero totals from the API. Error state with Try again was observed live during the rate-limit sweep and the retry path re-runs load |
| `/memories` corrections render | PASS by code review | Correction saves a new blob and marks the old one replaced, failure keeps the old memory unchanged with an explicit error. No delete is promised anywhere |
| `/profile` mobile + desktop | PASS | 200 both. Copy explains the anonymous browser identity, no recovery, link-code flow with 10 minute expiry, MERGE YES or MERGE NO within 15 minutes, group chats excluded |
| `/settings` mobile + desktop | PASS | 200 both. Memory switch with explicit consent panel, Gmail section below, session section with expiry and End session confirm |
| Gmail connection status | PASS | Fresh identity shows Checking, then Not connected with gmail.send scope note, never-inbox promise, Privacy Policy link, and Connect Gmail. Connected state shows the address plus since date and Disconnect with confirm. OAuth return states map to plain copy |
| Privacy `/privacy` mobile + desktop | PASS | 200 both. Last updated Oct 18 2026. Describes anonymous identities, linking, Walrus storage with Seal through the relayer, no permanent delete, DB records, Gmail send-only scope, third parties, retention limits |
| Mobile layouts | PASS | Zero horizontal overflow on landing and chat at 390px width. All six routes return 200 on the mobile viewport with no errors |
| No credentials in output | PASS | No screenshots with tokens were taken. Secret scan clean. Test inboxes in fixtures are fake values |

Note on the sweep: loading all routes rapidly tripped `POST /api/session` rate limiting (10 per minute per IP), which is the documented behavior. The UI showed its loading and retry states rather than breaking. After the window, session creation, Gmail status, and memories all returned normally. Settings on a cold database took about 6 to 10 seconds across sequential session, settings, and Gmail calls, then about 3 seconds warm. That latency is the known Neon cold-start budget from Gate 1, not a new defect.

## 2. Chat and memory UX (browser plus code review)

| Check | Result | Evidence |
|---|---|---|
| Memory on and off is understandable | PASS | Toolbar switch with screen-reader description, consent panel naming Walrus Mainnet and Seal, per-reply Saved to Walrus Mainnet or Memory off nothing saved, Settings switch with matching copy |
| Real recall is attributed honestly | PASS | Replies carry memory receipts with blob IDs. Recall failures render distinct retriable states: unavailable or partial on web, matching parentheticals in chat channels. Zero hits render as no relevant memory matched, never as an empty account claim |
| Saved memories and corrections render accurately | PASS by code review | Archive lists topic, date, and blob ID. Correction preserves the old record on failure |
| Browser session state is consistent | PASS | Chat welcome, Profile, and Settings all say the same thing: anonymous identity, expiry date, clearing cookies or switching devices starts over, linked chats keep working |
| Channel-linking instructions are clear | PASS | Profile gives the exact steps: create a code in the browser, send it from the chat, confirm consolidation with MERGE YES or keep separate with MERGE NO. Expiry windows are stated |
| No identity is silently merged | PASS by code review | A code that hits an existing standalone account opens an explicit approval window. Nothing changes until MERGE YES. MERGE NO keeps separate memory. Group chats are rejected before any identity work |

## 3. Photon command UX (code-path review, no live phone)

| Command | Result | Evidence |
|---|---|---|
| HELP | PASS with note | Short, readable, states memory off by default and the YES path. Lists EMAIL, PREVIEW, SEND, CANCEL plus linking. It does not list HOTELS, CONTACT, or INQUIRE. Those flows are discoverable from the shortlist and batch messages themselves, so this is recorded as P2 below, not fixed in this gate |
| MEMORY | PASS | Reports the confirmed count or states none held yet, with the correction path in plain words |
| CONNECT | PASS | Exact link steps, single use, 10 minute expiry, merge confirm behavior |
| HOTELS | PASS | Numbered shortlist with destination, check-in to check-out dates, observed nightly rate or no rate returned, source domain, and the CONTACT next step. Read only, no sends |
| CONTACT | PASS | Full validated `https://` form URL rendered in one piece with an explicit not-an-email and nothing-sent note. Email, phone, and messaging outcomes are each labeled with their source. Out-of-range picks get the valid range plus the HOTELS pointer |
| EMAIL | PASS | Asks only for what is missing, then previews the exact draft before any code exists |
| PREVIEW | PASS | Exact From, To, Subject, and body with NOT SENT and the single-use approval line. Missing party size adds a plain note instead of guessing |
| SEND | PASS | Only the Gmail receipt path claims acceptance, with the receipt prefix and delivery-is-up-to-Gmail scope. Already-sent returns the stored receipt with nothing sent twice. Invalid, expired, cancelled, refresh-failed, and uncertain outcomes each have their own actionable reply. Unknown outcomes are never retried and point at Gmail Sent |
| CANCEL | PASS | Cancelled with no email sent, or no pending email to cancel. Single and batch variants are distinct |
| INQUIRE | PASS | Missing info, no shortlist, stale shortlist, invalid selection, and unverified contact each name the next step. Verified batches render every preview in full before any code is issued, and a changed batch voids the code |
| PREVIEW ALL | PASS | Replays every part whole so no approved character is lost, then points at the original approval code |
| SEND ALL | PASS | Live-disabled fails closed with the batch unchanged. Otherwise per-hotel results with distinct receipts, nothing-sent-twice on repeats, and Gmail Sent as the source of truth on uncertainty |
| CANCEL ALL | PASS | Batch cancelled with no email sent, or no pending batch |
| INQUIRIES | PASS | Status view with mode, per-hotel state, receipts, and error codes |
| iMessage suitability | PASS by construction | Replies are short lines, batch previews are chunked with part labels that fit the limit by construction, and no claimed delivery beyond Gmail acceptance |

Real-phone rendering on iMessage was NOT TESTED by this agent. No live message was sent. See the owner script.

## 4. Gmail and hotel presentation (code-path review plus API checks)

| Check | Result | Evidence |
|---|---|---|
| Accurate dates, nights, budgets | PASS | Shortlist shows destination plus check-in to check-out dates, observed nightly amounts with currency or currency-unknown, and no rate returned when absent. Rates are labeled observed and indicative with confirmation left to the property. Trip parsing keeps last-stated nights and normalizes budgets to amount-first per-night form. Nothing is presented as a booking |
| No fabricated amenities or reservations | PASS | Candidates carry only observed fields plus source URLs. Providers that fail return typed statuses with notes, never invented content |
| Correct account identity | PASS | Gmail reads and sends resolve the canonical user server side from the verified sender. Gate 1 stranger-isolation tests cover this and were not reopened |
| Exact previewed recipient and message | PASS | Single preview shows the exact To with the pinned test inbox in test mode. Batch previews show per-hotel To plus a verified or not-verified contact evidence line. Approval covers the exact snapshot |
| TEST mode clearly labeled | PASS | TEST EMAIL header with NOT SENT and controlled-test scope, approval prompt stating all recipients are the controlled test inbox, status views carrying the mode |
| Distinct per-hotel receipts | PASS | Batch results list each hotel on its own line with its own receipt fragment or its own failure code, plus an accepted count |
| No duplicated or confusing warnings | PASS | Each outcome carries one status line. Memory-off and save-failed notices are distinct states, not duplicates |
| Clear contact-form versus email distinction | PASS | Form outcomes name the official contact form with the full URL. Email outcomes name the verified address. The batch evidence line separates verified contacts from test-inbox-only sends |
| Actionable provider failure messages | PASS | Refresh failures point at reconnecting in Settings, declines stay local with no state change, uncertain sends point at Gmail Sent before any further approval |
| GMAIL_BATCH_LIVE remains disabled | PASS | Env was unset for the gate and the mode helper defaults to test. No live batch path was exercised |

## 5. Defects

P0 (broken primary journey, unsafe behavior): none found.

P1 (misleading output, inaccessible UI, unusable controls, critical mobile issue): none found. The cold-start latency on Settings and Memories (roughly 6 to 10 seconds cold, 3 seconds warm) is the already-recorded Gate 1 infrastructure note about Neon compute and timeout budgets. No product code change is made for it here.

P2 (cosmetic or noncritical, recorded without redesign):
- HELP text does not advertise HOTELS, CONTACT, or the INQUIRE batch family. Contextual next-step lines cover discovery, so this is polish, not a fix for this gate.
- Settings and Memories show a bare Opening line during cold loads. A staged progress hint could help, but that is redesign and out of scope.

## 6. Delivery

SHA: `febc94d` (tree includes Gate 1 `83c4e31`). No product source was changed in this gate, so there are no P0 or P1 fixes to commit. This report is the delivery.

Verified journeys:
- Landing, chat, memories, profile, settings, and privacy load on mobile and desktop with no errors and no overflow.
- Fresh browser session creates, Gmail reports not connected, memories returns empty honestly.
- Memory consent, recall receipts, failure states, session-expiry, and channel-linking copy are consistent across web and chat worker paths.
- All fourteen Photon command families return concise, honest, actionable replies by code path, with receipts only on real Gmail acceptance and TEST labeling throughout.

Remaining issues: the two P2 notes above, plus everything marked NOT TESTED below.

Blocked or not tested:
- BLOCKED (needs the owner on a real phone): live iMessage rendering of HELP, MEMORY, CONNECT, HOTELS, CONTACT, EMAIL, PREVIEW, SEND, CANCEL, INQUIRE, PREVIEW ALL, SEND ALL, CANCEL ALL, and INQUIRIES, including tappable form URLs and multi-part batch previews.
- NOT TESTED: live Gmail OAuth connect and disconnect in Settings, live TEST-mode send and receipt check, live CONTACT against a real hotel page. These mutate real state and are owner-only.

Owner-side real-device script (about 10 minutes, TEST mode only, stop at the first surprise):
1. In web Settings, connect Gmail, confirm the address and since date appear, then keep it connected.
2. On the linked iMessage chat, send HELP, MEMORY, and CONNECT and confirm each reply is short and readable.
3. Ask for a trip brief with destination and dates, then send HOTELS and confirm the shortlist shows dates, observed rates or no rate returned, and source domains.
4. Send CONTACT 1 and confirm the full `https://` form URL arrives tappable with the nothing-sent note.
5. Send EMAIL, then PREVIEW, and confirm the preview matches the request with NOT SENT and the test inbox as To.
6. Approve once with SEND plus the code, confirm the reply cites the Gmail receipt without claiming inbox delivery, then send PREVIEW again to confirm expiry behavior.
7. Send INQUIRE 1, then PREVIEW ALL, confirm every part arrives whole, then CANCEL ALL and confirm the batch is gone with no email sent.
8. Reply with any correction to a saved preference on web Memories and confirm the new record appears and the old one is marked replaced.
