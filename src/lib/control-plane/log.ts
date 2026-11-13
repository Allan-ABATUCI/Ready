import "server-only";

/**
 * Request logging for API routes: one JSON line per request through
 * console.log, which Vercel captures.
 *
 * Only the route name, status, a code from a fixed list and the duration are
 * logged. Never the license key, request bodies, headers or Stripe payloads:
 * `RequestLog` has no field that could hold them, so the types keep it that way.
 */
export type Route = "license_verify" | "rule_pack" | "rule_pack_manifest" | "stripe_webhook";

export type LogCode =
  // license
  | "payload_too_large"
  | "invalid_json"
  | "invalid_body"
  | "malformed"
  | "not_implemented"
  // rule packs
  | "unknown_crm"
  | "edge_config_failed"
  | "edge_config_invalid"
  // stripe
  | "not_configured"
  | "missing_signature"
  | "invalid_signature"
  | "unhandled_event"
  // any route
  | "unhandled_error";

export interface RequestLog {
  route: Route;
  status: number;
  code?: LogCode;
  ms: number;
}

export function logRequest({ route, status, code, ms }: RequestLog): void {
  // Rebuilt field by field so nothing else can ride along, even through a cast.
  console.log(JSON.stringify({ event: "request", route, status, ...(code ? { code } : {}), ms: Math.round(ms) }));
}

/** Lets a handler record why it answered the way it did. */
export interface LogNote {
  code?: LogCode;
}

/** Time `run`, then log its route, status and noted code, even if it throws. */
export async function logged(route: Route, run: (note: LogNote) => Promise<Response>): Promise<Response> {
  const start = performance.now();
  const note: LogNote = {};
  let status = 500;
  try {
    const res = await run(note);
    status = res.status;
    return res;
  } catch (e) {
    note.code ??= "unhandled_error";
    throw e;
  } finally {
    logRequest({ route, status, code: note.code, ms: performance.now() - start });
  }
}

/** A JSON error response whose code is also noted for the log. */
export function failWith(note: LogNote, code: LogCode, status: number): Response {
  note.code = code;
  return Response.json({ error: code }, { status });
}
