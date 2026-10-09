# Photon worker deployment (Slice 3)

Worker: `workers/photon-worker.ts` — separate Node.js process, never inside Next.js routes.
Start: `npm run worker:start`. Readiness: `npm run photon:readiness`. Evidence: `npm run channel:evidence`.

## Ubuntu VPS

```bash
# 1. Clone + install (Node 20+)
git clone <repo> anghkooey && cd anghkooey
npm ci --legacy-peer-deps   # spectrum-ts pinned at 12.10.1
cp .env.example .env        # fill all 9 keys, never commit

# 2. Verify before supervising
npm run migrate
npm run photon:readiness   # env present, spectrum 12.10.1 loads, db ok

# 3. Supervise with systemd (restart always)
/etc/systemd/system/anghkooey-photon.service:
[Unit]
Description=Anghkooey Photon worker
After=network.target
[Service]
WorkingDirectory=/opt/anghkooey
EnvironmentFile=/opt/anghkooey/.env
ExecStart=/usr/bin/npm run worker:start
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target

sudo systemctl enable --now anghkooey-photon
journalctl -u anghkooey-photon -f  # structured JSON logs, content redacted
```

Health: worker logs `{"worker":"photon","ready":true}` on boot; per-message logs carry platform, sender_hash, recall_count, saves, latency. No message text, phone numbers, codes or keys. Graceful shutdown on SIGINT/SIGTERM via `app.stop()`. Fatal loop errors exit non-zero so systemd restarts.

## Web API (separately)

Deploy Next.js as usual (`npm run build && npm start`, or Vercel) with the same `DATABASE_URL`, DeepSeek and Walrus keys. The web app never holds Photon provider secrets in the browser.

## Linking (secure)

1. Web user creates a code at `POST /api/link/start`.
2. User sends the code as a single Telegram/iMessage message.
3. Worker takes the sender id from the verified Photon event only and calls `confirmLink`.
4. `POST /api/link/confirm` accepts provider=web only; telegram/imessage claims over HTTP get 403 `link_via_channel`.
