// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRequestLog } from "@/tests/support/request-log";
import { RULE_PACK_PUBLIC_KEY } from "@/lib/rule-packs/public-key";
import { verifyRulePack } from "@/lib/rule-packs/verify";
import { GET } from "./route";

const call = (crm: string) =>
  GET(new Request(`http://localhost/api/rule-packs/${crm}`), { params: Promise.resolve({ crm }) });

describe("GET /api/rule-packs/[crm]", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["hubspot", "salesforce", "pipedrive"] as const)("serves a pack for %s that verifies", async (crm) => {
    const res = await call(crm);
    expect(res.status).toBe(200);
    const pack = await verifyRulePack(await res.json(), RULE_PACK_PUBLIC_KEY);
    expect(pack.crm).toBe(crm);
  });

  it("404s for unknown CRMs without echoing the input", async () => {
    const res = await call("zoho");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("zoho");
  });

  it("logs each request with its route and status", async () => {
    const log = captureRequestLog();
    await call("hubspot");
    await call("zoho");
    expect(log.entries()).toMatchObject([
      { route: "rule_pack", status: 200 },
      { route: "rule_pack", status: 404, code: "unknown_crm" },
    ]);
    expect(log.raw()).not.toContain("zoho");
  });
});
