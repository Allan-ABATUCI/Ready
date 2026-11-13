# Ready

**Get your contact list ready for your CRM — without uploading it anywhere.**

Ready is a web app for non-technical business users who need to clean up a CSV export before importing it into **HubSpot**, **Salesforce**, or **Pipedrive**. Drop in a file, review what Ready finds, approve merges, and download a clean, deduplicated CSV that matches your CRM's import requirements.

No upload. No account. No SQL or code. **Your data never leaves your browser.**

---

## What it does

Ready walks the user through four steps (**Upload → Fix → Review → Export**), with a built-in synthetic sample file for a first try.

1. **Profile** — Drop in a CSV. Ready reads it in the browser and summarizes columns, fill rates, and value patterns.
2. **Flag issues**
   - **Duplicates** — fuzzy matching on name, email, phone (national and international formats), and company
   - **Malformed values** — invalid emails, phone numbers, and dates (day-first, month-first or ISO); ambiguous dates
   - **Likely email typos** — e.g. `gmial.com` → `gmail.com`, from a bundled list of common domains (never looked up online)
   - **Missing required fields** — based on the target CRM's import rules
   - **Inconsistent capitalization** — e.g. `ACME corp` vs. `Acme Corp`
3. **Review** — Filter the list of suspected duplicates, compare them side by side and decide what to merge or keep (one by one, in bulk, or with keyboard shortcuts; with undo). Fix flagged cells in place.
4. **Export** — Preview and download a clean, deduplicated CSV formatted for your chosen CRM, plus a local report of every change clean-up made.

All matching and validation is **deterministic** and runs **locally**. There are no AI services or external API calls involved in processing your data.

---

## Architecture

Ready is split into two planes with a hard boundary between them.

```
┌──────────────────────────── User's browser ────────────────────────────┐
│                                                                        │
│   DATA PLANE (local only)                                              │
│   CSV parsing · profiling · validation · fuzzy matching ·              │
│   merge review UI · CSV export                                         │
│                                                                        │
│   Customer data lives here and only here.                              │
│                                                                        │
└───────────────────────────────┬────────────────────────────────────────┘
                                │  Only: license key, rule-pack requests,
                                │  billing, opt-in anonymized counters
                                ▼
┌──────────────────────────── Cloud ─────────────────────────────────────┐
│   CONTROL PLANE                                                        │
│   License-key validation · signed CRM rule packs · billing ·           │
│   opt-in anonymized telemetry                                          │
│                                                                        │
│   Never receives customer data.                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Data plane (browser)

- Parses, profiles, validates, matches, and exports CSV files entirely client-side.
- Deterministic: the same input and the same rule pack always produce the same output.
- Makes **no** network calls with file contents, column names, or any value derived from the file.

### Control plane (cloud)

| Service            | Purpose                                                    | What it receives                        |
| ------------------ | ---------------------------------------------------------- | --------------------------------------- |
| License validation | Confirms the user's license key is valid                   | License key                             |
| Rule packs         | Serves **signed** per-CRM rules (required fields, formats) | Which CRM's pack is requested           |
| Billing            | Subscription and payment handling                          | Billing details entered by the customer |
| Telemetry (opt-in) | Anonymized usage counts, e.g. "file processed"             | Event name and count only               |

Rule packs are signed so the browser can verify they have not been tampered with before applying them.

---

## Privacy guarantee

> **The control plane never receives customer data.**

This is the core promise of the product. Concretely, no network request may carry:

- file contents (rows, cells, or any part of them)
- column names / headers
- derived values (hashes, counts per value, row counts tied to a file, samples, error messages quoting data, matching results, etc.)

Every outbound call is documented in this repository and covered by an automated test that asserts no file data is sent. A feature that would break this guarantee will not be merged.

---

## Development workflow

### Branches

| Branch           | Role                                           |
| ---------------- | ---------------------------------------------- |
| `main`           | Production                                     |
| `develop`        | Integration                                    |
| `feature/<name>` | One feature per branch, created from `develop` |

Feature branches are merged into `develop` only after review. `develop` is promoted to `main` for releases.

### Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

`feat`, `fix`, `docs`, `test`, `refactor`, `chore`

```
feat(matching): add phone-number normalization for fuzzy match
fix(export): preserve leading zeros in postal codes
```

### Testing and merge requirements

- Every change ships with its tests.
- Before merging, all of the following must pass:
  - the full test suite
  - lint
  - build
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests and E2E (which includes the build and the privacy test) on every pull request and push to `develop` and `main`. The Playwright report is uploaded as an artifact when it fails.
- Any change that adds or modifies an outbound network call must also:
  - document the call in the [outbound calls registry](#outbound-calls-registry)
  - include a test asserting that no file data is sent

### Outbound calls registry

Every network call the app makes must be listed here.

**Browser → network** (all browser calls live in `lib/control-plane-client/`; ESLint blocks `fetch`/XHR/WebSocket/beacons elsewhere, and the production CSP sets `connect-src 'self'`):

| Call                                                         | Destination                                                               | Payload                                                                                                                                                                                                                   | Test                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Rule-pack manifest                                           | `GET /api/rule-packs/manifest` (same origin)                              | None: no query string, no body, `credentials: "omit"`. Response: `{ packs: [{ crm, version }] }`                                                                                                                          | `e2e/privacy.spec.ts`                                                                                          |
| Signed rule pack                                             | `GET /api/rule-packs/<crm>` (same origin), sent when the user picks a CRM | Only the CRM identifier in the path (`hubspot`, `salesforce` or `pipedrive`), chosen by the user. No query string, no body, `credentials: "omit"`. Response: `{ payload, signature }`, verified in the browser before use | `e2e/privacy.spec.ts`, `lib/control-plane-client/rule-packs.test.ts`, `app/api/rule-packs/[crm]/route.test.ts` |
| License verify _(endpoint exists, not yet called by the UI)_ | `POST /api/license/verify` (same origin)                                  | `{ "licenseKey": string }`, exactly one field, ≤ 256 bytes. Anything else gets a 400 or 413                                                                                                                               | `app/api/license/verify/route.test.ts`; add the call to `e2e/privacy.spec.ts` when the UI wires it up          |

**Server → network** (Next.js API routes on Vercel; never handle file data, and ESLint blocks them from importing `lib/data-plane/`):

| Call             | Destination                        | Payload                                      | Test                                        |
| ---------------- | ---------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Edge Config read | Vercel Edge Config (`EDGE_CONFIG`) | Reads the single item key `rulePackManifest` | `app/api/rule-packs/manifest/route.test.ts` |

**Inbound only** (not outbound, listed for completeness):

| Call           | Source                              | Payload                                                                                                 | Test                                   |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Stripe webhook | Stripe → `POST /api/stripe/webhook` | Stripe event, signature-verified with `STRIPE_WEBHOOK_SECRET`. No customer file data exists server-side | `app/api/stripe/webhook/route.test.ts` |

---

## Getting started

**Stack:** Next.js (App Router) + TypeScript, React, Tailwind CSS, Zustand, PapaParse, Fuzzball, TanStack Table, Vercel Edge Config, Stripe (webhook only), Vitest + React Testing Library, Playwright, ESLint + Prettier.

Requires Node ≥ 20.9 (Node 24 recommended, see `.nvmrc`). You can also open the repo in the **DevContainer** (`.devcontainer/`), which installs dependencies and Playwright Chromium for you.

```bash
npm install
npx playwright install chromium   # once, for E2E
cp .env.example .env.local        # optional locally; see comments in the file
npm run dev                       # http://localhost:3000
```

Open the dev server at `http://localhost:3000` (or `127.0.0.1:3000`). Through a LAN IP, Next blocks its dev scripts, so the page shows "Loading…" and never becomes interactive.

