# Anghkooey

Anghkooey means "remember". It's a personal AI concierge for hotels, travel and dining that remembers the preferences and experiences that shape your choices, then brings the relevant context back when you need help again.

Stack: Next.js 16 (App Router) + React 19, DeepSeek for chat, Walrus Memory Mainnet (`@mysten-incubation/memwal`) for durable memories, Neon PostgreSQL for app state, and a Photon Spectrum worker for Telegram and iMessage. The landing page uses GSAP + ScrollTrigger.

## Quick start

Requires Node.js 20+.

```bash
npm ci
cp .env.example .env   # fill real values, never commit .env
npm run migrate        # applies db/migrations 001, 002, 003
npm run dev            # http://localhost:3000
```

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Some tests talk to the Neon database in `DATABASE_URL`.

## Frontend (Stage 4A)

- `/` landing: folded-A intro, cinematic orb hero, scroll-driven wordmark dock, hero copy and a Start Talking CTA.
- Start Talking opens the live Telegram bot (`src/lib/site.ts`) until the web `/chat` route ships.
- Design system: `DESIGN.md`. Brand copy: `docs/anghkooey brand messaging.md`. Official brand assets: `public/brand/anghkooey/`.
- Reduced-motion and no-JS visitors get a static hero.

## Backend API (Slice 2)

Real-service backend: DeepSeek Flash + Walrus Mainnet (`@mysten-incubation/memwal`) + Neon PostgreSQL, exposed through a secure HTTP API. No mocks.

Setup:

```bash
npm ci
cp .env.example .env   # fill real values, never commit
npm run migrate                  # applies 001, 002, 003
npm run check:integrations
npm run smoke:memory -- --fact "I prefer quiet rooms..." --query "Which hotel style fits me?"
WEB_BASE_URL=http://localhost:3000 npm run dev  # then in another shell:
WEB_BASE_URL=http://localhost:3000 npx tsx scripts/smoke-api.ts
npm test
npm run typecheck
```

API (all JSON, cookie `anghkooey_sid` HttpOnly + SameSite=Lax, Secure in production):

- `POST /api/session` create (201) or reuse session; `GET /api/session` inspect; `DELETE /api/session` revoke.
- `POST /api/chat` `{ message, conversationId?, idempotencyKey? }` real orchestrator, returns answer + receipts + confirmed/failed saves.
- `GET /api/memories?state=all|active|superseded` own metadata only.
- `PATCH /api/memories/:id` `{ text, memoryKey?, category? }` append-only correction, old blob superseded after new Walrus write confirms.
- `GET /api/settings` / `PATCH /api/settings { consent }` consent gates all Walrus writes. Disabling stops future writes; session deletion never deletes Walrus blobs.
- `POST /api/link/start` / `POST /api/link/confirm { code, provider, providerSenderId }` single-use 10-min hashed codes for Slice 3 channels.
- `GET /api/health` presence-only service status.

Env: `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL=deepseek-flash`, `DATABASE_URL`, `MEMWAL_PRIVATE_KEY`, `MEMWAL_ACCOUNT_ID`, optional `APP_SESSION_SECRET` (session-hash pepper), `WEB_BASE_URL`, `MEMWAL_SERVER_URL`.

## Photon channels: Telegram + iMessage (Slice 3)

Worker `workers/photon-worker.ts` (spectrum-ts 12.10.1, providers `telegram` + `imessage`) shares the Slice 1 orchestrator, Neon users and Walrus memories. No mocks.

```bash
npm run photon:readiness    # 9 env keys presence-only, SDK load, DB ping
npm run worker:start        # connect to Photon Cloud, stream app.messages
npm run channel:evidence   # read-only counts + blob ids, no content
npx tsx scripts/test-channel-flow.ts  # real-services channel path, 1 Mainnet write
```

Linking: web code from `POST /api/link/start`, send it as one in-channel message. The worker confirms with the sender id from the verified Photon event. `POST /api/link/confirm` accepts provider=web only (telegram/imessage over HTTP get 403). Details: `docs/DEPLOY-PHOTON.md`.

Docs: `docs/PRD.md`, `docs/TRD.md`, `docs/architecture.md`, `docs/project plan.md`. Status: `BACKEND-STATUS.md`. Blockers: `BACKEND-BLOCKERS.md`.
