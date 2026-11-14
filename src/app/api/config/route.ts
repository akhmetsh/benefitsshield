import { connection } from "next/server";
import { stripeEnabled } from "@/lib/stripe";

/** Tells the paywall which payment options exist. Read at request time, not build time. */
export async function GET() {
  await connection();
  return Response.json({ stripe: stripeEnabled() }, { headers: { "cache-control": "no-store" } });
}
