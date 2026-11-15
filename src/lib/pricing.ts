import type { PlanTier } from "@/lib/schema";

/**
 * Checkout pricing: one fixed USD price per tier, no timers or discounts.
 * Shared by the UI and the checkout route, so the server never trusts an
 * amount sent by the browser.
 *
 *   annual = $39/year core subscription (Annual Shield + Copilot)
 *   single = $9.50 one-time single bill audit (entry offer)
 */
export const PRICE_CENTS: Record<PlanTier, number> = {
  single: 950,
  annual: 3_900,
};

export function priceCents(tier: PlanTier): number {
  return PRICE_CENTS[tier];
}

/** "$39", "$9.50": whole dollars drop the cents. */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
