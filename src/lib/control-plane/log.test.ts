// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRequestLog } from "@tests/support/request-log";
import { failWith, logged, logRequest, type RequestLog } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("logRequest", () => {
  it("writes one JSON line with route, status, code and whole milliseconds", () => {
    const log = captureRequestLog();
    logRequest({ route: "rule_pack", status: 404, code: "unknown_crm", ms: 3.4 });
    logRequest({ route: "rule_pack_manifest", status: 200, ms: 1 });
    expect(log.entries()).toEqual([
      { event: "request", route: "rule_pack", status: 404, code: "unknown_crm", ms: 3 },
      { event: "request", route: "rule_pack_manifest", status: 200, ms: 1 },
    ]);
  });

  it("drops any field outside the schema, even if one is forced in", () => {
    const log = captureRequestLog();
    const sneaky = { route: "license_verify", status: 400, ms: 1, licenseKey: "RDY-SECRT-00000-00000-00000" };
    logRequest(sneaky as RequestLog);
    expect(log.raw()).not.toContain("RDY-SECRT");
  });

  it("has no field for free text", () => {
    // @ts-expect-error codes come from a fixed list
    logRequest({ route: "rule_pack", status: 500, code: "Error: connect ECONNREFUSED", ms: 1 });
    // @ts-expect-error no body/header fields
    logRequest({ route: "license_verify", status: 200, ms: 1, body: "{}" });
  });
});

describe("logged", () => {
  it("logs the response status and the noted code", async () => {
    const log = captureRequestLog();
    const res = await logged("license_verify", async (note) => failWith(note, "invalid_json", 400));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
    expect(log.entries()).toEqual([
      { event: "request", route: "license_verify", status: 400, code: "invalid_json", ms: expect.any(Number) },
    ]);
  });

  it("logs a 500 with unhandled_error when the handler throws, without the error message", async () => {
    const log = captureRequestLog();
    const run = logged("stripe_webhook", async () => {
      throw new Error("secret detail QZ7X");
    });
    await expect(run).rejects.toThrow("secret detail QZ7X");
    expect(log.entries()).toEqual([
      { event: "request", route: "stripe_webhook", status: 500, code: "unhandled_error", ms: expect.any(Number) },
    ]);
    expect(log.raw()).not.toContain("QZ7X");
  });
});
