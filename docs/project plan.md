# ANGHKOOEY — PROJECT PLAN

**Version:** 1.0 · **Date:** 8 October 2026 · **Status:** Build specification / not yet implemented  
**Project:** Anghkooey — a personal AI concierge that remembers you  
**Build harness:** Pi + Muse Spark Contributor (coding assistant)  
**In-app primary model target:** DeepSeek Flash (`deepseek-flash`); use an eligible non-OpenAI/non-Anthropic alternative only if access fails  
**Memory:** Walrus Memory on **Mainnet**  
**Channels:** Web + Telegram + iMessage through Photon Spectrum  
**Companion documents:** [`PRD.md`](./PRD.md), [`TRD.md`](./TRD.md), [`architecture.md`](./architecture.md)

> **Execution principle:** A live bot that demonstrates true recall across sessions and channels beats a large but unverified travel app. Build the memory experience first. No bookings, inventory, payment flows, or invented hotel data in this sprint.

---

## 1. Mission and product thesis

People repeatedly tell hotels, travel assistants, and dining services the same things: what they like, what they avoid, what happened last time, and *why* a preference matters. Those details get trapped in old chats or lost when the service or device changes.

**Anghkooey** is a conversational personal concierge that remembers meaningful preferences and experiences, applies them to later decisions, and revises its understanding when people change their minds. Initial verticals: **stays, travel, and dining**. These are three uses of **one memory engine**, not three marketplaces.

**Public promise:** “You shouldn't have to explain yourself twice.”  
**Definition of done:** A returning real user can ask a new question on another session or linked channel; Anghkooey recalls the appropriate Mainnet memory and gives a visibly better, accurately grounded answer than the same assistant without memory.

## 2. Competition facts and time boundary

- **Official close:** **9 October 2026 at 14:00 UTC = 15:00 Africa/Lagos**. Treat the earlier user-estimated **10-hour engineering window** as a strict build budget; use remaining time for real users, article, and submission rather than scope expansion.
- One submission per person/team. Submission on **DeepSurge** and the required **Airtable form**; verify the final DeepSurge fields manually.
- Must be a deployed, reachable working chatbot; all long-term memory stored on **Walrus Mainnet**.
- Official rules: at least **10 Mainnet blobs** from the Walrus Memory agent; provide **agent ID and blob count** and a dedicated Sessions wallet address.
- Session brief adds the more demanding proof: **3 different real users × ≥10 stored memories per user**. Meet both independently; do not equate “memory extraction accepted” with “blob confirmed.”
- Public open-source GitHub repo with setup instructions, 500–800-word Medium/Inkray article, X post tagging `@WalrusProtocol` and `#WalrusMemory`, feedback on at least one friction point plus improvement idea, Walrus Discord participation.
- The brief requests a few days of usage. If built only tonight, that duration **cannot be manufactured**. Collect genuine use and accurately state the usage window; ask the organizer if retrospective use of an earlier bot is required. Never backdate evidence.
- Prizes may be denominated in **WAL tokens** under the official rules. Additional category wins are possible, not guaranteed.

Official rules: https://thewalrussessions.wal.app/chatbots/index.html  
DeepSurge: https://www.deepsurge.xyz/hackathons/c0141a4a-21be-4009-bc63-7c168608c849  
Submission form: https://airtable.com/appoDAKpC74UOqoDa/shro5iVzzjoWfZlPK

## 3. Locked product scope

### P0 — ship and prove

