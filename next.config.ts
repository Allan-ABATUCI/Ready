import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy is defence in depth for the privacy invariant
 * (see CLAUDE.md): `connect-src 'self'` means the browser itself refuses any
 * fetch/XHR/beacon/WebSocket to a third-party origin, so a stray SDK or
 * dependency cannot exfiltrate file data even if it tried.
 *
 * Adding a new origin here is adding an outbound call — it must be recorded
 * in the README "Outbound calls registry" and covered by e2e/privacy.spec.ts.
 */
const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; dev mode additionally needs eval.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Next 16 blocks dev scripts on any origin but localhost, so the page renders
  // but never hydrates. 127.0.0.1 is safe to allow everywhere; LAN IPs are
  // machine-specific and don't belong in the repo.
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
