<div align="center">

<a href="https://anghkooey.vercel.app" aria-label="Visit Anghkooey">
  <img src="./public/brand/anghkooey/web/folded-a.webp" alt="Anghkooey folded-A symbol" width="76" />
</a>

<br />

<img src="./public/brand/anghkooey/web/wordmark.webp" alt="ANGHKOOEY" width="390" />

### You shouldn't have to explain yourself twice.

**A personal AI concierge that remembers how you like things.**  
Anghkooey brings relevant preferences, constraints, and past experiences back into your next conversation — starting with hotels, travel, and dining.

It can also turn those preferences into practical steps: research hotel options, discover published contact channels, draft personalized inquiries, and send explicitly approved emails through a connected Gmail account.

<p>
  <a href="https://anghkooey.vercel.app"><img alt="Visit website" src="https://img.shields.io/badge/Visit%20Website-05080F?style=for-the-badge&logo=vercel&logoColor=D8DCFF" /></a>
  <a href="https://anghkooey.vercel.app/chat"><img alt="Start web chat" src="https://img.shields.io/badge/Start%20Talking-4F5CFF?style=for-the-badge&logo=wechat&logoColor=white" /></a>
  <a href="https://t.me/useanghkooey_bot"><img alt="Chat on Telegram" src="https://img.shields.io/badge/Telegram-229ED9?style=for-the-badge&logo=telegram&logoColor=white" /></a>
</p>

<p>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/Code%20License-MIT-D8DCFF?style=flat-square" /></a>
  <a href="https://www.walrus.xyz/"><img alt="Memory: Walrus Mainnet" src="https://img.shields.io/badge/Memory-Walrus%20Mainnet-4851A8?style=flat-square" /></a>
  <a href="https://api-docs.deepseek.com/"><img alt="AI: DeepSeek Flash" src="https://img.shields.io/badge/AI-DeepSeek%20Flash-254E9B?style=flat-square" /></a>
  <a href="https://github.com/Devendurance/anghkooey"><img alt="Open source on GitHub" src="https://img.shields.io/badge/Source-GitHub-171719?style=flat-square&logo=github" /></a>
</p>

