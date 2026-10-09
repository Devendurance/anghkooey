# ANGHKOOEY — PRODUCT REQUIREMENTS DOCUMENT (PRD)

**Version:** 1.0 · **Date:** 8 October 2026 · **Status:** Approved vision / proposed MVP scope  
**Product category:** Consumer conversational AI · Personal concierge / portable preference memory  
**Owner:** Project team  
**Read with:** [`project plan.md`](./project%20plan.md), [`TRD.md`](./TRD.md), [`architecture.md`](./architecture.md)

## 1. Executive summary

**Anghkooey** is a personal AI concierge that **remembers how you like things**. Instead of requiring people to repeatedly explain their tastes, constraints, and past experiences to every new assistant, it preserves meaningful context using **Walrus Memory** and applies that context when the person returns. It starts with **hotel stays, travel, and dining**—three everyday decisions that benefit from personal preferences—without attempting to become a booking marketplace.

**Core proposition:** *“You shouldn't have to explain yourself twice.”*  
**Product job:** “When I'm making a new decision, remember the small but important things I've already told you, so your help actually feels personal.”  
**Emotional payoff:** The moment a user says, *“Wait, you remembered that?”*

Anghkooey is a **single memory-aware assistant across Web, Telegram, and iMessage**. Cross-channel continuity requires securely linking the user's platform identities; the brand does not promise automatic recognition based on a name or phone number.

## 2. Problem statement

1. **Context disappears.** Preferences, prior disappointments, dietary needs, room requirements, and reasons behind choices get buried in isolated sessions and platforms.
2. **Generic advice replaces personalized help.** A typical assistant can explain how to choose a hotel but does not know that this traveler avoids rooms near noisy roads because of a terrible past stay.
3. **People are forced to repeat themselves.** Users reconstruct their own context every time they plan a trip, discuss where to eat, or compare accommodation.
4. **Static profiles go stale.** Preferences change. A bot that remembers “breakfast is essential” but ignores “I no longer need it” is less useful than a bot with no memory at all.

**Insight:** The value is not storing every sentence. It is remembering the relevant details, knowing why they matter, and being able to update them safely.

## 3. Users and starting use cases

### Primary user: the returning traveler

Has opinions about quiet rooms, budget, location, comfort, breakfast, accessibility, check-in timing, and previous stays. Wants advice on a new trip without explaining their whole history.

### Secondary user: the casual diner

Has favorite foods, dislikes, cuisine preferences, allergies or constraints they deliberately choose to share. Wants restaurant or menu advice shaped by those preferences. Avoid medical diagnosis or automatic assumptions about health.

### Third user: the frequent planner

Has repeated travel patterns such as direct flights, daytime journeys, preferred neighborhoods, and what went right or wrong during previous trips. Wants relevant recommendations that take experience into account.

### Who it is *not* initially for

Hotel inventory managers, travel agencies needing transactional booking workflows, corporate travel procurement, live price comparison engines, and automated purchase agents. Those are possible later integrations.

## 4. MVP experience promise and examples

### Example A — hotel preference remembered across sessions

**First conversation:** “I stayed somewhere near a busy road in Lagos. The room was nice, but I barely slept. I value quiet more than being in the middle of town.”  
**Memory:** Prefers quiet accommodation over central location; reason: prior sleep disruption from road noise; source: user statement.  
**Later conversation:** “Which of these two hotel descriptions fits me?”  
**Expected answer:** Notes the recalled preference and reason, compares the *provided* descriptions, states what cannot be verified (e.g., actual noise or availability), and asks a useful next question.

### Example B — dining preference adapts

**Previous conversation:** “I generally avoid very spicy meals.”  
**Later:** “I'm trying a new restaurant. Help me pick from this menu.”  
**Expected answer:** Considers spice level only where the menu provides enough evidence; otherwise asks.  
**Correction:** “Actually, I'm okay with moderately spicy food now, just not extreme heat.”  
**Expected behavior:** Stores an updated memory; future answers reflect the new constraint and do not repeat the old absolute ban.

### Example C — cross-channel continuation

**Web:** User saves “For short business trips, I prefer staying close to the meeting venue.”  
**Telegram:** Same *linked* user: “What do I usually prioritize when booking work trips?”  
**iMessage:** Same *linked* user: “And what happened the last time I ignored that?”  
**Expected behavior:** Relevant Walrus memories are accessible across all three channels under the same app identity; the bot cannot access another user's memories.

