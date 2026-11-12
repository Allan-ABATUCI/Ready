import { fetchSignedRulePack } from "@/lib/control-plane-client/rule-packs";
import { RULE_PACK_PUBLIC_KEY } from "./public-key";
import type { Crm, RulePack } from "./types";
import { verifyRulePack } from "./verify";

/**
 * Fetch and verify the rule pack for `crm`. Returns null unless the pack is
 * signed by our key and is for the CRM that was asked for; an unverified pack
 * is never returned.
 */
export async function loadVerifiedRulePack(
  crm: Crm,
  fetcher: typeof fetchSignedRulePack = fetchSignedRulePack,
  publicKey: JsonWebKey | null = RULE_PACK_PUBLIC_KEY,
): Promise<RulePack | null> {
  const signed = await fetcher(crm);
  if (!signed) return null;
  try {
    const pack = await verifyRulePack(signed, publicKey);
    return pack.crm === crm ? pack : null;
  } catch {
    return null;
  }
}