[**Explore the experience**](#the-experience) · [**How memory works**](#how-memory-works) · [**From memory to action**](#from-memory-to-action) · [**Run locally**](#run-it-locally) · [**Architecture**](#architecture) · [**Documentation**](#project-documentation)

</div>

---

## Why Anghkooey?

Most assistants can answer a question. Fewer can carry forward the *reason behind your preferences*.

A quiet hotel room matters differently when you've said road noise kept you awake on your last trip. Anghkooey is designed to remember that context — **when you consent to saving it** — and use it when it becomes relevant again.

**The idea is simple:** remember the preference, preserve the reason, and let the person correct it when life changes.

## The experience

| Experience | What you can do |
| :--- | :--- |
| **Web chat** | Start a real DeepSeek conversation in the browser, without email signup or a wallet. |
| **Memory, by choice** | Opt in before Anghkooey saves lasting preferences to Walrus Mainnet. Chat remains usable with memory saving off. |
| **Personalized recall** | Receive answers informed by relevant, previously saved Walrus memories, with recall receipts when available. |
| **Memory library** | Browse confirmed memory metadata, filter by category/status, and search for matching stored facts. |
| **Corrections** | Replace an outdated preference with a new confirmed Walrus memory; the old record is retired from recall, not deleted from Mainnet. |
| **Linked conversations** | Connect a browser identity with Telegram or an iMessage chat using a single-use code and verified in-channel approval when accounts need consolidating. |
| **Privacy controls** | Change memory consent and end a browser session, with clear information about what each action does *not* erase. |
| **Trip Brief and real hotel search** | Describe a destination, dates, party size, and budget in natural language. Anghkooey looks up real hotel candidates through SerpApi's Google Hotels results, with source links and indicative observed rates. |
| **Saved hotel shortlist** | Reopen the latest relevant shortlist using `HOTELS`; dates, candidate sources, and rate limitations stay visible. |
| **Hotel contact discovery** | Use `CONTACT 1,2` to check published email, contact form, phone, or messaging options. Results include direct validated links when available and honest timeout/no-contact outcomes. |
| **Optional Gmail connection** | Connect your own Gmail account in web Settings with Google OAuth (`openid`, `email`, and `gmail.send`); Anghkooey does not request Gmail inbox-reading access. |
| **Approval-first inquiries** | Prepare a single hotel inquiry or up to three distinct hotel inquiries, inspect full drafts, and approve an exact email or batch with a short-lived, single-use code. Every accepted send has its own Gmail receipt. |

**Channel availability:** web chat and the [Telegram bot](https://t.me/useanghkooey_bot) are the public entry points. iMessage is working through Photon Spectrum in **limited, invitation-based testing**; an authorized tester must be added before they can message the agent. There is no public iMessage number advertised here.

### Product gallery

> **Visual placeholders:** Add your actual screenshots to `docs/media/` before publishing a demo-focused README. These slots are deliberately labelled rather than displaying invented product screenshots or broken image links.

<p align="center"><strong>01 — The cinematic opening</strong></p>
<p align="center"><em>📷 Add <code>docs/media/landing-hero.png</code> — folded-A reveal / orbital hero</em></p>

<!-- Replace the placeholder above after adding your real screenshot:
<p align="center"><img src="./docs/media/landing-hero.png" alt="Anghkooey's dark cinematic landing page" width="900" /></p>
-->

<p align="center"><strong>02 — A conversation that remembers</strong></p>
<p align="center"><em>📷 Add <code>docs/media/web-chat.png</code> — web chat with a real memory-recall receipt</em></p>

<!-- Replace the placeholder above after adding your real screenshot:
<p align="center"><img src="./docs/media/web-chat.png" alt="Anghkooey web chat showing a recalled Walrus memory" width="900" /></p>
-->

<p align="center"><strong>03 — Memories, corrections, and connections</strong></p>
<p align="center"><em>📷 Add <code>docs/media/memories-and-profile.png</code> — memory archive and channel linking</em></p>

<!-- Replace the placeholder above after adding your real screenshot:
<p align="center"><img src="./docs/media/memories-and-profile.png" alt="Anghkooey memory archive and connected-channel profile" width="900" /></p>
-->

**Demo video:** _[Add your public demo link here after publication]._  
**Mainnet evidence:** _[Add a sanitized proof/evidence link here when available; do not expose user content]._ 

## How memory works

1. **Tell Anghkooey what matters.** Share a hotel, travel, or dining preference and, ideally, why it matters.
2. **Choose whether to remember it.** Saving new long-term memories requires explicit consent.
3. **Confirm the save.** The server extracts meaningful facts and waits for an actual Walrus Mainnet write; a success label is shown only after confirmation.
4. **Return and ask again.** Anghkooey searches the correct user namespace for relevant memories and supplies that context to DeepSeek Flash.
5. **Correct it later.** Corrections append a new memory and mark the older record as superseded for future recall.

For example:

> **You:** “I avoid rooms facing busy roads because traffic noise keeps me awake.”  
> **Later:** “What should I prioritize when choosing a hotel?”  
> **Anghkooey:** Can use the *confirmed* preference and its reason to advise prioritizing quieter rooms, without pretending to know live availability.

*This exchange is illustrative; it is not a quoted or fabricated production chat transcript.*

### One person, three conversations

Web, Telegram, and iMessage use the same conversation engine. Linking is **not automatic**: a web session generates a one-time, 10-minute code, which the user sends to Anghkooey inside the target messaging channel. Photon verifies the actual sender. If that channel already has a separate memory account, the person explicitly approves consolidation with `MERGE YES` (or declines with `MERGE NO`). Existing memories remain in their original Walrus namespaces and are recalled through authorized identity aliases.

**Important:** an anonymous browser session is not a recoverable email login. Clearing cookies, ending the session, or switching devices can prevent access to that specific web identity. Wallet connection is not required and does not confer individual custody over memories in the current architecture.


## From memory to action

Anghkooey's hotel workflow is designed around the work that typically follows a travel question. The assistant does not book rooms or impersonate a hotel: it helps the person **research, review, approve, and verify** each step.

1. **Ask for a Trip Brief.** State the destination, stay dates, number of travelers, and budget. DeepSeek uses relevant, consented Walrus memories as context; the hotel-search adapter requests candidates from **SerpApi / Google Hotels**.
2. **Inspect the shortlist.** Anghkooey saves up to three candidates for the trip in Neon. `HOTELS` returns the current shortlist with sources, stay dates, and observed rates when supplied. Rates are indicative, **not confirmed inventory or bookings**.
3. **Check contact methods.** `CONTACT 1,2` attempts to find source-backed property or group contact channels. A verified official form is returned as a clickable HTTPS URL, **not misrepresented as an email address**. Unverifiable sites and timeouts are reported honestly.
4. **Prepare inquiries.** After connecting Gmail in web Settings and linking the correct chat identity, `EMAIL` prepares one inquiry; `INQUIRE 1,2` prepares a property-specific batch. `PREVIEW` and `PREVIEW ALL` show the recipients, subjects, and **complete message bodies before approval**.
5. **Approve and inspect receipts.** `SEND <code>` or `SEND ALL <code>` authorizes the exact previewed send once. Anghkooey stores a distinct Gmail message receipt for each accepted email. Gmail acceptance **does not mean delivery, a hotel reply, or a booking**; uncertain send outcomes are not blindly retried.

### Photon messaging commands

These commands are handled by the Photon worker in the relevant iMessage/Telegram conversation; web Settings handles Gmail connection. Send `HELP` in chat for the live command list.

| Intent | Command |
| :--- | :--- |
| Memory consent and status | `YES` to enable future saves; `MEMORY` for memory status |
| Link web and messaging identities | `CONNECT` (web-issued code; `MERGE YES` / `MERGE NO` if consolidation is needed) |
| Create a hotel plan | A natural-language travel request / `TRIP BRIEF` with destination and dates |
| View candidates and find contact methods | `HOTELS` · `CONTACT 1,2` |
| Prepare, review, approve, or cancel one inquiry | `EMAIL` · `PREVIEW` · `SEND <code>` · `CANCEL` |
| Prepare, review, approve, or cancel a batch | `INQUIRE 1,2` · `PREVIEW ALL` · `SEND ALL <code>` · `CANCEL ALL` |
| Check batch outcomes | `INQUIRIES` |

**Current outgoing-email safety mode:** the default batch mode is **test-only** (`GMAIL_BATCH_LIVE=0`). Approved batch messages go to a configured controlled test inbox with `[TEST]` subjects, **not to the hotels**. Live batches require a separately enabled server-side flag and verified reservations-suitable email contacts; do not enable this casually. The single-inquiry send path is also restricted to the configured test inbox. The Google OAuth consent app's wider public verification is still pending, so Gmail connection may be limited to authorized testers.

## Architecture

```mermaid
flowchart TB
    U[User] --> W[Web app / Next.js]
    U --> TG[Telegram]
    U --> IM[iMessage - limited testing]
    TG --> P[Photon Spectrum Cloud]
    IM --> P
    P --> WK[Persistent Photon worker / AWS EC2]
    W --> API[Authenticated web API]
    API --> CORE[Shared conversation orchestrator]
    WK --> CORE
    CORE <--> DS[DeepSeek Flash]
    CORE <--> DB[(Neon PostgreSQL / identities, memory metadata, hotel shortlists, encrypted drafts, receipts)]
    CORE --> HOTELS[SerpApi / Google Hotels]
    WK --> ACTIONS[Hotel contacts and approval-first email workflows]
    ACTIONS <--> DB
    ACTIONS --> CONTACTS[Public hotel contact pages]
    ACTIONS --> GMAIL[Google OAuth / Gmail send API]
    CORE <--> MW[MemWal SDK]
    MW <--> WAL[(Walrus Memory Mainnet)]
```

**Where things live:**

- **Vercel:** Next.js app, chat UI, memory/profile/settings pages, public privacy/terms pages, Gmail connection settings and OAuth callback, and server-side API routes.
- **AWS EC2:** exactly one supervised, continuously running Photon worker for messaging, hotel contact discovery, and approval commands.
- **Neon PostgreSQL:** user/session identities, consent, channel links, idempotency, temporary conversation history, Walrus blob metadata, hotel shortlists/contact evidence, encrypted email drafts, approval state, and Gmail receipts.
- **Walrus Mainnet:** durable memory facts stored through `@mysten-incubation/memwal`. Neon is **not** a replacement long-term preference store.
- **DeepSeek Flash:** the deployed conversation model, independent of any coding assistant used to build the project.
- **SerpApi / Google Hotels:** real hotel-search candidates, source links, and observed indicative rates; not a booking engine.
- **Google OAuth / Gmail API:** optional user-owned, send-only authorization. Server-side AES-256-GCM encryption protects OAuth tokens and pending email content. Email sending requires exact user approval.

### Technology

| Layer | Technology |
| :--- | :--- |
| App | Next.js 16, React 19, TypeScript |
| Styling and motion | Tailwind CSS 4, GSAP / ScrollTrigger, Cormorant Garamond, Satoshi, Georama |
| AI | DeepSeek Flash |
| Durable memory | Walrus Mainnet via MemWal SDK |
| Database | Neon PostgreSQL |
| Messaging | Photon Spectrum (`spectrum-ts`) for Telegram and iMessage |
| Hosting | Vercel (web) and AWS EC2 + systemd (worker) |
| Hotel discovery | SerpApi / Google Hotels; source-validated hotel contact discovery |
| Email | Google OAuth (`openid`, `email`, `gmail.send`); Gmail API with preview-and-approve single and batch inquiries |

## Run it locally

### Prerequisites

- **Node.js 24.x** recommended (the production web deployment uses Node 24).
- npm, Git, a Neon Postgres database, DeepSeek API access, and Walrus Memory Mainnet credentials.
- Photon project credentials and a Telegram bot token **only if running the messaging worker**.
- **Optional hotel discovery:** a SerpApi key for real Google Hotels candidate searches.
- **Optional Gmail workflows:** a Google OAuth web client, a consistent server-side Gmail token encryption key, and a controlled test recipient. Google OAuth verification may limit which Google accounts can connect.

### 1. Clone and install

```bash
git clone https://github.com/Devendurance/anghkooey.git
cd anghkooey
npm ci --legacy-peer-deps --include=dev
```

The peer-dependency flag reflects the repository's current dependency resolution. Don't run `npm audit fix --force` as a substitute.

### 2. Configure server secrets

```bash
# Copy the template only if .env does not already exist.
test -e .env || cp .env.example .env
```

Edit `.env` locally. Never commit it, paste credentials into issues, or expose keys through `NEXT_PUBLIC_*` variables.

| Setting | Purpose |
| :--- | :--- |
| `DEEPSEEK_API_KEY` | DeepSeek API credential |
| `DEEPSEEK_BASE_URL` | DeepSeek API base URL (template includes a default) |
| `DEEPSEEK_MODEL` | `deepseek-flash` |
| `DEEPSEEK_THINKING` | Optional; defaults to `disabled` for normal chat and extraction |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `APP_SESSION_SECRET` | Secret used to protect opaque session tokens; use a strong random value |
| `WEB_BASE_URL` | Local URL in development; public HTTPS origin in production |
| `MEMWAL_PRIVATE_KEY` | Server-only MemWal private credential |
| `MEMWAL_ACCOUNT_ID` | Application-managed MemWal account identifier |
| `MEMWAL_SERVER_URL` | Mainnet relayer URL (template includes a default) |
| `PHOTON_PROJECT_ID` | Photon project identifier, for the worker |
| `PHOTON_PROJECT_SECRET` | Photon server credential, for the worker |
| `TELEGRAM_BOT_TOKEN` | Telegram bot credential, for the worker |
| `SERPAPI_API_KEY` | SerpApi key for Google Hotels results; server-side only |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (web application) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret; server-side only |
| `GMAIL_TOKEN_KEY` | 64-character hex (32-byte) AES-256-GCM key for encrypting Gmail tokens and email drafts; keep the same existing value wherever the Gmail workflow runs |
| `GMAIL_SEND_TEST_TO` | Controlled email address used for approved test sends; required for the safe sending flow |
| `GMAIL_BATCH_LIVE` | Defaults to test mode unless explicitly set to `1`; keep `0` for controlled demos and testing |

The repository's [`.env.example`](./.env.example) is the baseline for core and OAuth credentials; the table above also documents optional hotel search and controlled sending settings. Keep production-only credentials out of client bundles. The public OAuth callback is `/api/gmail/callback` on the configured `WEB_BASE_URL` origin.

### 3. Prepare the database and run the web app

```bash
# Apply the existing migrations to your intended database only.
npm run migrate

npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The web chat is at `/chat`; the memory archive is at `/memories`.

**Do not run migrations against a live database casually.** The deployed project uses an existing migrated Neon database. Use a separate development database when experimenting.

### 4. Optional: run the messaging worker

```bash
npm run photon:readiness
npm run worker:start
```

**Only one Photon worker instance should listen to a given project at a time.** If the AWS production worker is running, **do not** start a second local worker with the same Photon credentials; competing workers can duplicate deliveries and replies. See the [Photon deployment guide](./docs/DEPLOY-PHOTON.md).

### 5. Checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run check:integrations
```

Some integration tests require database access; the full database-backed Gate 1 run passed **255 tests** on an isolated Neon QA branch (see the release QA matrix below). `photon:readiness` is the dedicated Photon check; the generic integration checker may contain legacy Photon status wording. Scripts such as `smoke:memory` and `test-channel-flow` can perform **real, chargeable Mainnet writes** — run them deliberately, not as routine build checks.

## Project structure

```text
src/app/                  Next.js pages and HTTP routes
src/components/           Landing, brand, and app experiences
src/server/               Sessions, identity, DeepSeek, Walrus, orchestration, hotel search, contacts, Gmail
src/lib/                  Shared site configuration and client helpers
workers/photon-worker.ts  Long-running Telegram/iMessage consumer
db/migrations/            PostgreSQL schema and migration history
scripts/                  Readiness, verification, and migration utilities
tests/                    Automated regression and integration tests
docs/                     PRD, TRD, architecture, deployment guides, release QA and OAuth compliance
public/brand/anghkooey/   Branding and production artwork
```

## Trust, security, and current limits

- **Opt-in durable memory.** Memory writes are gated by consent; existing memories may still be recalled when new saving is disabled.
- **Scoped retrieval.** Sessions and verified channel identities determine which Walrus namespaces may be searched.
- **Verified linking.** One-time codes are hashed in the database; Telegram/iMessage identity comes from authenticated Photon events, not a user-entered display name.
- **Transparent provenance.** Chat can show a recalled memory receipt or a confirmed new blob ID. Semantic search returns **matches**, not an exhaustive plain-text inventory.
- **Corrections, not erasure.** Replacing a memory retires its old metadata from recall; it does not promise immediate destruction of an already published Walrus blob.
- **Managed custody.** The current MemWal account and relayer-managed encryption are application-side infrastructure, **not individual wallet custody** or user-held encryption keys.
- **No verified live bookings.** Anghkooey does not claim hotel inventory, current prices, reservations, or integrations it cannot verify.
- **Hotel-contact verification.** Contact methods are sourced from public pages with HTTPS, redirect, DNS/IP and response-size safeguards. A hotel contact form is a link, not an automatically submitted request or verified reservation email.
- **Approval-controlled Gmail.** Gmail uses `gmail.send` without inbox-reading permissions. The exact recipient and draft are shown before any single-use approval; parallel/repeated approvals are guarded against duplicate sends.
- **Test mode and honest receipts.** The current controlled demonstration sends to a test inbox only, not to actual hotels. Gmail receipts confirm API acceptance, not delivery. Partial/uncertain outcomes remain explicit and are not automatically resent.
- **Email record retention.** Gmail draft, batch, and receipt records are encrypted where applicable but are **not automatically deleted** on approval-code expiry, cancellation, or Gmail disconnection. See the [Privacy Policy](https://anghkooey.vercel.app/privacy) for current retention limitations.
- **Google OAuth verification.** The OAuth flow is implemented, but public Google verification remains pending; connected Gmail access may be restricted to authorized testers.
- **No cross-device web recovery yet.** Guest browser sessions are convenient but should not be mistaken for a full account-recovery system.
- **iMessage is in testing.** Public contact details will appear only when a supported public channel is available.

Do not publish other users' memory contents, private IDs, or unredacted receipts in demos or issues without their permission.

## Deployment

The production architecture uses separate hosts for web and messaging:

- **Web:** [Vercel deployment guide](./docs/DEPLOY-WEB.md). Set server-only environment variables, use `WEB_BASE_URL` with your public HTTPS domain, and verify `/api/health` plus actual chat behavior. Disable deployment protection for the public production domain before inviting users or judges.
- **Worker:** [Photon deployment guide](./docs/DEPLOY-PHOTON.md). Use a persistent systemd or container process; verify readiness and real message replies. Keep exactly one active consumer. Web and worker environments must use the same existing Gmail encryption key if both access the same encrypted Gmail records.
- **Gmail OAuth:** Configure the Google web client to permit the callback at `<WEB_BASE_URL>/api/gmail/callback`. Do not confuse working OAuth for test users with Google's approval for unrestricted public access.

The web app being *built successfully* does not by itself prove the messaging worker is running. Conversely, worker readiness is not a substitute for a live Telegram/iMessage test.

## Project documentation

| Document | What it covers |
| :--- | :--- |
| [Product requirements](./docs/PRD.md) | User journeys, intended experience, acceptance criteria |
| [Technical requirements](./docs/TRD.md) | Architecture contracts, security, memory semantics |
| [System architecture](./docs/architecture.md) | Data flows and trust boundaries |
| [Brand messaging](./docs/anghkooey%20brand%20messaging.md) | Positioning, UX language, responsible claims |
| [Design system](./DESIGN.md) | Typography, palette, motion, visual patterns |
| [Web deployment](./docs/DEPLOY-WEB.md) | Vercel and API configuration |
| [Photon deployment](./docs/DEPLOY-PHOTON.md) | Worker hosting and secure channel linking |
| [Backend status](./BACKEND-STATUS.md) | Implementation notes and verified backend milestones |
| [Photon Gate 1 QA matrix](./docs/release/PHOTON-QA-MATRIX.md) | Database-backed integration testing, security verification, and remaining limits |
| [Photon Gate 2 QA report](./docs/release/PHOTON-GATE2-QA.md) | Web/mobile UX checks and Photon command review |
| [Google OAuth compliance notes](./docs/release/GOOGLE-OAUTH-COMPLIANCE.md) | Public site disclosures and outstanding external verification steps |
| [Privacy Policy](https://anghkooey.vercel.app/privacy) | Data use, consent, Gmail scope, retention, third parties |
| [Terms of Service](https://anghkooey.vercel.app/terms) | Terms and acceptable-use policies |

## License and assets

The **original software source code** in this repository is made available under the [MIT License](./LICENSE) — see the license text for terms and warranty disclaimer.

**Brand marks, the Anghkooey name, original artwork, ribbon imagery, screenshot/video material, and bundled fonts are not granted a separate reuse license merely by the software's MIT license.** Their use or redistribution depends on ownership and the terms of their respective rights holders. Third-party libraries retain their own licenses. If you fork the code, use your own branding unless you have permission to use these assets.

<div align="center">

---

**Anghkooey** · Remember the preference. Preserve the reason.  
Built by [Devendurance](https://github.com/Devendurance) · © 2026

[Back to top](#)

</div>
