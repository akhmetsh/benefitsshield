import { getStripe } from "@/lib/stripe";

/** Creates a Stripe Checkout session in TEST mode for the $39/year plan. */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe test mode is not configured" }, { status: 501 });
  }
  const origin = new URL(request.url).origin;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 3_900,
            recurring: { interval: "year" },
            product_data: { name: "BenefitsShield — 2027 plan year" },
          },
        },
      ],
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });
    if (!session.url) throw new Error("No checkout URL");
    return Response.json({ url: session.url });
  } catch {
    return Response.json({ error: "Could not start checkout" }, { status: 502 });
  }
}
