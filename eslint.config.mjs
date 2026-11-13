import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const NETWORK_MSG =
  "Outbound network calls are only allowed in src/lib/control-plane-client/ (browser) or src/app/api/ + src/lib/control-plane/ (server). " +
  "See CLAUDE.md 'Privacy invariant' and the README outbound calls registry.";

const DATA_PLANE_MSG =
  "Server code must never import data-plane code. CSV parsing, matching, validation and export run only in the browser.";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,

  // Privacy guard 1: no ad-hoc network calls from browser code. The only
  // browser-side choke point for outbound requests is src/lib/control-plane-client/.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**", "src/lib/control-plane/**", "src/lib/control-plane-client/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: NETWORK_MSG },
        { name: "XMLHttpRequest", message: NETWORK_MSG },
        { name: "WebSocket", message: NETWORK_MSG },
        { name: "EventSource", message: NETWORK_MSG },
      ],
      "no-restricted-properties": [
        "error",
        { object: "navigator", property: "sendBeacon", message: NETWORK_MSG },
        { object: "window", property: "fetch", message: NETWORK_MSG },
        { object: "globalThis", property: "fetch", message: NETWORK_MSG },
        { object: "self", property: "fetch", message: NETWORK_MSG },
      ],
    },
  },

  // Privacy guard 2: server code (API routes, control plane) cannot import the
  // data plane or the CSV/matching libraries.
  {
    files: ["src/app/api/**/*.ts", "src/lib/control-plane/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "papaparse", message: DATA_PLANE_MSG },
            { name: "fuzzball", message: DATA_PLANE_MSG },
            { name: "libphonenumber-js", message: DATA_PLANE_MSG },
            { name: "libphonenumber-js/min", message: DATA_PLANE_MSG },
          ],
          patterns: [
            { group: ["@/lib/data-plane", "@/lib/data-plane/*", "**/data-plane/**"], message: DATA_PLANE_MSG },
          ],
        },
      ],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