1. **Real conversational chat** with DeepSeek, responsive in a usable web chat and two messaging channels, **Telegram and iMessage via Photon Spectrum**. iMessage is a *planned launch channel*, not dismissed as a hypothetical feature.
2. **Explicit memory capture** of valuable travel/stay/dining facts: preference, dislike, constraint, experience, reason, and correction. The bot must acknowledge save success honestly.
3. **Walrus Mainnet persistence** with real blob IDs after job completion; no database-only memories or mock persistence in submitted flows.
4. **Semantic retrieval before answering**, relevant-distance filtering, memory-linked answer support, and no fabricated recall.
5. **Separate sessions and user namespaces** with server-authorized identity mapping. Different people never share memories.
6. **Cross-channel linking** by short-lived, single-use codes and proof of account ownership. At least one tester completes Web → Telegram → iMessage with the *same verified app user*.
7. **Memory receipts**: visible “Remembered from earlier” cards in web or a concise messaging explanation with the underlying factual memory and blob reference, omitting sensitive details in public screenshots.
8. **Corrections**: new preference supersedes an old one; the agent never knowingly recommends from the obsolete fact.
9. **Live deploy and evidence**: 3 real opted-in users, 10 confirmed blobs each, cross-session tests, before/after traces, public repo and submissions.

### P0 with release gate (do not overbuild)

- iMessage Photon Cloud credentials + managed line provisioning must be tested early. If blocked by external access, deploy web/Telegram and **report iMessage as attempted but incomplete**. This is a truthful contingency, not permission to ignore the iMessage target.
- The MVP may operate without email accounts, live destination data, live hotel search, hotel partnerships, prices, availability, notifications, or automated outbound follow-ups.

### P1 / future

- Live hotel and flight discovery via approved providers; inventory/availability checks; booking redirects; restaurant reservation integrations; merchant partnerships; trusted review grounding; payments; calendar and itinerary connectors; preferences portability under individually controlled custody; proactive notifications with opt-in.

## 4. Delivery sequence: fixed 10-hour build budget

Use **Pi + Muse Spark Contributor** and your established skill routing: `/skill:ship-slice` for each bounded vertical slice, `/skill:repo-scout` only if repo reality is unknown, `/skill:fast-build` only for genuinely coordinated multi-slice continuation. One slice per prompt; preserve working changes; no speculative rewrites.

| Time elapsed | Milestone | Evidence / gate | Cut line |
|---|---|---|---|
| T+0:00–0:40 | **M0 — Credentials and skeleton** | Repo initialized, health checks for DeepSeek + Walrus production relayer, Photon project/line credential check, database connection | Do not polish UI before API + Mainnet capability |
| T+0:40–2:30 | **M1 — Memory vertical slice** | Save one fact → job `done` → valid `blob_id` → close session → semantic recall actually affects new answer; test 2 namespaces | Stop if Walrus isn't truly persistent |
| T+2:30–3:40 | **M2 — Web chat + correction** | Deployed web chat, guest identity/session, memory receipts and correction handling; basic responsive polish | Minimize visual flourish |
| T+3:40–5:20 | **M3 — Photon two-channel bridge** | Telegram and iMessage inbound + reply on live Spectrum credentials; messages use same app core | No separate platform-specific brain |
| T+5:20–6:10 | **M4 — Cross-channel identity** | Link same user safely; verified web → Telegram → iMessage recall; deny unlinked cross-person reads | Don't match by usernames |
| T+6:10–7:30 | **M5 — Test with humans** | 3 consenting users, ≥10 completed memories *each*, original session and new session tested; save sanitized proof | Count blobs, not lines in transcript |
| T+7:30–8:30 | **M6 — Reliability + documentation** | Smoke tests, README setup, environment example, screenshots, recorded demo, known limitation section | Fix only submission-blocking bugs |
| T+8:30–10:00 | **M7 — Article & submissions** | Publish story, X post, external community promotion, bug/friction feedback, DeepSurge and Airtable submitted; confirmation captured | Reserve last 30 min for forms |

This is an execution allocation, not a promise of actual runtime or deployment speed. Parallelize credential setup and tester recruitment where possible. Start tester outreach **at T+0** so real people are ready.

### Explicit stop-the-line gates

- **At T+0:40:** Walrus production credentials must be available and a smoke write must be plausible. If blocked, solve this before making mock-memory UI.
- **At T+2:30:** At least one genuine `remember` + wait + `recall` interaction completed with a blob ID on Mainnet.
- **At T+5:20:** At least one live Photon provider works; confirm iMessage line availability rather than assume provisioning succeeded.
- **At T+7:30:** Human usage and Mainnet blob proof outweigh any additional feature or animation.
- **At T+9:30:** Finish *actual* submission forms, not slide-deck improvements.

