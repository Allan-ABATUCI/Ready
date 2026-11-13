// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRequestLog } from "@tests/support/request-log";
import { POST } from "./route";

const call = (body: string) =>
  POST(
    new Request("http://localhost/api/license/verify", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    }),
  );

describe("POST /api/license/verify", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects malformed keys", async () => {
    const res = await call(JSON.stringify({ licenseKey: "nope" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ valid: false, reason: "malformed" });
  });

  it("returns not_implemented for well-formed keys until the backend exists", async () => {
    const res = await call(JSON.stringify({ licenseKey: "RDY-ABCDE-12345-FGHIJ-67890" }));
    expect(res.status).toBe(501);
  });

  it("refuses any field other than licenseKey (cannot carry file data)", async () => {
    const res = await call(JSON.stringify({ licenseKey: "RDY-ABCDE-12345-FGHIJ-67890", rows: 42 }));
    expect(res.status).toBe(400);
  });

  it("refuses oversized bodies", async () => {
    const res = await call(JSON.stringify({ licenseKey: "x".repeat(1000) }));
    expect(res.status).toBe(413);
  });

  it("refuses invalid JSON", async () => {
    expect((await call("{")).status).toBe(400);
  });

  it("logs the outcome but never the license key", async () => {
    const log = captureRequestLog();
    await call(JSON.stringify({ licenseKey: "RDY-QZ7XA-12345-FGHIJ-67890" }));
    await call(JSON.stringify({ licenseKey: "QZ7X-not-a-key" }));
    expect(log.entries()).toMatchObject([
      { route: "license_verify", status: 501, code: "not_implemented" },
      { route: "license_verify", status: 400, code: "malformed" },
    ]);
    expect(log.raw()).not.toContain("QZ7X");
  });
});
