import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { receive } from "@/lib/data-plane/run";
import { handleRequest } from "@/lib/data-plane/worker/handle";
import type { WorkerResponse } from "@/lib/data-plane/worker/protocol";
import { loadVerifiedRulePack } from "@/lib/rule-packs/load";
import { DEBUG_STORAGE_KEY, logEvent, toErrorCode, type DiagnosticEvent } from "./diagnostics";

const CONSOLE_METHODS = ["debug", "log", "info", "warn", "error"] as const;

let spies: MockInstance[] = [];
beforeEach(() => {
  spies = CONSOLE_METHODS.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  localStorage.clear();
});

/** Every argument passed to any console method, as text. */
const logged = () =>
  spies.flatMap((s) => s.mock.calls.flat().map((a) => (typeof a === "string" ? a : JSON.stringify(a))));

describe("logEvent", () => {
  it("writes one JSON line to console.debug in development", () => {
    logEvent({ kind: "stage", stage: "matching", ms: 12.6 });
    expect(console.debug).toHaveBeenCalledExactlyOnceWith('[ready] {"kind":"stage","stage":"matching","ms":13}');
  });

  it("stays silent in production unless the debug flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    logEvent({ kind: "error", code: "parse_failed" });
    expect(logged()).toEqual([]);

    localStorage.setItem(DEBUG_STORAGE_KEY, "1");
    logEvent({ kind: "error", code: "parse_failed" });
    expect(logged()).toEqual(['[ready] {"kind":"error","code":"parse_failed"}']);
  });

  it("only accepts closed, data-free event shapes", () => {
    const ok: DiagnosticEvent[] = [
      { kind: "stage", stage: "parsing", ms: 1 },
      { kind: "rule_pack", crm: "hubspot", status: "failed", reason: "bad_signature" },
    ];
    expect(ok).toHaveLength(2);

    // @ts-expect-error free-text error codes don't compile
    logEvent({ kind: "error", code: "Zoë Müller is not a valid email" });
    // @ts-expect-error no message field to carry Error.message
    logEvent({ kind: "error", code: "unknown", message: "boom" });
    // @ts-expect-error no column names
    logEvent({ kind: "stage", stage: "matching", ms: 1, column: "Email" });
    // @ts-expect-error no row counts
    logEvent({ kind: "manifest", status: "loaded", rows: 42 });
    // @ts-expect-error a failed rule pack needs a known reason, not text
    logEvent({ kind: "rule_pack", crm: "hubspot", status: "failed", reason: "signature mismatch for ACME" });
  });
});

describe("toErrorCode", () => {
  it("keeps known codes and discards any other message unread", () => {
    expect(toErrorCode(new Error("parse_failed"))).toBe("parse_failed");
    expect(toErrorCode(new Error("worker_failed"))).toBe("worker_failed");
    expect(toErrorCode(new Error("Unexpected token in 'Quillon Zephyrine'"))).toBe("unknown");
    expect(toErrorCode("parse_failed")).toBe("unknown"); // not an Error
    expect(toErrorCode(null)).toBe("unknown");
  });
});

describe("diagnostics never contain file data", () => {
  const FILE_NAME = "acme-leads-FILENAME-SENTINEL-QZ7X.csv";
  const csv = readFileSync("tests/fixtures/privacy-sentinel.csv", "utf8");
  const [headerLine = "", ...dataLines] = csv.trim().split(/\r?\n/);
  const sentinels = [FILE_NAME, "QZ7X", ...headerLine.split(","), ...dataLines.flatMap((l) => l.split(","))]
    .filter((s) => s.length >= 4)
    .map((s) => s.toLowerCase());

  it("with debug on, through processing, re-analysis, errors and rule-pack loading", async () => {
    // Production build with the debug flag: the path a user would turn on.
    vi.stubEnv("NODE_ENV", "production");
    localStorage.setItem(DEBUG_STORAGE_KEY, "1");

    const messages: WorkerResponse[] = [];
    const file = new File([readFileSync("tests/fixtures/privacy-sentinel.csv")], FILE_NAME, { type: "text/csv" });
    await handleRequest({ type: "process", file }, (m) => messages.push(m));
    const done = messages.at(-1)!;
    expect(done.type).toBe("processed");
    if (done.type !== "processed") return;
    const { parsed, profile, roles } = done.result;
    await handleRequest({ type: "analyze", parsed, profile, roles: { ...roles, company: 4 } }, (m) => messages.push(m));
    for (const m of messages) receive(m);

    logEvent({ kind: "error", code: toErrorCode(new Error(`bad row: ${dataLines[0]}`)) });
    await loadVerifiedRulePack("hubspot", async () => null);
    await loadVerifiedRulePack("hubspot", async () => ({ payload: csv, signature: "QZ7X" }));

    const lines = logged();
    // Sanity: debug output really happened, including every stage timing.
    expect(lines.filter((l) => l.includes('"kind":"stage"'))).toHaveLength(6);
    expect(lines).toContain('[ready] {"kind":"error","code":"unknown"}');
    expect(lines.some((l) => l.includes('"reason":"fetch_failed"'))).toBe(true);
    expect(lines.some((l) => l.includes('"reason":"bad_signature"'))).toBe(true);

    const leaks = lines.flatMap((l) => sentinels.filter((s) => l.toLowerCase().includes(s)).map((s) => `${s} in ${l}`));
    expect(leaks).toEqual([]);
  });
});
