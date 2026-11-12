import "server-only";
import { createClient } from "@vercel/edge-config";
import { isRulePackManifest, type RulePackManifest } from "@/lib/rule-packs/types";

export const EDGE_CONFIG_KEY = "rulePackManifest";

export const DEFAULT_MANIFEST: RulePackManifest = {
  packs: [
    { crm: "hubspot", version: "1.0.0" },
    { crm: "salesforce", version: "1.0.0" },
    { crm: "pipedrive", version: "1.0.0" },
  ],
};

/** Read the manifest from Vercel Edge Config, falling back to the bundled default. */
export async function getRulePackManifest(): Promise<RulePackManifest> {
  const connection = process.env.EDGE_CONFIG;
  if (!connection) return DEFAULT_MANIFEST;
  try {
    const value = await createClient(connection).get(EDGE_CONFIG_KEY);
    return isRulePackManifest(value) ? value : DEFAULT_MANIFEST;
  } catch {
    return DEFAULT_MANIFEST;
  }
}
