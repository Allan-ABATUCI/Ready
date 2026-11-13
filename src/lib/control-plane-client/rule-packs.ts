import type { Crm, RulePackManifest, SignedRulePack } from "@/lib/rule-packs/types";
import { isRulePackManifest } from "@/lib/rule-packs/types";

/**
 * The one way this module talks to the control plane: a same-origin GET with no
 * query string, no body and no credentials. Returns null on any network error,
 * non-2xx status or unexpected response shape, so callers never see partial data.
 */
async function getJson<T>(path: string, isValid: (v: unknown) => v is T): Promise<T | null> {
  try {
    const res = await fetch(path, { method: "GET", credentials: "omit", cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isValid(json) ? json : null;
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

/** GET the current rule-pack manifest. */
export function fetchRulePackManifest(): Promise<RulePackManifest | null> {
  return getJson("/api/rule-packs/manifest", isRulePackManifest);
}

/**
 * GET the signed rule pack for one CRM. The CRM identifier (chosen by the user,
 * never derived from the file) is the only thing sent.
 * The result is unverified: callers must run `verifyRulePack` before using it.
 */
export function fetchSignedRulePack(crm: Crm): Promise<SignedRulePack | null> {
  return getJson(`/api/rule-packs/${encodeURIComponent(crm)}`, isSignedRulePack);
}