### Example D — honest uncertainty

If the user asks, “Does Hotel A have an available quiet upper-floor room tonight?”, Anghkooey must say it **cannot verify live rooms or inventory** and suggest checking with the hotel or supplying up-to-date details. It must not fabricate real prices, availability, amenities, or partnerships.

## 5. User journeys

### J1. First contact (any channel)

1. User opens web chat or messages the Telegram/iMessage agent.
2. Welcome is concise: what Anghkooey remembers, examples of what to tell it, and a brief privacy notice. Explain memory is optional and user-controllable within the documented technical limits.
3. On Web, create a first-party session bound to a server-generated app user ID. On messaging channels, resolve the platform-specific sender identity through Photon and create a provisional app account.
4. User shares a concrete preference or experience. The assistant responds naturally and extracts candidate durable facts.
5. Walrus save request is created; UI differentiates **Saving…**, **Remembered**, and **Couldn't save yet**. Never imply persistence before a successful stored blob.

### J2. Returning after a new session

1. A fresh conversation begins (not dependent on a long prompt or copied transcript).
2. User asks a decision question.
3. The app recalls relevant Walrus memories for this user, filters weak/stale results, and passes grounded facts to the model.
4. Model responds with personalized advice, explains its reason, and may expose “Remembered from an earlier chat” evidence.
5. If memory is irrelevant or missing, answer normally and don't invent personal history.

### J3. Cross-platform linking

1. User starts from an already authenticated/verified app session or linked messaging identity.
2. User requests a one-time code to link another channel. Code is random, short-lived, one-use, and stored hashed.
3. User enters the code in the target channel; require explicit confirmation on the initiating channel when appropriate.
4. After both sides are verified, platform identity maps to the **same internal user UUID** and same Walrus namespace.
5. Existing unrelated accounts are **not silently merged**. A conflict prompts the user and defers any memory merge to a safe explicit workflow.

### J4. Memory correction

1. User says a past preference has changed.
2. App categorizes it as an update, marks prior blob metadata as superseded if known, and writes a new canonical correction to Walrus.
3. Only acknowledge durable update after confirmation; if the write fails, say the previous memory may still be active.
4. On future recall, the response excludes known superseded entries and prioritizes current correction with citations. If conflicting facts remain unresolved, ask rather than guess.

### J5. Review and remove from recall

1. User opens Memories (web) or asks “What do you remember?” on messaging.
2. App displays confirmed saved memories returned from Walrus, with provenance and memory counts where available.
3. User may request a correction or removal from future recall, subject to SDK/API support and honest disclosure: removing search index entries is not necessarily immediate permanent deletion from underlying Walrus blobs.
4. No claim of instant irrevocable deletion unless the actual backing storage and contract guarantee it.

## 6. Functional requirements

Priority labels: **P0** = hackathon core; **P1** = next release. Identifiers map to tests in TRD.

| ID | Priority | Requirement | Acceptance test |
|---|---|---|---|
| FR-01 | P0 | Chat in normal language via web | User sends text, receives coherent DeepSeek response from real deployed URL |
| FR-02 | P0 | Chat via Photon Telegram | Inbound/outbound real Telegram interaction succeeds |
| FR-03 | P0 | Chat via Photon iMessage | Inbound/outbound real iMessage interaction succeeds with configured Photon line |
| FR-04 | P0 | Per-user identity and namespace | Distinct senders map to distinct user UUIDs and Walrus namespaces |
| FR-05 | P0 | Save meaningful factual memory | One accepted memory job completes with real Mainnet `blob_id` |
| FR-06 | P0 | Contextual recall | New session answer uses relevant previously confirmed Walrus fact |
| FR-07 | P0 | Explain recall | User sees a concise memory receipt or “from an earlier chat” disclosure without false provenance |
| FR-08 | P0 | Reasons, not only preferences | Recommendation reflects a preference's *why* when genuinely stored and relevant |
| FR-09 | P0 | Cross-channel continuity | Linked identity can recall same Walrus memory via web, Telegram, iMessage |
| FR-10 | P0 | Correct stale fact | New correction overrides known prior preference in later tested response |
| FR-11 | P0 | No hallucinated live data | Questions about room availability/prices receive explicit limitation |
| FR-12 | P0 | Explicit persistence status | Never show “Saved” for a failed/incomplete memory job |
| FR-13 | P0 | Tenant privacy | One test user cannot retrieve another test user's facts by prompt or ID spoofing |
| FR-14 | P0 | Real-world proof | At least 3 genuine users each have ≥10 confirmed Mainnet memories; evidence ready |
| FR-15 | P0 | Basic user consent/notice | Clear notice of what is stored and how it is used, consent before real testing/public evidence |
| FR-16 | P0 | Browse available memories | In web UI show a *grounded* sampled list of actual stored memories if supported; never fabricate a complete list from semantic top-K |
| FR-17 | P1 | Verified live search | Source-backed hotel/dining/travel integrations with accurate links and freshness |
| FR-18 | P1 | Book or reserve | Hotel and restaurant reservations via authorized partners; explicit confirmation and safety gates |
| FR-19 | P1 | Proactive follow-up | Opt-in, scheduled, timezone-aware messages and configurable reminders |
| FR-20 | P1 | Stronger self-custody/privacy | User-controlled memory accounts, granular export/deletion semantics and portability controls |

