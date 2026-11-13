/**
 * Privacy-safe diagnostics for the browser.
 *
 * Events are a closed union of enums and numbers, so the type system rejects
 * free text. No strings from files, no column names, no row counts, no file
 * names and no Error.message: any of those could quote or describe customer
 * data (CLAUDE.md "derived values"). Error objects are reduced to a known code.
 *
 * Output goes to console.debug only, never over the network, and only in
 * development or after `localStorage.setItem("ready:debug", "1")`. That flag
 * holds no file data, so storing it doesn't conflict with CLAUDE.md rule 4.
 */
import type { Stage } from "@/lib/data-plane/types";
import type { Crm } from "@/lib/rule-packs/types";
import type { RulePackVerificationError } from "@/lib/rule-packs/verify";

export const DEBUG_STORAGE_KEY = "ready:debug";

/** Every error code the app can surface. Anything else is logged as "unknown". */
export const ERROR_CODES = [
  "parse_failed",
  "analyze_failed",
  "worker_failed",
  "session_invalid",
  "session_version",
  "xlsx_invalid",
  "xlsx_too_large",
  "xlsx_empty",
  "unknown",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type RulePackRejection = RulePackVerificationError["code"] | "fetch_failed" | "wrong_crm";

export type DiagnosticEvent =
  | { kind: "stage"; stage: Stage; ms: number }
  | { kind: "error"; code: ErrorCode }
  | { kind: "rule_pack"; crm: Crm; status: "verified" }
  | { kind: "rule_pack"; crm: Crm; status: "failed"; reason: RulePackRejection }
  | { kind: "manifest"; status: "loaded" | "failed" };

/**
 * Map a thrown value to a known code. Our own failures reject with
 * `new Error(code)`; any other message is discarded unread, since it may
 * quote file content.
 */
export function toErrorCode(e: unknown): ErrorCode {
  const message = e instanceof Error ? e.message : null;
  return (ERROR_CODES as readonly (string | null)[]).includes(message) ? (message as ErrorCode) : "unknown";
}

function enabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  try {
    return globalThis.localStorage?.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false; // storage blocked (privacy settings, sandboxed frame)
  }
}

export function logEvent(e: DiagnosticEvent): void {
  if (!enabled()) return;
  // Whole milliseconds: sub-millisecond precision adds nothing for debugging.
  const event = e.kind === "stage" ? { ...e, ms: Math.round(e.ms) } : e;
  console.debug(`[ready] ${JSON.stringify(event)}`);
}
