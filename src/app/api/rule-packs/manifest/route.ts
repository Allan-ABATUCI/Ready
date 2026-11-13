import { logged } from "@/lib/control-plane/log";
import { getRulePackManifest } from "@/lib/control-plane/rule-pack-manifest";

export const dynamic = "force-dynamic";

/** GET /api/rule-packs/manifest — no request payload; returns current pack versions. */
export function GET(): Promise<Response> {
  return logged("rule_pack_manifest", async (note) => {
    const manifest = await getRulePackManifest(note);
    return Response.json(manifest, { headers: { "Cache-Control": "public, max-age=60" } });
  });
}
