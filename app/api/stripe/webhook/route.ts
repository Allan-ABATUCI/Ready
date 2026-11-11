import { handleStripeWebhook } from "@/lib/control-plane/stripe";

export const runtime = "nodejs";

/** POST /api/stripe/webhook — inbound from Stripe only. Never touches file data. */
export async function POST(req: Request): Promise<Response> {
  return handleStripeWebhook(req, process.env.STRIPE_WEBHOOK_SECRET);
}
