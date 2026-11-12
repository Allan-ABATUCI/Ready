import { getSignedRulePack } from "@/lib/control-plane/rule-packs";
import { isCrm } from "@/lib/rule-packs/types";

/**
 * GET /api/rule-packs/<crm> — returns the signed rule pack for one CRM.
 * The only input is the CRM identifier in the path; there is no body or query.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ crm: string }> }): Promise<Response> {
  const { crm } = await params;
  if (!isCrm(crm)) return Response.json({ error: "unknown_crm" }, { status: 404 });
  return Response.json(getSignedRulePack(crm), { headers: { "Cache-Control": "public, max-age=300" } });
}
