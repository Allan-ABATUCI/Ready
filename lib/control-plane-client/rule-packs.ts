import type { Crm, RulePackManifest, SignedRulePack } from "@/lib/rule-packs/types";
import { isRulePackManifest } from "@/lib/rule-packs/types";

/** GET the current rule-pack manifest. No query string, no body, no credentials. */
export async function fetchRulePackManifest(): Promise<RulePackManifest | null> {
  try {
    const res = await fetch("/api/rule-packs/manifest", { method: "GET", credentials: "omit", cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isRulePackManifest(json) ? json : null;
  } catch {
    return null;
  }
}

function isSignedRulePack(v: unknown): v is SignedRulePack {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as SignedRulePack).payload === "string" &&
    typeof (v as SignedRulePack).signature === "string"
  );
}

/**
 * GET the signed rule pack for one CRM. The CRM identifier (chosen by the user,
 * never derived from the file) is the only thing sent. No query, body or credentials.
 * The result is unverified: callers must run `verifyRulePack` before using it.
 */
export async function fetchSignedRulePack(crm: Crm): Promise<SignedRulePack | null> {
  try {
    const res = await fetch(`/api/rule-packs/${encodeURIComponent(crm)}`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isSignedRulePack(json) ? json : null;
  } catch {
    return null;
  }
}
