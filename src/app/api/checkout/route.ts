import { z } from "zod";
import { priceCents } from "@/lib/pricing";
import { PlanTierSchema } from "@/lib/schema";
import { getStripe } from "@/lib/stripe";

const BodySchema = z.object({
  tier: PlanTierSchema,
});

const PRODUCT_NAMES = {
  single: "BenefitsShield — Single Bill Overcharge Audit",
  annual: "BenefitsShield — 2027 Overcharge Shield + Copilot",
} as const;

/**
 * Creates a Stripe Checkout session in TEST mode. The amount comes from our
 * own price table, never from the browser. The user's email is not sent here.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe test mode is not configured" }, { status: 501 });
  }
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Invalid checkout request" }, { status: 400 });
  }
  const { tier } = body.data;
  const amount = priceCents(tier);
  const origin = new URL(request.url).origin;
  const metadata = { tier };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: tier === "annual" ? "subscription" : "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount,
            ...(tier === "annual" ? { recurring: { interval: "year" as const } } : {}),
            product_data: { name: PRODUCT_NAMES[tier] },
          },
        },
      ],
      metadata,
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });
    if (!session.url) throw new Error("No checkout URL");
    return Response.json({ url: session.url, amountCents: amount });
  } catch {
    return Response.json({ error: "Could not start checkout" }, { status: 502 });
  }
}
