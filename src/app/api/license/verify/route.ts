import { verifyLicenseKey } from "@/lib/control-plane/license";
import { failWith, logged } from "@/lib/control-plane/log";

const MAX_BODY_BYTES = 256;

/**
 * POST /api/license/verify — body: { "licenseKey": string } and nothing else.
 * The strict shape + size cap means this endpoint cannot be (ab)used to carry file data.
 */
export function POST(req: Request): Promise<Response> {
  return logged("license_verify", async (note) => {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return failWith(note, "payload_too_large", 413);

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return failWith(note, "invalid_json", 400);
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Object.keys(body).length !== 1 ||
      typeof (body as { licenseKey?: unknown }).licenseKey !== "string"
    ) {
      return failWith(note, "invalid_body", 400);
    }

    // The key itself is never logged; only the outcome.
    const result = verifyLicenseKey((body as { licenseKey: string }).licenseKey);
    if (!result.valid) note.code = result.reason;
    const status = result.valid ? 200 : result.reason === "malformed" ? 400 : 501;
    return Response.json(result, { status });
  });
}
