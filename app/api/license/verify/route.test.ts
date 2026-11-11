// @vitest-environment node
import { describe, expect, it } from "vitest";
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
});
