import { describe, expect, it } from "vitest";
import {
  OFFER_DURATION_MS,
  formatCountdown,
  formatPrice,
  priceCents,
  remainingMs,
} from "@/lib/pricing";

const regular = { timerActive: false, exitClaimed: false };
const timer = { timerActive: true, exitClaimed: false };

describe("priceCents", () => {
  it("charges list price when the timer is off", () => {
    expect(priceCents("single", regular)).toBe(1_900); // $19
    expect(priceCents("annual", regular)).toBe(7_800); // $78
  });

  it("halves the price while the timer runs", () => {
    expect(priceCents("single", timer)).toBe(950); // 1,900 / 2
    expect(priceCents("annual", timer)).toBe(3_900); // 7,800 / 2
  });

  it("takes a further 25% off, floored to whole dollars, on the exit step", () => {
    const exit = { timerActive: true, exitClaimed: true };
    // annual: 3,900 x 0.75 = 2,925 -> $29.25 -> $29
    expect(priceCents("annual", exit)).toBe(2_900);
    // single: 950 x 0.75 = 712.5 -> $7.125 -> $7
    expect(priceCents("single", exit)).toBe(700);
  });

  it("applies the exit discount to list price after the timer expires", () => {
    const exit = { timerActive: false, exitClaimed: true };
    // annual: 7,800 x 0.75 = 5,850 -> $58.50 -> $58
    expect(priceCents("annual", exit)).toBe(5_800);
    // single: 1,900 x 0.75 = 1,425 -> $14.25 -> $14
    expect(priceCents("single", exit)).toBe(1_400);
  });
});

describe("formatPrice", () => {
  it("drops cents on whole dollars only", () => {
    expect(formatPrice(3_900)).toBe("$39");
    expect(formatPrice(950)).toBe("$9.50");
    expect(formatPrice(700)).toBe("$7");
  });
});

describe("countdown", () => {
  it("starts at 10:00 and ends at 00:00", () => {
    expect(OFFER_DURATION_MS).toBe(600_000);
    expect(formatCountdown(OFFER_DURATION_MS)).toBe("10:00");
    expect(formatCountdown(0)).toBe("00:00");
  });

  it("rounds partial seconds up", () => {
    expect(formatCountdown(599_001)).toBe("10:00");
    expect(formatCountdown(598_999)).toBe("09:59");
    expect(formatCountdown(1)).toBe("00:01");
  });

  it("never goes negative", () => {
    expect(remainingMs(1_000, 5_000)).toBe(0);
    expect(remainingMs(10_000, 4_000)).toBe(6_000);
    expect(formatCountdown(-500)).toBe("00:00");
  });
});
