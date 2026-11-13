import "server-only";
import hubspot from "@rule-packs/signed/hubspot.json";
import pipedrive from "@rule-packs/signed/pipedrive.json";
import salesforce from "@rule-packs/signed/salesforce.json";
import type { Crm, SignedRulePack } from "@/lib/rule-packs/types";

/** Signed packs bundled at build time. Produced by `node scripts/rule-packs.mjs sign`. */
const PACKS: Record<Crm, SignedRulePack> = { hubspot, salesforce, pipedrive };

export function getSignedRulePack(crm: Crm): SignedRulePack {
  return PACKS[crm];
}
