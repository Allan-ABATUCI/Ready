# Debugging

Diagnostics never contain file data: no cell values, column names, file names, row counts or error messages, only fixed codes and timings.

## Browser

`src/lib/diagnostics.ts` writes stage timings, error codes and rule-pack results to `console.debug` as `[ready] {...}` lines.

- On in development.
- In production, run `localStorage.setItem("ready:debug", "1")` in the browser console and reload.
- Nothing is sent over the network; `tests/e2e/privacy.spec.ts` turns this log on and checks its output too.

## Server

`src/lib/control-plane/log.ts` writes one JSON line per API request (`route`, `status`, `code`, `ms`) to stdout. Vercel captures it in its logs; with Docker, use `docker compose logs`. License keys, bodies, headers and Stripe payloads are never logged.

## Dev server shows "Loading…" forever

Open it at `http://localhost:3000` or `http://127.0.0.1:3000`. Through a LAN IP, Next.js blocks its dev scripts, so the page renders but never becomes interactive.
