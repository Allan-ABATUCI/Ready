import { isRulePackManifest, type RulePackManifest } from "@/lib/rule-packs/types";

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