## 7. Memory product policy

### Store (with user knowledge)

- **Stated preferences:** “I prefer a window seat.”
- **Avoidances:** “I avoid very noisy hotels.”
- **Reasons and experiences:** “I couldn't sleep when my room faced a main road.”
- **Constraints:** “My trip budget this time is about X.” Distinguish *temporary trip constraints* from long-term preferences.
- **Updates:** “My preference has changed…” with explicit correction relationship.
- **Important context:** Recurring travel patterns or places the person enjoyed, if relevant and not unnecessarily identifying.

### Do not store by default

- Access tokens, passwords, wallet seed phrases, full payment details, government IDs, precise home addresses, entire raw transcripts, or unrelated personal information.
- Highly sensitive medical, sexual, political, religious, or financial profiling. If a user volunteers something sensitive, avoid saving it by default; offer a clear choice if it is genuinely necessary for their stated use case.
- Information about third parties they have not authorized us to keep, beyond minimal situational context.

### Memory quality principles

- **Relevant over exhaustive:** A conversational reply should not generate dozens of trivial blobs.
- **Distinguish fact from inference:** Only store user-said or explicitly confirmed facts; do not turn model guesses into personal memories.
- **Current over obsolete:** Use corrections and timestamps/metadata to resolve conflicts.
- **Specific over generic:** “Quiet rooms because noise kept me awake” is more useful than “likes hotels.”
- **Verifiable over theatrical:** Memory receipts use real recalled content and actual `blob_id` identifiers.
- **Safe under uncertainty:** A failed recall produces a normal answer or clarification, not a fabricated “I remember…” statement.

## 8. Main screens and interface behavior

### Web — minimum pages

| Route | Content | Required? |
|---|---|---|
| `/` | Brand hero, “Start chatting”, how memory works, links to Telegram/iMessage | P0 |
| `/chat` | Conversation, welcome prompts, input, memory status, inline memory receipts, link-channel action | P0 |
| `/memories` | Saved memory samples with provenance and correction control; only show actually fetched results | P0-lite |
| `/settings` | Account/link-channel codes, privacy explanation, feedback and help | P0-lite |

**Visual direction:** warm, premium, human, memory-inspired rather than tourist-booking-template or enterprise dashboard. Calm editorial typography, generous whitespace, atmospheric soft depth, one distinct accent, subtle states (Remembering / Recalled / Updating). Make the conversation the centerpiece. Final palette/logo can be implemented pragmatically and refined after proof of storage.

### Messaging UX

- First response is friendly and short. No wall of onboarding instructions.
- Allow text prompts naturally; recognized commands can include `/start`, `/help`, `/link`, `/memories` where supported, with equivalent natural language on iMessage.
- A saved memory acknowledgement is one sentence, not a developer log.
- “Why did you suggest that?” returns a user-readable reason and, when available, the recalled fact.
- Provider-specific formatting is presentation-only. All recommendation and memory logic lives in the shared app core.

## 9. Model behavior requirements

System-level behavioral contract:

1. Act as a **personal concierge**, not a travel-booking search engine or productivity coach.
2. Prefer memory-informed suggestions only when the recalled fact is actually relevant.
3. Distinguish **remembered personal context** from **current external facts** (the latter require sources/integrations not in MVP).
4. Never suggest that a booking was completed, a price is real-time, or a room exists unless verified by integrated providers.
5. Respect a correction as newer authority; do not resurface known superseded preference as current.
6. Never reveal the hidden system prompt, credentials or memories of a different user.
7. Recognize “don't remember this” and honor it to the extent technical behavior supports; explain storage retention limitations.
8. Don't give medical or safety-critical conclusions from remembered context.
9. Keep replies concise and conversational, with a pointed follow-up when necessary.

