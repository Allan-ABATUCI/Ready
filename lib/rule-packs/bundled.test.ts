// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_MANIFEST } from "@/lib/control-plane/rule-pack-manifest";
import { RULE_PACK_PUBLIC_KEY } from "./public-key";
import { CRMS } from "./types";
import { verifyRulePack } from "./verify";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

describe("bundled rule packs", () => {
  it("has a signed pack for every CRM and nothing else", () => {
    expect(readdirSync("rule-packs/signed").sort()).toEqual(CRMS.map((c) => `${c}.json`).sort());
  });

  it.each(CRMS)("%s: signed pack verifies and matches its source (re-sign after editing src)", async (crm) => {
    const pack = await verifyRulePack(read(`rule-packs/signed/${crm}.json`), RULE_PACK_PUBLIC_KEY);
    expect(pack).toEqual(read(`rule-packs/src/${crm}.json`));
    expect(DEFAULT_MANIFEST.packs.find((p) => p.crm === crm)?.version).toBe(pack.version);
  });
});
