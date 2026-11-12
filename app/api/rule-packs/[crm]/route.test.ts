// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RULE_PACK_PUBLIC_KEY } from "@/lib/rule-packs/public-key";
import { verifyRulePack } from "@/lib/rule-packs/verify";
import { GET } from "./route";

const call = (crm: string) =>
  GET(new Request(`http://localhost/api/rule-packs/${crm}`), { params: Promise.resolve({ crm }) });

describe("GET /api/rule-packs/[crm]", () => {
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
});
