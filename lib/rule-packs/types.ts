export const CRMS = ["hubspot", "salesforce", "pipedrive"] as const;
export type Crm = (typeof CRMS)[number];

export function isCrm(v: unknown): v is Crm {
  return typeof v === "string" && (CRMS as readonly string[]).includes(v);
}

/** Public, data-free description of which rule-pack versions are current. */
export interface RulePackManifest {
  packs: { crm: Crm; version: string }[];
}

export function isRulePackManifest(v: unknown): v is RulePackManifest {
  if (typeof v !== "object" || v === null || !Array.isArray((v as RulePackManifest).packs)) return false;
  return (v as RulePackManifest).packs.every(
    (p) => typeof p === "object" && p !== null && isCrm(p.crm) && typeof p.version === "string" && p.version !== "",
  );
}

export type FieldFormat = "email" | "phone" | "date";

export interface RulePack {
  crm: Crm;
  version: string;
  requiredFields: string[];
  formats: Record<string, FieldFormat>;
}

/** Wire format: `payload` is the exact JSON string that was signed. */
export interface SignedRulePack {
  payload: string;
  /** Base64 ECDSA P-256 / SHA-256 signature (IEEE P1363 r||s) over the UTF-8 payload. */
  signature: string;
}
