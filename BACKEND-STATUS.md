# BACKEND-STATUS.md — Slice 3 complete (2026-10-09)

## Implemented
- Photon worker (`workers/photon-worker.ts`): spectrum-ts 12.10.1 with `telegram.config({botToken})` + `imessage.config()`, `app.messages` loop, graceful SIGINT/SIGTERM shutdown, per-message isolation (try/catch, never crashes the stream).
- Identity: sender id taken only from the verified Photon event (`message.sender.id`); `resolveChannelUser` maps/provisions the canonical user (`src/server/channel-identity.ts`). Group chats get an honest out-of-scope reply, no memory access.
- Commands: /start (onboarding + consent state), /help, /memory (confirmed count), /connect (linking instructions). Non-text gets an honest text-only reply.
- Consent: new channel users start OFF; YES enables (`setConsent`). Chat always answers; saves gated via `allowMemorySave`. Same orchestrator, Walrus writes, recall, supersession and extraction policy as web.
- Secure linking: in-channel 32-char codes confirmed with the event-derived sender (`confirmLink` directly). `POST /api/link/confirm` hardened to provider=web only; telegram/imessage over HTTP now get 403 `link_via_channel`.
- Idempotency: `deliveryId` = `{platform}:{message.id}` reuses orchestrator dedupe. Rate limit 20/min per sender hash. Logs carry hashes/counts/blob ids only.
- Tooling: `scripts/photon-readiness.ts` (9 env keys presence-only, SDK load, DB ping), `scripts/channel-evidence.ts` (read-only counts + blob ids), `scripts/test-channel-flow.ts` (real-services channel path), `scripts/identity-diagnose.ts` (`npm run identity:diagnose`: per-user channels, memory counts, merge state, fully redacted). `docs/DEPLOY-PHOTON.md` (systemd, web split, log policy).
- Existing-account consolidation (`db/migrations/003_merge.sql`, `src/server/linking.ts` requestMerge/confirmMerge/cancelMerge, union recall in orchestrator, union listing in `GET /api/memories`): two-step in-channel claim (web code, then MERGE YES from the same verified sender), atomic alias row in `user_merges`, identity/conversations/consent re-homed, memory rows untouched, zero Walrus writes, no orphaned namespaces. Worker conflict reply now guides through the flow; /connect explains it.

## Live verification (2026-10-09, redacted)
- Env: all 9 keys present. `photon:readiness`: spectrum 12.10.1 loads, telegram+imessage providers true, db ok.
- Worker boot: `Spectrum started {provider_count:2}`, `ready:true`, `fusor ws stream ready` for project `7e7d98…` (Photon Cloud connected).
- Telegram: bot @useanghkooey_bot (id 8262988649) live; webhook `https://anghkooey.spctrm.dev/telegram`, pending 0. Inbound path to the worker is wired.
- iMessage: project `anghkooey` running, free plan, 1 registered user (shared line assigned). Inbound/outbound permitted for that user.
- Channel flow (real Neon + DeepSeek Flash + Walrus Mainnet, 1 write): telegram save confirmed 1 blob `aqYJHjfwUs4mFzl-tRMQSVT9UyCT60WMiMcbV1adc7I`; later-conversation recall same blob, mentions quiet; imessage linked to same canonical user; cross-channel recall same blob; stranger 0 memories, no leak.
- End-to-end human-sent Telegram/iMessage messages: PENDING owner action (exact steps in BACKEND-BLOCKERS.md). Nothing fabricated.
- Merge state machine: PASS against real Neon with throwaway users (approval counts, replay-dead code, canonical resolve, union listing, stranger-hijack refused, cancel path), all cleaned up. Live owner consolidation (Telegram 2 blobs + iMessage + web into one canonical user): PENDING owner in-channel MERGE YES.

## Tests/typecheck/build
- `npm test`: 13 passed (5 memory-policy + 4 slice2-api + 3 slice3-linking + 1 merge-consolidation).
- `npm run typecheck`: pass. `npm run lint`: pass. `npm run build`: pass. `git diff --check`: clean.

## Remaining
- Owner-sent live message tests on both channels, then frontend + hackathon submission (3x10 evidence with real testers).
