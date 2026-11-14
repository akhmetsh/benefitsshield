import Stripe from "stripe";

/** Stripe is only used when a TEST secret key is configured. Live keys are refused. */
export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"));
}

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith("sk_test_")) return null;
  return new Stripe(key);
}
