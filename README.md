# Ready

**Get your contact list ready for your CRM — without uploading it anywhere.**

Ready is a web app for non-technical business users who need to clean up a CSV export before importing it into **HubSpot**, **Salesforce**, or **Pipedrive**. Drop in a file, review what Ready finds, approve merges, and download a clean, deduplicated CSV that matches your CRM's import requirements.

No upload. No account. No SQL or code. **Your data never leaves your browser.**

---

## What it does

Ready walks the user through four steps (**Upload → Fix → Review → Export**), with a built-in synthetic sample file for a first try.

1. **Profile** — Drop in a CSV, TSV or Excel file (`.xlsx`, first sheet), or paste rows copied from a spreadsheet. Ready reads it in the browser and summarizes columns, fill rates, and value patterns.
   - **Several files** (e.g. a trade-show list, a webinar export and a spreadsheet) are combined into one list. Ready proposes how their columns line up, matching the same or similar names (`E-mail` with `Email`, `Mobile` with `Phone`), and the user confirms or changes it before combining. Duplicates are then found across files, review shows which file each contact came from, and the export can add a "Source file" column.
2. **Flag issues**
   - **Duplicates** — fuzzy matching on name, email, phone (national and international formats), and company
   - **Malformed values** — invalid emails, phone numbers, and dates (day-first, month-first or ISO); ambiguous dates
   - **Likely email typos** — e.g. `gmial.com` → `gmail.com`, from a bundled list of common domains (never looked up online)
   - **Missing required fields** — based on the target CRM's import rules
   - **Inconsistent capitalization** — e.g. `ACME corp` vs. `Acme Corp`
3. **Review** — Filter the list of suspected duplicates, compare them side by side and decide what to merge or keep (one by one, in bulk, or with keyboard shortcuts; with undo). Fix flagged cells in place. Optionally add an export of your CRM to find contacts you already have, and leave them out of the export.
4. **Export** — Preview and download a clean, deduplicated CSV formatted for your chosen CRM, plus a local report of every change clean-up made.

**Save progress** downloads a session file (`<name>.ready.json`) with the data, fixes, merge decisions and settings; drop it back in later to carry on. It is an ordinary file the user keeps: the app stores nothing in the browser.

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

More detail, including how the boundary is enforced: [docs/architecture.md](docs/architecture.md).

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

### Project conventions

