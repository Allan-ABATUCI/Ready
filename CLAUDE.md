# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository. When this file conflicts with any other note or plan (e.g. `docs/`), this file wins.

## Project: Ready

Ready is a browser-based web app that lets non-technical business users prepare a CSV export for import into a CRM (HubSpot, Salesforce, Pipedrive). The user drops in a file; the app:

1. **Profiles** the file (columns, fill rates, value patterns, column roles, date order).
2. **Flags issues:**
   - duplicates via fuzzy matching on name, email, phone, and company
   - malformed emails (with typo suggestions), phone numbers, and dates
   - missing required fields (per destination CRM)
   - inconsistent capitalization
3. **Lets the user review** merge decisions side by side, fix flagged cells in place, and bulk-decide with undo.
4. **Exports** a clean, deduplicated CSV ready for the chosen CRM, plus an optional local change report.

No upload, no account, no SQL or code for the user. **The data never leaves the browser.**

**Stack:** Next.js (App Router) + TypeScript, React, Tailwind CSS v4, Zustand, PapaParse, Fuzzball, libphonenumber-js (`/min`), TanStack Table **v9** (`useTable` / `tableFeatures` / `createColumnHelper<typeof features, Row>()`, not v8's `useReactTable`; see `components/MergePreview.tsx`), Vercel Edge Config, Stripe (webhook only), Vitest + React Testing Library, Playwright, ESLint 9 + Prettier. Package manager: npm. Node version: `.nvmrc`.

## Privacy invariant (non-negotiable)

**No feature may introduce a network call that carries customer file content, column names, or derived values.**

"Derived values" includes, non-exhaustively: hashes of values, per-file row/column counts, samples, value distributions, match/duplicate results, validation error messages that quote or describe data, file names, and file sizes. When in doubt, treat it as derived and don't send it.

Rules for any change touching the network:

1. Any **new outbound call** must be documented in the "Outbound calls registry" in `README.md` (destination, payload shape, purpose).
2. It must be covered by a **test that asserts no file data is sent**: extend `e2e/privacy.spec.ts`, which processes a fixture with distinctive sentinel values and asserts none of them, the column names, or the file name appear in any request URL, header, or body.
3. Third-party scripts, SDKs, analytics, error reporters, fonts/CDNs, etc. count as outbound calls. Error reporting must not capture file data in messages, breadcrumbs, or stack context.
4. Do not persist customer data anywhere that syncs off-device. Nothing derived from the file goes into `localStorage`, `sessionStorage` or IndexedDB; app state is in memory only.
5. Downloads (cleaned CSV, change report) are local blobs (see `downloadCsv` in `lib/data-plane/export.ts`), never sent anywhere.

If a requested feature would violate the invariant, **stop and flag it to the user** instead of implementing it.

## Architecture

Two planes with a hard boundary, enforced by ESLint (`eslint.config.mjs`) and the production CSP (`connect-src 'self'` in `next.config.ts`).

### Data plane: browser only

- CSV parsing, profiling, validation, fuzzy matching, merge review UI, and export. All customer data lives here and only here.
- **No external AI or API calls.** Matching and validation are implemented locally. No LLM calls, no third-party enrichment/verification APIs (email, phone, domain), no remote lookups.
- **Deterministic:** same input + same rule pack + same user choices ⇒ same output. Concretely:
  - no `Math.random` (seeded generators only in tests), no `Date.now()` / current date in results;
  - no `localeCompare`, `toLocale*Case`, `Intl.Collator` or `Intl.DateTimeFormat` in results; use plain string comparison;
  - no reliance on unordered iteration; sort explicitly;
  - anything that changes results comes from the file or from an explicit user choice, never from the browser locale (e.g. default phone country is never inferred).
- Fuzzball: always pass `force_ascii: false` (otherwise non-ASCII is stripped) and never `useCollator`.

### Control plane: cloud

Only these responsibilities:

| Service                                                             | Receives                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| License-key validation                                              | license key                                            |
| Signed destination rule packs (required fields and formats per CRM) | identifier of the requested pack                       |
| Billing                                                             | billing details the customer enters                    |
| Opt-in anonymized telemetry (e.g. "file processed" count)           | event name / count only, and only if the user opted in |

- Rule packs are **signed**; the data plane verifies the signature before applying a pack and rejects unsigned or invalid packs.
- Telemetry is **off by default** and must not include anything derived from file content.
- The control plane **never receives customer data**. This is the core product guarantee.
- Licensing, billing and telemetry are **on hold** by the user's decision: don't build on them unless asked.

## Where code goes

| Path                                             | What                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/data-plane/`                                | Everything that touches file data. Browser only (`import "client-only"`). Pure functions, each with a colocated `*.test.ts`.         |
| `lib/data-plane/worker/`                         | Web Worker entry and request protocol; heavy work (`processCsv`, `analyze`) runs here, off the main thread.                          |
| `lib/state/store.ts`                             | Zustand store: results, roles, decisions, overrides, undo history. In memory only.                                                   |
| `components/`                                    | React UI; `ReadyApp.tsx` wires the pipeline together.                                                                                |
| `lib/rule-packs/`                                | Rule-pack types, signature verification, loading.                                                                                    |
| `lib/control-plane-client/`                      | The **only** browser code allowed to make network requests (ESLint blocks `fetch`/XHR/WebSocket/EventSource/`sendBeacon` elsewhere). |
| `app/api/**`, `lib/control-plane/`               | Server only (`import "server-only"`). ESLint forbids importing `lib/data-plane/`, `papaparse`, `fuzzball` or `libphonenumber-js`.    |
| `lib/diagnostics.ts`, `lib/control-plane/log.ts` | Privacy-safe logging. Events are a closed union: add new kinds to the union, never log free text or file values.                     |
| `rule-packs/src/`, `rule-packs/signed/`          | Rule-pack sources and their signed output (see gotchas).                                                                             |
| `tests/fixtures/`, `tests/support/`              | Synthetic CSV fixtures; `synthetic.ts` generates seeded files.                                                                       |
| `e2e/`                                           | Playwright specs. `privacy.spec.ts` must stay green.                                                                                 |

Before writing a helper, check for an existing one: `groupBy` (`lib/group.ts`), `FORMAT_VALIDATORS` (`validate.ts`), `splitName`/`joinName` (`names.ts`), `assignRole` (`columns.ts`), `analyze` (`process.ts`), `toE164` (`phone.ts`), `parseDate` (`dates.ts`), `logEvent` (`lib/diagnostics.ts`).

## Working rules

### Branching: Gitflow

| Branch            | From      | Merges into                   | Purpose                                      |
| ----------------- | --------- | ----------------------------- | -------------------------------------------- |
| `main`            | n/a       | n/a                           | Production. Every merge is tagged `vX.Y.Z`.  |
| `develop`         | `main`    | n/a                           | Integration.                                 |
| `feature/<name>`  | `develop` | `develop`                     | New work, fixes found during development.    |
| `release/<x.y.z>` | `develop` | `main` (tagged) and `develop` | Stabilize a release: fixes and version only. |
| `hotfix/<name>`   | `main`    | `main` (tagged) and `develop` | Urgent fix to production.                    |

- **Never commit directly to `main` or `develop`.** Merges use `--no-ff` and happen only after review.
- Before starting work, run `git branch --show-current`. If on `main` or `develop`, create the right branch first (`feature/<name>` from `develop` by default).
- One concern per branch. Don't mix an unrelated fix into a feature branch; give it its own branch.
- **Stacked features:** if new work depends on a feature branch not yet merged into `develop`, branch from that feature branch, say so to the user, and merge the stack into `develop` in order.
- Agents do **not** push, merge, tag, or delete branches unless the user asks.

### Commits

Conventional Commits with these types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.

```
<type>(<optional scope>): <imperative summary>
```

Examples: `feat(matching): fuzzy match on company name`, `test(privacy): assert telemetry payload has no file data`.

Only commit when the user asks (asking to "use Gitflow" for a task counts as asking to commit on its branch). `docs/` is local, untracked working notes: don't commit it unless asked.

### Testing

- Every change comes with its tests: no feature or fix without corresponding test coverage.
- Matching and validation logic must have deterministic unit tests with fixture data, including edge cases: unicode names, international phone formats, empty cells, quoted/multiline CSV fields, BOMs, `;` and tab delimiters, Windows-1252 input.
- Test fixtures use **synthetic data only**, never real customer data: `example.test` emails, `555-01xx` / `+44 20 7946 0xxx` style numbers.
- Before each commit, and always before a merge, run **`npm test && npm run lint && npm run typecheck && npm run test:e2e`** (`test:e2e` includes the build). Report results honestly; if something fails, say so with the output.

### Code quality

- Reuse existing helpers (see above) and remove dead code.
- Every non-obvious decision gets a short _why_ comment.

## Commands

| Task               | Command                                                            |
| ------------------ | ------------------------------------------------------------------ |
| Install            | `npm install`, plus `npx playwright install chromium` once for E2E |
| Dev server         | `npm run dev`, then open `http://localhost:3000`                   |
| Unit / component   | `npm test` (`npm run test:watch` while working)                    |
| E2E                | `npm run test:e2e` (builds, serves on port 3100 via `E2E_PORT`)    |
| Lint               | `npm run lint` (ESLint + Prettier check), `npm run lint:fix`       |
| Types              | `npm run typecheck`                                                |
| Build              | `npm run build`                                                    |
| Re-sign rule packs | `node scripts/rule-packs.mjs sign`                                 |

A DevContainer (`.devcontainer/devcontainer.json`) provides Node, Playwright Chromium and the editor extensions. CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit and E2E tests on PRs and pushes to `develop` and `main`.

## Gotchas

- **Dev server host:** use `localhost:3000` or `127.0.0.1:3000`. On a LAN IP, Next blocks dev scripts and the file drop stays on "Loading…".
- **Rule packs:** after editing `rule-packs/src/*.json`, run `node scripts/rule-packs.mjs sign` (uses the gitignored dev key in `.keys/`). `lib/rule-packs/bundled.test.ts` fails on stale signatures.
- **Dedupe blocking:** the test "blocking is equivalent to the pairwise scan" (`dedupe.test.ts`) runs on every CSV in `tests/fixtures/`. Any change to matching keys must keep it green, or update `naiveCandidates` with the same rule.
- **Analysis inputs** (column roles, date order, default phone country, cell overrides) re-run analysis. Changes that alter duplicate pairs clear merge decisions after confirming with the user; changes that don't must keep them.
- **Lint `react-hooks/set-state-in-effect`:** setting state directly in a `useEffect` fails lint (see `FileDrop`'s `useSyncExternalStore` for an alternative).
- **Vitest swallows `console.*`** in passing tests; for ad-hoc measurements, write to a file instead.
