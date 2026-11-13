import { fetchSignedRulePack } from "@/lib/control-plane-client/rule-packs";
import { logEvent } from "@/lib/diagnostics";
import { RULE_PACK_PUBLIC_KEY } from "./public-key";
import type { Crm, RulePack } from "./types";
import { RulePackVerificationError, verifyRulePack } from "./verify";

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
  if (!signed) {
    logEvent({ kind: "rule_pack", crm, status: "failed", reason: "fetch_failed" });
    return null;
  }
  try {
    const pack = await verifyRulePack(signed, publicKey);
    if (pack.crm !== crm) {
      logEvent({ kind: "rule_pack", crm, status: "failed", reason: "wrong_crm" });
      return null;
    }
    logEvent({ kind: "rule_pack", crm, status: "verified" });
    return pack;
  } catch (e) {
    // verifyRulePack only throws RulePackVerificationError; anything else is a bug, still fail closed.
    const reason = e instanceof RulePackVerificationError ? e.code : "malformed";
    logEvent({ kind: "rule_pack", crm, status: "failed", reason });
    return null;
  }
}