| Convention                                                                                  | Status      | Where                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git workflow: `main` = production, `develop` = integration, `feature/<name>` from `develop` | ✅ Followed | [Branches](#branches)                                                                                                                                                                                             |
| Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`)                   | ✅ Followed | [Commits](#commits)                                                                                                                                                                                               |
| Project structure: `src/`, `tests/`, `docs/`                                                | ✅ In place | See [Layout](#layout)                                                                                                                                                                                             |
| Development environment is a DevContainer                                                   | ✅ In place | `.devcontainer/devcontainer.json` (Node 24, installs dependencies and Playwright Chromium, editor extensions)                                                                                                     |
| Application deployed with Docker                                                            | ✅ In place | `Dockerfile` + `docker-compose.yml`, smoke-tested in CI (`npm run test:docker`). Production hosting is Vercel; see [docs/deployment.md](docs/deployment.md)                                                       |
| No secrets in code: environment variables, `.env` gitignored, versioned `.env.example`      | ✅ In place | Secrets are read from `process.env`; `.env` and `.env*.local` are gitignored and kept out of the Docker image; `.env.example` is committed. See [environment variables](docs/deployment.md#environment-variables) |

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
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests and E2E (which includes the build and the privacy test) on every pull request and push to `develop` and `main`, and a second job builds and smoke-tests the Docker image. The Playwright report is uploaded as an artifact when it fails.
- Any change that adds or modifies an outbound network call must also:
  - document the call in the [outbound calls registry](#outbound-calls-registry)
  - include a test asserting that no file data is sent

### Outbound calls registry

Every network call the app makes must be listed here.

**Browser → network** (all browser calls live in `src/lib/control-plane-client/`; ESLint blocks `fetch`/XHR/WebSocket/beacons elsewhere, and the production CSP sets `connect-src 'self'`):

| Call                                                         | Destination                                                               | Payload                                                                                                                                                                                                                   | Test                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Rule-pack manifest                                           | `GET /api/rule-packs/manifest` (same origin)                              | None: no query string, no body, `credentials: "omit"`. Response: `{ packs: [{ crm, version }] }`                                                                                                                          | `tests/e2e/privacy.spec.ts`                                                                                                  |
| Signed rule pack                                             | `GET /api/rule-packs/<crm>` (same origin), sent when the user picks a CRM | Only the CRM identifier in the path (`hubspot`, `salesforce` or `pipedrive`), chosen by the user. No query string, no body, `credentials: "omit"`. Response: `{ payload, signature }`, verified in the browser before use | `tests/e2e/privacy.spec.ts`, `src/lib/control-plane-client/rule-packs.test.ts`, `src/app/api/rule-packs/[crm]/route.test.ts` |
| License verify _(endpoint exists, not yet called by the UI)_ | `POST /api/license/verify` (same origin)                                  | `{ "licenseKey": string }`, exactly one field, ≤ 256 bytes. Anything else gets a 400 or 413                                                                                                                               | `src/app/api/license/verify/route.test.ts`; add the call to `tests/e2e/privacy.spec.ts` when the UI wires it up              |

**Server → network** (Next.js API routes on Vercel or in the Docker image; never handle file data, and ESLint blocks them from importing `src/lib/data-plane/`):

| Call             | Destination                        | Payload                                      | Test                                            |
| ---------------- | ---------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| Edge Config read | Vercel Edge Config (`EDGE_CONFIG`) | Reads the single item key `rulePackManifest` | `src/app/api/rule-packs/manifest/route.test.ts` |

**Inbound only** (not outbound, listed for completeness):

| Call           | Source                              | Payload                                                                                                 | Test                                       |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Stripe webhook | Stripe → `POST /api/stripe/webhook` | Stripe event, signature-verified with `STRIPE_WEBHOOK_SECRET`. No customer file data exists server-side | `src/app/api/stripe/webhook/route.test.ts` |

---

## Getting started

**Stack:** Next.js (App Router) + TypeScript, React, Tailwind CSS, Zustand, PapaParse, fflate (unzipping `.xlsx` locally), Fuzzball, TanStack Table, Vercel Edge Config, Stripe (webhook only), Vitest + React Testing Library, Playwright + axe-core, ESLint + Prettier.

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
| Docker image smoke test         | `npm run test:docker` (needs Docker)                        |

### Layout

```
src/app/          Next.js page; api/ holds the API routes (control plane)
src/components/   React client components
src/lib/          data-plane/ (browser only), control-plane/ (server only), control-plane-client/, rule-packs/, state/
tests/            e2e/ (Playwright, incl. privacy.spec.ts), fixtures/, support/; unit tests sit next to the code
rule-packs/       Rule-pack sources and signed copies
scripts/          Rule-pack signing, Docker smoke test
docs/             Architecture, rule packs, debugging, deployment
```

### Run with Docker

```bash
docker compose up --build         # production build at http://localhost:3000
```

Production is hosted on Vercel, which builds from source and doesn't use the Dockerfile. See [docs/deployment.md](docs/deployment.md).

### Documentation

- [Architecture](docs/architecture.md): the two planes, repository layout, how the privacy boundary is enforced
- [Rule packs](docs/rule-packs.md): editing, signing and key rotation
- [Debugging](docs/debugging.md): privacy-safe diagnostics in the browser and on the server
- [Deployment](docs/deployment.md): Vercel, Docker, environment variables

## License

TBD
