#!/usr/bin/env bash
# Builds the Docker image, starts it, and checks that the production server
# answers with the privacy headers and the signed rule packs.
# Usage: npm run test:docker   (needs Docker)
set -euo pipefail

IMAGE="${IMAGE:-ready:smoke}"
PORT="${PORT:-3200}"
NAME="ready-smoke-$$"

fail() { echo "FAIL: $*" >&2; docker logs "$NAME" >&2 || true; exit 1; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker build -t "$IMAGE" .
docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:3000" "$IMAGE" >/dev/null

BASE="http://127.0.0.1:${PORT}"
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "$BASE/" 2>/dev/null && break
  sleep 1
done

# Page is served, with the CSP that keeps the browser from calling third parties.
headers="$(curl -fsS -D - -o /dev/null "$BASE/")" || fail "GET / did not return 2xx"
grep -qi "^content-security-policy:.*connect-src 'self'" <<<"$headers" || fail "CSP with connect-src 'self' missing"
grep -qi "^referrer-policy: no-referrer" <<<"$headers" || fail "Referrer-Policy missing"
if grep -qi "^x-powered-by:" <<<"$headers"; then fail "X-Powered-By header should be off"; fi

# Rule-pack API works without any environment variables (bundled manifest and packs).
curl -fsS "$BASE/api/rule-packs/manifest" | grep -q '"packs"' || fail "manifest has no packs"
curl -fsS "$BASE/api/rule-packs/hubspot" | grep -q '"signature"' || fail "hubspot pack is not signed"
status="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/rule-packs/unknown")"
[ "$status" = "404" ] || fail "unknown CRM returned $status, expected 404"

# Runs as the unprivileged node user, and no secrets were copied into the image.
[ "$(docker exec "$NAME" id -u)" != "0" ] || fail "container runs as root"
if docker exec "$NAME" sh -c 'ls -a /app' | grep -qE '^(\.env|\.env\..*local|\.keys)$'; then
  fail "secrets found in image"
fi

echo "Docker smoke test passed."
