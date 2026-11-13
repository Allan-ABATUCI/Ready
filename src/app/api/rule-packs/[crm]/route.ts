import { failWith, logged } from "@/lib/control-plane/log";
import { getSignedRulePack } from "@/lib/control-plane/rule-packs";
import { isCrm } from "@/lib/rule-packs/types";

/**
 * GET /api/rule-packs/<crm> — returns the signed rule pack for one CRM.
 * The only input is the CRM identifier in the path; there is no body or query.
 */
export function GET(_req: Request, { params }: { params: Promise<{ crm: string }> }): Promise<Response> {
  return logged("rule_pack", async (note) => {
    const { crm } = await params;
    if (!isCrm(crm)) return failWith(note, "unknown_crm", 404);
    return Response.json(getSignedRulePack(crm), { headers: { "Cache-Control": "public, max-age=300" } });
  });
}
