import { z } from "zod";
import { getStripe } from "@/lib/stripe";

const SessionIdSchema = z.string().regex(/^cs_test_[A-Za-z0-9_]{10,200}$/);

/** Confirms a returning Checkout session was really paid before the client unlocks. */
export async function GET(request: Request) {
  const stripe = getStripe();
  if (!stripe) return Response.json({ paid: false }, { status: 501 });
  const id = SessionIdSchema.safeParse(new URL(request.url).searchParams.get("session_id"));
  if (!id.success) return Response.json({ paid: false }, { status: 400 });
  try {
    const session = await stripe.checkout.sessions.retrieve(id.data);
    const paid = session.status === "complete" && session.payment_status === "paid";
    return Response.json({ paid }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ paid: false }, { status: 502 });
  }
}
