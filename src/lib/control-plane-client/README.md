# Control-plane client (browser)

The **only** place browser code may make network requests (enforced by ESLint).
Every function here must:

1. be listed in the README "Outbound calls registry",
2. send nothing derived from customer files (no content, column names, file names, sizes, counts, hashes…),
3. be exercised by `tests/e2e/privacy.spec.ts`.
