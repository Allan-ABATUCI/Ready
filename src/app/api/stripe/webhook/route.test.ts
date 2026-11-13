// @vitest-environment node
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRequestLog } from "@tests/support/request-log";
import { POST } from "./route";

const SECRET = "whsec_test_secret";

function request(payload: string, signature?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["stripe-signature"] = signature;
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers });
}

const event = (type: string) => JSON.stringify({ id: "evt_test", object: "event", type, data: { object: {} } });
const sign = (payload: string, secret = SECRET) => Stripe.webhooks.generateTestHeaderString({ payload, secret });

describe("POST /api/stripe/webhook", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("500s when the webhook secret is not configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await POST(request(event("checkout.session.completed"), "t=1,v1=x"))).status).toBe(500);
  });

  it("400s without a signature header", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    expect((await POST(request(event("checkout.session.completed")))).status).toBe(400);
  });

  it("400s on an invalid signature", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    const payload = event("checkout.session.completed");
    expect((await POST(request(payload, await sign(payload, "whsec_wrong")))).status).toBe(400);
  });

  it("accepts a correctly signed handled event", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    const payload = event("customer.subscription.updated");
    const res = await POST(request(payload, await sign(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, handled: true });
  });

  it("acknowledges but ignores unhandled event types", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    const payload = event("charge.refunded");
    expect(await (await POST(request(payload, await sign(payload)))).json()).toEqual({
      received: true,
      handled: false,
    });
  });

  it("logs status and a code, never the payload or signature", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    const log = captureRequestLog();
    const payload = JSON.stringify({ id: "evt_QZ7X", object: "event", type: "customer.created", data: { object: {} } });
    await POST(request(payload, "t=1,v1=QZ7Xbadsig"));
    await POST(request(payload, sign(payload)));
    expect(log.entries()).toMatchObject([
      { route: "stripe_webhook", status: 400, code: "invalid_signature" },
      { route: "stripe_webhook", status: 200, code: "unhandled_event" },
    ]);
    expect(log.raw()).not.toContain("QZ7X");
    expect(log.raw()).not.toContain("customer.created");
  });
});
