import { verifyLicenseKey } from "@/lib/control-plane/license";

const MAX_BODY_BYTES = 256;

/**
 * POST /api/license/verify — body: { "licenseKey": string } and nothing else.
 * The strict shape + size cap means this endpoint cannot be (ab)used to carry file data.
 */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Object.keys(body).length !== 1 ||
    typeof (body as { licenseKey?: unknown }).licenseKey !== "string"
  ) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = verifyLicenseKey((body as { licenseKey: string }).licenseKey);
  const status = result.valid ? 200 : result.reason === "malformed" ? 400 : 501;
  return Response.json(result, { status });
}
