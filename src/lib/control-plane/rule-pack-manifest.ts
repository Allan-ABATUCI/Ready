import "server-only";
import { createClient } from "@vercel/edge-config";
import type { LogNote } from "@/lib/control-plane/log";
import { isRulePackManifest, type RulePackManifest } from "@/lib/rule-packs/types";

export const EDGE_CONFIG_KEY = "rulePackManifest";

export const DEFAULT_MANIFEST: RulePackManifest = {
  packs: [
    { crm: "hubspot", version: "1.0.0" },
    { crm: "salesforce", version: "1.0.0" },
    { crm: "pipedrive", version: "1.0.0" },
  ],
};

/**
 * Read the manifest from Vercel Edge Config, falling back to the bundled
 * default. A fallback caused by a failure is noted in `note` for the request log.
 */
export async function getRulePackManifest(note: LogNote = {}): Promise<RulePackManifest> {
  const connection = process.env.EDGE_CONFIG;
  if (!connection) return DEFAULT_MANIFEST;
  try {
    const value = await createClient(connection).get(EDGE_CONFIG_KEY);
    if (isRulePackManifest(value)) return value;
    note.code = "edge_config_invalid";
  } catch {
    // The error may contain the connection string (with its token), so only the code is kept.
    note.code = "edge_config_failed";
  }
  return DEFAULT_MANIFEST;
}