## 5. Work packages and task IDs

| ID | Task | Dependency | Done when |
|---|---|---|---|
| A01 | Scaffold TypeScript web + always-on Spectrum worker + shared server core | None | Both processes start; `.env.example` complete |
| A02 | Mainnet MemWal credentials, health, SDK adapter | A01 | Registered key/account works; `rememberAndWait` blob ID logged |
| A03 | DeepSeek inference adapter and extract/recall/answer pipeline | A02 | Fresh session answer uses eligible alternative LLM + Walrus result |
| A04 | Minimal app identity, session, and tenant namespace | A01 | Separate accounts cannot fetch each other's memories |
| A05 | Correct/delete-from-recall disclosure and memory receipts | A03–A04 | Correction beats old fact in tested response |
| A06 | Web chat UI and deployment | A03–A04 | Real tester can send and receive messages via deployed URL |
| A07 | Photon Telegram provider | A03–A04 | Sends and receives on Telegram; no duplicate replies |
| A08 | Photon iMessage provider | A03–A04 | Sends and receives on real iMessage thread; not simulated |
| A09 | One-time code cross-channel linking | A04, A06–A08 | Linked tester recalls same memory on all 3 surfaces |
| A10 | Evidence capture + tests + README | A02–A09 | 3 users × 10 confirmed blobs, logs and screenshots with consent |
| A11 | Article + X + community + feedback + forms | A10 | Public URLs and submission receipts saved |

## 6. Acceptance dashboard

- [ ] Production Walrus Memory account/delegate key configured; `https://relayer.memory.walrus.xyz` verified
- [ ] ≥30 Mainnet blob IDs confirmed from at least 3 separately scoped people; no shared demo namespace
- [ ] 3 people × ≥10 accepted-and-**completed** memories (and per-user evidence)
- [ ] Returning session uses a stored preference + **why** in a grounded answer
- [ ] Correction scenario prevents obsolete recommendation
- [ ] Negative controls: no relevant memory → honest uncertainty; unlinked other user → no leakage
- [ ] Deployed Web + Telegram + **live iMessage** proof, or clear documented external iMessage blocker
- [ ] Web → Telegram → iMessage linked-user transition demonstrated
- [ ] GitHub repo public, `.env.example`, README with complete reproduction, tests and deployment notes
- [ ] Article 500–800 words with meaningful before/after, actual proof and honest usage duration
- [ ] X post + external relevant non-Walrus/Sui community promotion
- [ ] Friction report/improvement idea; GitHub bug issue **only if truly reproducible and not duplicate**
- [ ] Dedicated Sessions wallet + agent ID + Mainnet blob count supplied
- [ ] Official Airtable form **and** DeepSurge completed before 15:00 Lagos on 9 October 2026

## 7. Evidence protocol (start recording from first real test)

Create `evidence/` locally; publish only sanitized/consented artifacts. Keep `evidence/private/` out of Git.

For each real tester:

1. Obtain informed consent before saving personal preferences or recording/sharing screenshots.
2. Create one confirmed app identity and one dedicated `anghkooey:v1:u:<UUID>` namespace; verify both are consistent across channels.
3. Have the tester share 10 **real, distinct, consented preference/experience facts** naturally. **Do not invent backdated testers or inflate fact counts.**
4. Track each successful Walrus job: `user_test_label`, `job_id`, `blob_id`, `namespace`, `completed_at`, and optional sanitized fact category; job count without blob ID is insufficient.
5. Start a **new conversation/session**, ask one question requiring old context, save question/answer and the retrieved blob IDs.
6. Demonstrate an explicit correction and repeat the question. Save result proving current preference wins.
7. For one tester, run Web → Telegram → iMessage and screenshot all surfaces with account linkage proof. If a channel fails, document it honestly.
8. With memory disabled, rerun a comparable prompt (not a staged false quotation). Contrast absence of contextual knowledge with correct recall. Mark any comparison from an isolated memory-disabled mode as such.
9. Save timestamps, SDK version, model ID, relayer network, deployment URL, git SHA. No API keys, phone numbers, raw private chats, or full personal itineraries in public evidence.

