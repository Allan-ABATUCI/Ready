# Architecture

Ready is split into a **data plane** that runs only in the user's browser and a small **control plane** in the cloud. Customer data stays in the data plane; the control plane never receives it. The product guarantee and its rules are in [`CLAUDE.md`](../CLAUDE.md#privacy-invariant-non-negotiable) and the [README](../README.md#privacy-guarantee).

## Repository layout

```
src/
  app/                       Next.js App Router. page.tsx renders the client app (prerendered static)
  app/api/                   Control plane routes: license/verify, rule-packs/[crm], rule-packs/manifest, stripe/webhook
  components/                Client components (ReadyApp, FileDrop, IssuesSummary, DuplicateReview, ExportPanel, ...)
  lib/data-plane/            Browser only: parsing (CSV, TSV, XLSX), profiling, validation, dedupe, merge, export, Web Worker
  lib/control-plane/         Server only: helpers for the API routes (license, rule packs, Stripe, logging)
  lib/control-plane-client/  The only browser code allowed to make network requests
  lib/rule-packs/            Rule-pack types, public key, signature verification (ECDSA P-256, fails closed)
  lib/state/                 Zustand store (in memory only, never persisted)
  lib/diagnostics.ts         Privacy-safe browser diagnostics (see debugging.md)
tests/
  e2e/                       Playwright specs; privacy.spec.ts enforces the privacy invariant
  fixtures/                  Synthetic CSV fixtures (never real customer data)
  support/                   Shared test helpers (synthetic contacts, XLSX builder, request-log capture)
  stubs/                     Module stubs for Vitest (e.g. server-only)
rule-packs/                  Rule-pack sources (src/) and signed output (signed/), see rule-packs.md
scripts/                     Rule-pack signing, Docker smoke test
docs/                        This documentation
```

Unit and component tests sit next to the code they test (`*.test.ts`, `*.test.tsx`). Imports use `@/` for `src/`, plus `@tests/` and `@rule-packs/` for those root folders.

## Data plane (browser)

- Parses, profiles, validates, matches and exports files entirely client side.
- Several files can be combined into one list (`src/lib/data-plane/combine.ts`): the worker reads each file, the user confirms a column mapping, and the rows are stacked in file order. Which file each row came from is kept beside the data (`ParsedCsv.sources`), never as a column, so it doesn't affect matching or validation; it is shown in review and can be added to the export. Heavy work runs in a Web Worker (`src/lib/data-plane/worker/`) so the page stays responsive on large files.
- **Deterministic:** the same input and the same rule pack always produce the same output. No randomness, no time-dependent results, no reliance on unordered iteration.
- **No external services:** matching and validation are local code. No AI calls, enrichment or verification APIs, or remote lookups.
- Fuzzball is always called with `force_ascii: false` (otherwise non-ASCII characters are stripped) and never with `useCollator` (locale dependent, so not deterministic).

## Control plane (cloud)

| Service            | Purpose                                                    | What it receives                        |
| ------------------ | ---------------------------------------------------------- | --------------------------------------- |
| License validation | Confirms the user's license key is valid                   | License key                             |
| Rule packs         | Serves **signed** per-CRM rules (required fields, formats) | Which CRM's pack is requested           |
| Billing            | Subscription and payment handling (Stripe webhook)         | Billing details entered by the customer |
| Telemetry (opt-in) | Anonymized usage counts, e.g. "file processed"             | Event name and count only               |

Every call is listed in the [outbound calls registry](../README.md#outbound-calls-registry).

## How the boundary is enforced

| Layer               | Guard                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint (ESLint)       | `fetch`, XHR, WebSocket, EventSource and `sendBeacon` are errors anywhere in `src/` except `src/lib/control-plane-client/` and the server folders                                        |
| Lint (ESLint)       | `src/app/api/**` and `src/lib/control-plane/**` cannot import `src/lib/data-plane/`, `papaparse`, `fuzzball` or `libphonenumber-js`                                                      |
| Build               | Data-plane modules import `client-only` (all but type-only files and the worker entry); control-plane modules import `server-only`, so importing one from the wrong side fails the build |
| Browser (CSP)       | `connect-src 'self'` in production (`next.config.ts`): the browser refuses any request to a third-party origin                                                                           |
| Tests               | `tests/e2e/privacy.spec.ts` processes a fixture full of sentinel values and asserts none of them, the column names or the file name appear in any request URL, header or body            |
| Rule-pack integrity | The browser verifies each pack's signature before using it and rejects unsigned or invalid packs                                                                                         |
