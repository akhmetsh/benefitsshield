import type { PlanTier } from "@/lib/schema";

/**
 * Checkout pricing. Pure and shared by the modal and the checkout route, so
 * the server never trusts an amount sent by the browser.
 *
 *   regular  = list price
 *   timer    = 50% off while the 10-minute offer runs
 *   exit     = a further 25% off the current price, rounded down to whole dollars
 */

export const REGULAR_PRICE_CENTS: Record<PlanTier, number> = {
  single: 1_900,
  annual: 7_800,
};

export const OFFER_DURATION_MS = 10 * 60 * 1_000;
export const TIMER_DISCOUNT_PERCENT = 50;
export const EXIT_EXTRA_DISCOUNT_PERCENT = 25;

export interface PriceContext {
  /** True while the 10-minute 50% offer is running. */
  timerActive: boolean;
  /** True once the exit-intent extra 25% has been claimed. */
  exitClaimed: boolean;
}

export function priceCents(tier: PlanTier, ctx: PriceContext): number {
  let cents = REGULAR_PRICE_CENTS[tier];
  if (ctx.timerActive) cents = Math.round((cents * (100 - TIMER_DISCOUNT_PERCENT)) / 100);
  if (ctx.exitClaimed) {
    // Extra 25% off, floored to whole dollars: 3,900 -> 2,925 -> 2,900.
    cents = Math.floor((cents * (100 - EXIT_EXTRA_DISCOUNT_PERCENT)) / 10_000) * 100;
  }
  return cents;
}

/** "$39", "$9.50": whole dollars drop the cents. */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** Milliseconds left on the offer; never negative. */
export function remainingMs(deadline: number, now: number): number {
  return Math.max(0, deadline - now);
}

/** "10:00", "09:59", "00:00". Seconds round up so 00:00 only shows at zero. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
