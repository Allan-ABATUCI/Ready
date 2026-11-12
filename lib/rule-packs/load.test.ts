// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
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
});
