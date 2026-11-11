import { getRulePackManifest } from "@/lib/control-plane/rule-pack-manifest";

export const dynamic = "force-dynamic";

/** GET /api/rule-packs/manifest — no request payload; returns current pack versions. */
export async function GET(): Promise<Response> {
  const manifest = await getRulePackManifest();
  return Response.json(manifest, { headers: { "Cache-Control": "public, max-age=60" } });
}
