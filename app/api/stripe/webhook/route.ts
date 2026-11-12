import { logged } from "@/lib/control-plane/log";
import { handleStripeWebhook } from "@/lib/control-plane/stripe";

export const runtime = "nodejs";

/** POST /api/stripe/webhook — inbound from Stripe only. Never touches file data. */
export function POST(req: Request): Promise<Response> {
  return logged("stripe_webhook", (note) => handleStripeWebhook(req, process.env.STRIPE_WEBHOOK_SECRET, note));
}
