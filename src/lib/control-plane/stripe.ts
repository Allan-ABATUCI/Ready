import "server-only";
import Stripe from "stripe";
import { failWith, type LogNote } from "./log";

export const HANDLED_EVENTS = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

/**
 * Verify the Stripe signature over the raw body, then dispatch.
 * Uses the static verifier, so no Stripe API key is needed to receive webhooks.
 */
export async function handleStripeWebhook(
  req: Request,
  secret: string | undefined,
  note: LogNote = {},
): Promise<Response> {
  if (!secret) return failWith(note, "not_configured", 500);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return failWith(note, "missing_signature", 400);

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch {
    return failWith(note, "invalid_signature", 400);
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    note.code = "unhandled_event";
    return Response.json({ received: true, handled: false });
  }

  // TODO(billing): provision / revoke licenses. Store only Stripe IDs + license state.
  return Response.json({ received: true, handled: true });
}