**Suggested tester diversity:** one person primarily discussing hotel preferences, one discussing travel habits, and one discussing dining constraints. This establishes one memory engine across three real needs. Never use a scripted test account as a substitute for a real-user requirement.

## 8. Prize category strategy

| Category | Submission proof | Ownership |
|---|---|---|
| Best Chatbot | Verifiable cross-session recall, separate users, safe updates, deployed UI, Mainnet blob IDs | M1–M6 |
| Beyond the Big Two | State **DeepSeek Flash** as primary *in-app* model, actual API/runtime, version and any MemWal integration friction; Pi/Muse Spark is development tooling | M1 + article |
| Best Article | Story of a real annoying repetition → memory implementation → what broke → before/after user effect | M7 |
| Bug Bounty | Reproducible original issue with SDK version, OS, runtime, steps, actual/expected, safe logs; quality over volume | M6/M7 |
| Promo Prize | Genuine useful post in an eligible external dev/hospitality community; public link, community rules respected; X alone doesn't count | M7 |

## 9. Risk register and response

| Risk | Probability / impact | Mitigation |
|---|---|---|
| Mainnet setup/credits/delegate mismatch | High / Critical | Validate first; verify `health`, account, delegate, production relayer; do not assume staging counts |
| Photon iMessage provisioning/credentials | Medium / High | Attempt immediately; use Spectrum Cloud documentation, persistent worker and real-send test; keep web/Telegram live contingency |
| SDK indexing lag | High / Medium | `rememberAndWait` or `waitForRememberJob`, show pending state, log blob IDs; retry carefully without duplicates |
| Conflicting memories | Medium / High | Version facts in app metadata, supersede old blob IDs, relevant retrieval plus correction precedence |
| Duplicate inbound channel events | Medium / Medium | Unique `(provider, provider_message_id)` and atomic idempotency guard |
| Cross-user data exposure | Low / Critical | Verified provider identities, server-generated namespaces, never trust user-supplied namespace |
| No live inventory | Certain / Low | Truthful copy: compare user-provided descriptions; no made-up real-time prices/availability |
| Insufficient real testing time | High / High | Recruit immediately; capture honest duration, ≥3 consenting people, live sessions, real evidence |
| Article/forms left too late | High / Critical | Prewrite outline during development; submission deadline buffer is protected |

## 10. Hand-off instructions for Pi

- Read **all four documents** as an implementation contract; never rebuild features already present. State what actually exists before changes.
- Work one bounded vertical slice at a time via `/skill:ship-slice`; favor shipping over audits or speculative architecture.
- Use **actual** package exports and SDK version installed; official docs may evolve. Do not invent Photon event field names or MemWal endpoints.
- Preserve unrelated working-tree changes. Tests: targeted unit/integration/smoke + typecheck/build **once per slice**; fix failures, no repeated verification loops.
- Log real proof: source of fact, namespace, blob ID, recalled snippet, model/runtime, channel, response. Obfuscate user content and never log secrets.
- When stuck, report exact blocker + smallest viable workaround. Never silently substitute localStorage, SQL preferences, mock Walrus or fake iMessage screenshots.

## 11. Reference sources (checked 8 October 2026)

- Official event rules: https://thewalrussessions.wal.app/chatbots/index.html
- MemWal SDK and operational guide: https://github.com/MystenLabs/MemWal and https://github.com/MystenLabs/MemWal/blob/dev/SKILL.md
- Photon Spectrum SDK: https://github.com/photon-hq/spectrum-ts and https://photon.codes/docs/spectrum-ts/introduction
- DeepSeek official API: https://api-docs.deepseek.com/

*These are planned requirements, not claims that Anghkooey has already been built, deployed, used, or submitted.*
