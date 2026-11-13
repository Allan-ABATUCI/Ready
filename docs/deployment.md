# Deployment

Ready is hosted on **Vercel**. A Docker image is also provided to run the same production build on any container host or locally.

## Vercel (production)

Vercel builds from source with `npm run build`; it does not use the `Dockerfile`.

1. Import the GitHub repository in Vercel. The framework (Next.js) is detected automatically.
2. Set the environment variables below in the Vercel project settings.
3. With Vercel's default Git integration, pushes to `main` (production branch) deploy to production and other branches get preview deployments.

## Docker

```bash
cp .env.example .env          # optional; fill in only what you need
docker compose up --build     # http://localhost:3000
```

Or without Compose:

```bash
docker build -t ready .
docker run -p 3000:3000 --env-file .env ready
```

How the image is built (`Dockerfile`):

- Three stages: install dependencies, build, then a minimal runtime on `node:24-alpine`.
- The build sets `BUILD_STANDALONE=1`, which switches Next.js to its `standalone` output (`next.config.ts`). Vercel and `next start` are unaffected.
- Runs as the unprivileged `node` user, on port 3000, with a health check on `/`.
- `.dockerignore` keeps `.env` files and `.keys/` out of the image.

`npm run test:docker` (also run in CI) builds and starts the image, then checks the security headers, the signed rule-pack API, the non-root user and that no secrets were copied in.

The container makes no outbound calls of its own: Next.js telemetry is off, and Edge Config is only read when `EDGE_CONFIG` is set (see the [outbound calls registry](../README.md#outbound-calls-registry)).

## Environment variables

Secrets are never written in code. They are read from the environment; `.env` and `.env*.local` are gitignored, and `.env.example` documents every variable.

| Variable                | Required                       | Purpose                                                                                       |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `EDGE_CONFIG`           | No                             | Vercel Edge Config connection string. When unset, the bundled rule-pack manifest is served    |
| `STRIPE_WEBHOOK_SECRET` | For `/api/stripe/webhook` only | Stripe webhook signing secret (`whsec_...`)                                                   |
| `RULE_PACK_PRIVATE_KEY` | No (signing script only)       | Path to the rule-pack private key, if not `.keys/rule-pack.private.jwk`. Never set in deploys |

None of them use the `NEXT_PUBLIC_` prefix, so none reach the browser.
