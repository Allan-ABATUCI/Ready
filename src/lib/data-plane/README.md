# Data plane (browser only)

Everything in this folder handles customer file data and must only ever run in the browser.

- Every module imports `client-only`, so importing it from a React Server Component fails the build.
- ESLint forbids `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator.sendBeacon` here, and forbids
  `src/app/api/**` / `src/lib/control-plane/**` from importing this folder.
- Results must be deterministic: no `Math.random`, no `Date.now`, no locale-dependent comparison, stable ordering.
- Error/issue objects carry codes and row indexes only — never cell values.