| Task                            | Command                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| Unit and component tests        | `npm test` (`npm run test:watch` for watch mode)            |
| E2E, including the privacy test | `npm run test:e2e` (builds, then runs against `next start`) |
| Lint and format check           | `npm run lint` (`npm run lint:fix` to fix)                  |
| Type check                      | `npm run typecheck`                                         |
| Production build                | `npm run build` (output in `.next/`)                        |

### Layout

```
app/                     Next.js App Router. page.tsx renders the client app (prerendered static)
app/api/                 Control plane: license/verify, rule-packs/manifest, stripe/webhook
components/              Client components (FileDrop, ProfileSummary, DuplicateReview, MergePreview)
lib/data-plane/          Browser-only CSV parsing, profiling, validation, dedupe, export, Web Worker
lib/control-plane/       Server-only helpers for the API routes
lib/control-plane-client/ The only browser module allowed to make network requests
lib/rule-packs/          Rule-pack types, public key, signature verification (ECDSA P-256, fails closed)
rule-packs/              Rule-pack sources (src/) and signed output (signed/), see "Rule packs" below
scripts/rule-packs.mjs   Key generation and signing for rule packs
lib/state/               Zustand store (in-memory only, never persisted)
e2e/                     Playwright tests (privacy.spec.ts enforces the privacy invariant)
tests/fixtures/          Synthetic CSV fixtures
```

### Debugging

Diagnostics never contain file data: no cell values, column names, file names, row counts or error messages, only fixed codes and timings.

- **Browser** (`lib/diagnostics.ts`): stage timings, error codes and rule-pack results go to `console.debug` as `[ready] {...}` lines. They're on in development. In production, run `localStorage.setItem("ready:debug", "1")` in the console and reload. Nothing is sent over the network.
- **Server** (`lib/control-plane/log.ts`): each API request writes one JSON line (`route`, `status`, `code`, `ms`) to stdout, which Vercel captures. License keys, bodies, headers and Stripe payloads are never logged.

### Rule packs

Each CRM's required fields and formats live in `rule-packs/src/<crm>.json`. The API serves the signed copies in `rule-packs/signed/`, and the browser rejects any pack whose signature doesn't verify against `lib/rule-packs/public-key.ts`.

To change a pack, edit the source, bump its `version` (and the matching entry in `DEFAULT_MANIFEST`), then re-sign:

```bash
node scripts/rule-packs.mjs sign      # needs .keys/rule-pack.private.jwk or RULE_PACK_PRIVATE_KEY
```

`lib/rule-packs/bundled.test.ts` fails if a signed pack is stale or doesn't verify. The private key is never committed (`.keys/` is gitignored). To rotate the key, run `node scripts/rule-packs.mjs keygen`, paste the printed public JWK into `public-key.ts`, and re-sign.

## License

TBD
