# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

## Project: Ready

Ready is a browser-based web app that lets non-technical business users prepare a CSV export for import into a CRM (HubSpot, Salesforce, Pipedrive). The user drops in a file; the app:

1. **Profiles** the file (columns, fill rates, value patterns).
2. **Flags issues:**
   - duplicates via fuzzy matching on name, email, phone, and company
   - malformed emails, phone numbers, and dates
   - missing required fields (per destination CRM)
   - inconsistent capitalization
3. **Lets the user review** merge decisions side by side.
4. **Exports** a clean, deduplicated CSV ready for the chosen CRM.

No upload, no account, no SQL or code for the user. **The data never leaves the browser.**

Status: scaffolded. Stack: Next.js (App Router) + TypeScript, React, Tailwind CSS v4, Zustand, PapaParse, Fuzzball, TanStack Table v9 (`useTable` API, not v8's `useReactTable`), Vercel Edge Config, Stripe (webhook only), Vitest + React Testing Library, Playwright, ESLint 9 + Prettier. Package manager: npm.

Where code goes:

- `src/lib/data-plane/`: everything that touches file data. Browser only (`import "client-only"`); heavy work runs in the Web Worker.
- `src/lib/control-plane-client/`: the **only** browser code allowed to make network requests (ESLint-enforced).
- `src/app/api/**` + `src/lib/control-plane/`: server only (`import "server-only"`); ESLint forbids importing `src/lib/data-plane/`, `papaparse` or `fuzzball`.
- `tests/e2e/privacy.spec.ts`: must stay green; extend it for every new outbound call.
- Unit tests sit next to the code they test (`*.test.ts[x]`); E2E specs, fixtures and shared test helpers live in `tests/`. Imports use `@/` for `src/`, `@tests/` and `@rule-packs/`.
- Fuzzball: always pass `force_ascii: false` (otherwise non-ASCII is stripped) and never `useCollator` (locale-dependent, so not deterministic).

## Architecture

Two planes with a hard boundary.

### Data plane — browser only

- CSV parsing, profiling, validation, fuzzy matching, merge review UI, and export.
- All customer data lives here and only here.
- **Deterministic:** same input + same rule pack ⇒ same output. No randomness, no time-dependent behavior in matching/validation results, no reliance on unordered iteration that could change results.
- **No external AI or API calls.** Matching and validation are implemented locally in code. Do not add LLM calls, third-party enrichment/validation APIs (e.g. email or phone verification services), or remote lookups.
- Prefer processing that runs off the main thread (e.g. Web Workers) for large files, but that is an implementation detail; the local-only rule is not.

### Control plane — cloud

Only these responsibilities:

| Service                                                             | Receives                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| License-key validation                                              | license key                                            |
| Signed destination rule packs (required fields and formats per CRM) | identifier of the requested pack                       |
| Billing                                                             | billing details the customer enters                    |
| Opt-in anonymized telemetry (e.g. "file processed" count)           | event name / count only, and only if the user opted in |

- Rule packs are **signed**; the data plane must verify the signature before applying a pack and must reject unsigned or invalid packs.
- Telemetry is **off by default** and must not include anything derived from file content.
- The control plane **never receives customer data**. This is the core product guarantee.

## Privacy invariant (non-negotiable)

**No feature may introduce a network call that carries customer file content, column names, or derived values.**

"Derived values" includes, non-exhaustively: hashes of values, per-file row/column counts, samples, value distributions, match/duplicate results, validation error messages that quote or describe data, file names, and file sizes. When in doubt, treat it as derived and don't send it.

Rules for any change touching the network:

1. Any **new outbound call** must be explicitly documented in the "Outbound calls registry" in `README.md` (destination, payload shape, purpose).
2. It must be covered by a **test that asserts no file data is sent** (e.g. intercept requests while processing a fixture file containing distinctive sentinel values, and assert none of those values, column names, or the file name appear in any request URL, header, or body).
3. Third-party scripts, SDKs, analytics, error reporters, fonts/CDNs, etc. count as outbound calls. Error reporting must not capture file data in messages, breadcrumbs, or stack context.
4. Do not persist customer data anywhere that syncs off-device. Browser-local storage of file data should be avoided unless explicitly designed and reviewed.

If a requested feature would violate the invariant, stop and flag it to the user instead of implementing it.

## Working rules

### Branching

- `main` = production. `develop` = integration.
- Every feature goes on `feature/<name>`, branched from `develop`.
- Merge into `develop` only after review. Never commit directly to `main` or `develop`.
- Before starting work, check the current branch; if on `main` or `develop`, create a `feature/<name>` branch from `develop` first.

### Commits

Conventional Commits with these types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.

```
<type>(<optional scope>): <imperative summary>
```

Examples: `feat(matching): fuzzy match on company name`, `test(privacy): assert telemetry payload has no file data`.

Only commit or push when the user asks.

### Continuous testing

- Every change comes with its tests — no feature or fix without corresponding test coverage.
- Before a merge, the **full test suite, lint, and build must all pass**. Run them and report results honestly; if something fails, say so with the output.
- Matching and validation logic must have deterministic unit tests with fixture data (including edge cases: unicode names, international phone formats, empty cells, quoted/multiline CSV fields, BOMs, different delimiters).
- Test fixtures must use synthetic data only — never real customer data.

## Commands

- Install: `npm install` (plus `npx playwright install chromium` once for E2E)
- Dev server: `npm run dev`
- Test: `npm test` (unit/component, Vitest) and `npm run test:e2e` (Playwright, against the production build)
- Lint: `npm run lint` (ESLint + Prettier check), `npm run typecheck`
- Build: `npm run build`
