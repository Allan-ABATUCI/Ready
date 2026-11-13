import { vi } from "vitest";

/** Capture the JSON lines API routes write through console.log. */
export function captureRequestLog() {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  return {
    /** Parsed log entries, in order. */
    entries: () => spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>),
    /** Everything written, as one string, for "never contains" checks. */
    raw: () => spy.mock.calls.flat().map(String).join("\n"),
  };
}
