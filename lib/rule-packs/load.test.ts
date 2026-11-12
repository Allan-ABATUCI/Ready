// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadVerifiedRulePack } from "./load";
import type { SignedRulePack } from "./types";

const signed = (crm: string): SignedRulePack => JSON.parse(readFileSync(`rule-packs/signed/${crm}.json`, "utf8"));

describe("loadVerifiedRulePack", () => {
  it("returns the pack when the signature verifies", async () => {
    const fetcher = vi.fn(async () => signed("hubspot"));
    await expect(loadVerifiedRulePack("hubspot", fetcher)).resolves.toMatchObject({ crm: "hubspot" });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("hubspot");
  });

  it("rejects tampered payloads", async () => {
    const s = signed("hubspot");
    const tampered = { ...s, payload: s.payload.replace('"Email"]', '"Email","Phone Number"]') };
    expect(tampered.payload).not.toBe(s.payload);
    await expect(loadVerifiedRulePack("hubspot", async () => tampered)).resolves.toBeNull();
  });

  it("rejects a validly signed pack for a different CRM", async () => {
    await expect(loadVerifiedRulePack("hubspot", async () => signed("salesforce"))).resolves.toBeNull();
  });

  it("fails closed without a key or when the fetch fails", async () => {
    await expect(loadVerifiedRulePack("hubspot", async () => signed("hubspot"), null)).resolves.toBeNull();
    await expect(loadVerifiedRulePack("hubspot", async () => null)).resolves.toBeNull();
  });

  describe("diagnostics", () => {
    afterEach(() => vi.restoreAllMocks());

    it("logs the outcome as a code for each path", async () => {
      const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
      await loadVerifiedRulePack("hubspot", async () => signed("hubspot"));
      await loadVerifiedRulePack("hubspot", async () => null);
      await loadVerifiedRulePack("hubspot", async () => signed("salesforce"));
      await loadVerifiedRulePack("hubspot", async () => signed("hubspot"), null);
      await loadVerifiedRulePack("hubspot", async () => ({ payload: "{}", signature: "" }));
      expect(debug.mock.calls.map(([line]) => JSON.parse(String(line).replace("[ready] ", "")))).toEqual([
        { kind: "rule_pack", crm: "hubspot", status: "verified" },
        { kind: "rule_pack", crm: "hubspot", status: "failed", reason: "fetch_failed" },
        { kind: "rule_pack", crm: "hubspot", status: "failed", reason: "wrong_crm" },
        { kind: "rule_pack", crm: "hubspot", status: "failed", reason: "missing_key" },
        { kind: "rule_pack", crm: "hubspot", status: "failed", reason: "unsigned" },
      ]);
    });
  });
});
