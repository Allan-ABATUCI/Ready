# Control plane (server only)

Code here runs in Next.js API routes on Vercel. It must never receive or handle customer file data.
ESLint forbids importing `lib/data-plane/**`, `papaparse` or `fuzzball` from here and from `app/api/**`.
