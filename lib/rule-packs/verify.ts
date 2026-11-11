import { isCrm, type FieldFormat, type RulePack, type SignedRulePack } from "./types";

export class RulePackVerificationError extends Error {
  constructor(public readonly code: "missing_key" | "unsigned" | "bad_signature" | "malformed") {
    super(`rule pack rejected: ${code}`);
    this.name = "RulePackVerificationError";
  }
}

const ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const FORMATS: FieldFormat[] = ["email", "phone", "date"];

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isRulePack(v: unknown): v is RulePack {
  if (typeof v !== "object" || v === null) return false;
  const p = v as RulePack;
  return (
    isCrm(p.crm) &&
    typeof p.version === "string" &&
    Array.isArray(p.requiredFields) &&
    p.requiredFields.every((f) => typeof f === "string") &&
    typeof p.formats === "object" &&
    p.formats !== null &&
    Object.values(p.formats).every((f) => FORMATS.includes(f))
  );
}

/**
 * Verify a signed rule pack with WebCrypto and return the parsed pack.
 * Fails closed: no key, no signature, bad signature or bad shape ⇒ throws.
 */
export async function verifyRulePack(signed: SignedRulePack, publicKey: JsonWebKey | null): Promise<RulePack> {
  if (!publicKey) throw new RulePackVerificationError("missing_key");
  if (!signed?.payload || !signed?.signature) throw new RulePackVerificationError("unsigned");

  let ok: boolean;
  try {
    const key = await crypto.subtle.importKey("jwk", publicKey, ALGO, false, ["verify"]);
    ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64ToBytes(signed.signature),
      new TextEncoder().encode(signed.payload),
    );
  } catch {
    throw new RulePackVerificationError("bad_signature");
  }
  if (!ok) throw new RulePackVerificationError("bad_signature");

  let parsed: unknown;
  try {
    parsed = JSON.parse(signed.payload);
  } catch {
    throw new RulePackVerificationError("malformed");
  }
  if (!isRulePack(parsed)) throw new RulePackVerificationError("malformed");
  return parsed;
}
