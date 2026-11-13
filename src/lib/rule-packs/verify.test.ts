// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { RulePack } from "./types";
import { verifyRulePack } from "./verify";

const ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const pack: RulePack = { crm: "hubspot", version: "1.0.0", requiredFields: ["Email"], formats: { Email: "email" } };

let keys: CryptoKeyPair;
let publicJwk: JsonWebKey;

async function sign(payload: string, key = keys.privateKey) {
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(payload));
  return Buffer.from(sig).toString("base64");
}

beforeAll(async () => {
  keys = await crypto.subtle.generateKey(ALGO, true, ["sign", "verify"]);
  publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
});

describe("verifyRulePack", () => {
  it("accepts a correctly signed pack", async () => {
    const payload = JSON.stringify(pack);
    await expect(verifyRulePack({ payload, signature: await sign(payload) }, publicJwk)).resolves.toEqual(pack);
  });

  it("rejects when no public key is configured (fail closed)", async () => {
    const payload = JSON.stringify(pack);
    await expect(verifyRulePack({ payload, signature: await sign(payload) }, null)).rejects.toMatchObject({
      code: "missing_key",
    });
  });

  it("rejects unsigned packs", async () => {
    await expect(verifyRulePack({ payload: JSON.stringify(pack), signature: "" }, publicJwk)).rejects.toMatchObject({
      code: "unsigned",
    });
  });

  it("rejects a tampered payload", async () => {
    const signature = await sign(JSON.stringify(pack));
    const tampered = JSON.stringify({ ...pack, requiredFields: [] });
    await expect(verifyRulePack({ payload: tampered, signature }, publicJwk)).rejects.toMatchObject({
      code: "bad_signature",
    });
  });

  it("rejects a pack signed by a different key", async () => {
    const other = await crypto.subtle.generateKey(ALGO, true, ["sign", "verify"]);
    const payload = JSON.stringify(pack);
    await expect(
      verifyRulePack({ payload, signature: await sign(payload, other.privateKey) }, publicJwk),
    ).rejects.toMatchObject({ code: "bad_signature" });
  });

  it("rejects a validly signed but malformed pack", async () => {
    const payload = JSON.stringify({ crm: "not-a-crm", version: "1" });
    await expect(verifyRulePack({ payload, signature: await sign(payload) }, publicJwk)).rejects.toMatchObject({
      code: "malformed",
    });
  });
});
