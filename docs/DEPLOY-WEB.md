# Web deployment (Vercel)

The Next.js site is configured for Vercel with zero dashboard code changes:
`vercel.json` sets the framework plus baseline security headers. No secrets
live in the repo or the client bundle (verified: no `NEXT_PUBLIC_` keys,
no server env imported by components).

## Deploy

1. Import `https://github.com/Devendurance/anghkooey` in Vercel (branch `main`).
2. Set these server-only environment variables in the Vercel dashboard
   (names only, values stay in the dashboard, never in git):
   `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`,
   `DATABASE_URL`, `MEMWAL_PRIVATE_KEY`, `MEMWAL_ACCOUNT_ID`,
   `MEMWAL_SERVER_URL`, `APP_SESSION_SECRET`, `WEB_BASE_URL`.
   Photon keys (`PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`,
   `TELEGRAM_BOT_TOKEN`) are only needed on the web host if link-confirm
   routes run there; the worker host always needs all keys in
   `docs/DEPLOY-PHOTON.md`.
3. `WEB_BASE_URL` must be the public `https://` URL (no localhost).
   `APP_SESSION_SECRET` must be 32+ random chars.
4. Deploy. Then verify:
   - `GET https://<app>/api/health` returns `ok:true` with all services
     `configured`.
   - Landing loads over HTTPS, fonts and `/brand` assets render, mobile
     layout holds, and Start Talking opens `https://t.me/useanghkooey_bot`.

## Worker split

Vercel serverless functions cannot host the persistent Photon worker.
Run exactly one worker instance on a persistent host per
`docs/DEPLOY-PHOTON.md` (systemd unit: `workers/photon.service`,
container: `Dockerfile.worker`). Two workers double-reply on Telegram,
so never run the VPS/container worker and a local `npm run worker:start`
at the same time.