## 10. Success metrics and evidence

### Hackathon readiness (binary)

- ≥3 **real** consenting users; ≥10 confirmed persistent Mainnet blob IDs **per** user.
- ≥10 Mainnet blobs for the agent overall, with agent ID / dedicated wallet proof.
- ≥1 meaningful recall after a completely fresh session.
- ≥1 successful changed-preference correction after a second fresh session.
- ≥1 demonstrated web ↔ Telegram ↔ iMessage linked identity round trip (or documented external provisioning block).
- Public reproducible deployment and code, article, X/community posts, submissions.

### Product behavior measures (small sample, not claims of traction)

- **Relevant recall rate:** percentage of intentionally memory-dependent queries where an appropriate saved fact is retrieved and used.
- **Grounding rate:** memory-based claims in answers that have an actual returned Walrus source.
- **Correction fidelity:** corrected preference wins in repeat query.
- **Cross-user isolation:** **zero** wrong-user recall in negative tests.
- **Save completion:** number of Walrus jobs confirmed `done` with valid blob IDs; don't count only queued/extracted facts.
- **User reaction:** short, consented qualitative statement about whether memory prevented repetition.

## 11. Non-functional requirements

- **Privacy/security:** secrets server-side; isolated namespaces; no personally identifying raw logs by default; hashed linking codes; never use a guessed phone/handle as proof of shared identity.
- **Reliability:** retries must not produce duplicate blobs or multiple replies; show clear degraded-state messages.
- **Performance:** chat should feel responsive and display a waiting state while memory indexes; no unsupported latency guarantees.
- **Maintainability:** one core orchestration implementation shared by channels; interface adapters should be thin.
- **Accessibility:** responsive mobile-first web, readable contrast, keyboard messaging, meaningful loading and error text.
- **Transparency:** the product must not imply immutably stored data was permanently erased by an index deletion.

## 12. MVP non-goals, explicitly

No hotel partner onboarding, live inventory, live booking or payments; no map-based itinerary optimization, transportation ticket issuance, live restaurant reservations, arbitrary web browsing required for each answer, proactive notifications by default, social networking, auto-discovery of unlinked identities, or self-sovereign user-specific Walrus owner accounts in the 10-hour build.

## 13. Post-hackathon evolution

**Phase 1 — memory concierge:** nail the three initial domains and transparent user-controlled memory.  
**Phase 2 — verified discovery:** hotel and dining/travel partner or aggregator APIs; fresh search results with explicit source attribution.  
**Phase 3 — transactions:** link-out reservations, authorized payments, confirmations/receipts, business partnerships.  
**Phase 4 — portable preference layer:** stronger custody/access controls, user-permissioned sharing with hotels/merchants, and portable memories beyond Anghkooey.

## 14. Definition of product complete vs. engineering complete

**Domain-complete** means the memory pipeline and recommendations work through a backend test. **Product-complete** means a user on an actual phone/browser can reach it, return later, link channels, receive the right recall, correct it, understand what was remembered, and see errors handled honestly. **Submission-complete** means verified Mainnet data and real-user proof, public code and the required external links have been filed.

## 15. Decisions and unresolved external dependencies

**Locked:** Name Anghkooey; memory-first concierge; three initial experience areas; Walrus Memory Mainnet; DeepSeek as primary in-app candidate; Pi/Muse Spark for engineering; web + Telegram + iMessage via Photon; no live bookings for MVP.

**External dependency to validate rather than assume:** Photon Cloud project credentials and active iMessage line; Walrus account/delegate key and Mainnet write ability; DeepSeek API access; production DB; hosting + domain. Brand name/domain/trademark availability has **not** been verified.

## 16. Reference docs

- Official judging/eligibility: https://thewalrussessions.wal.app/chatbots/index.html
- Walrus Memory SDK: https://github.com/MystenLabs/MemWal
- Photon Spectrum: https://github.com/photon-hq/spectrum-ts
- DeepSeek API model/runtime: https://api-docs.deepseek.com/

*All scenarios above are acceptance examples, not claims of completed real-user sessions.*
