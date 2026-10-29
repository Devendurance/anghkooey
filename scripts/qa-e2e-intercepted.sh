#!/usr/bin/env bash
# DB-less intercepted Playwright suite (Slice 2 E2E readiness).
# - Builds without secrets and starts a local QA server on 127.0.0.1:3101.
# - Runs only intercepted tests (excludes the live-Qloo manual test).
# - Never touches prod DB, Walrus, Gmail, Photon, or live Qloo.
# - Screenshots/traces land in gitignored test-artifacts/.
# Usage from a clean checkout:
#   npm ci
#   npm run test:e2e:intercepted
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${QA_PORT:-3101}"
QA_BASE_URL="http://127.0.0.1:${PORT}"
export QA_BASE_URL
# Force DB-less + key-less: shell wins over .env (Next.js precedence).
export DATABASE_URL=""
export TEST_DATABASE_URL=""
export QLOO_API_KEY=""
export QLOO_BASE_URL=""
export WEB_BASE_URL="${QA_BASE_URL}"

echo "[qa-e2e] building without secrets (DB-less, no Qloo key)..."
(
  cd "$ROOT"
  DATABASE_URL="" TEST_DATABASE_URL="" QLOO_API_KEY="" QLOO_BASE_URL="" npm run build
)

if curl -sf "${QA_BASE_URL}/api/health" > /dev/null 2>&1; then
  echo "[qa-e2e] REFUSED: another service is already answering ${QA_BASE_URL}/api/health."
  echo "[qa-e2e] Stop it first, or set QA_PORT to a free port. Not running tests against an unknown server."
  exit 1
fi

echo "[qa-e2e] starting QA server on ${QA_BASE_URL}..."
cd "$ROOT"
DATABASE_URL="" TEST_DATABASE_URL="" QLOO_API_KEY="" QLOO_BASE_URL="" \
  WEB_BASE_URL="${QA_BASE_URL}" QA_BASE_URL="${QA_BASE_URL}" \
  npx next start -p "${PORT}" > test-artifacts/qa-server.log 2>&1 &
QA_PID=$!
echo "$QA_PID" > test-artifacts/qa-server.pid
cd - > /dev/null
cleanup() {
  if [ -f test-artifacts/qa-server.pid ]; then
    PID="$(cat test-artifacts/qa-server.pid)"
    kill "$PID" 2>/dev/null || true
    sleep 2
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null || true
    fi
    if command -v fuser > /dev/null 2>&1; then
      fuser -k "${PORT}/tcp" 2>/dev/null || true
    else
      pkill -f "next-server.*${PORT}" 2>/dev/null || true
      pkill -f "next start -p ${PORT}" 2>/dev/null || true
    fi
    rm -f test-artifacts/qa-server.pid
  fi
}
trap cleanup EXIT

echo "[qa-e2e] waiting for ${QA_BASE_URL}/api/health..."
for i in $(seq 1 60); do
  if curl -sf "${QA_BASE_URL}/api/health" > /dev/null 2>&1; then
    echo "[qa-e2e] server ready."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[qa-e2e] server did not start (see test-artifacts/qa-server.log)"
    exit 1
  fi
  sleep 1
done

echo "[qa-e2e] running intercepted suite (live manual test excluded)..."
(
  cd "$ROOT"
  QA_BASE_URL="${QA_BASE_URL}" DATABASE_URL="" TEST_DATABASE_URL="" \
    QLOO_API_KEY="" QLOO_BASE_URL="" \
    LD_LIBRARY_PATH="$HOME/.playwright-deps/libs/usr/lib/x86_64-linux-gnu" \
    npx playwright test --grep-invert "manual lookup confirms"
)
