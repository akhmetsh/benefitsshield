import { describe, expect, it } from "vitest";
import { PRICE_CENTS, formatPrice, priceCents } from "@/lib/pricing";

describe("priceCents", () => {
  it("charges one fixed price per tier", () => {
    expect(priceCents("annual")).toBe(3_900); // $39/year core subscription
    expect(priceCents("single")).toBe(950); // $9.50 one-time single bill audit
  });

  it("has exactly two tiers", () => {
    expect(Object.keys(PRICE_CENTS).sort()).toEqual(["annual", "single"]);
  });
});

describe("formatPrice", () => {
  it("drops cents on whole dollars only", () => {
    expect(formatPrice(3_900)).toBe("$39");
    expect(formatPrice(950)).toBe("$9.50");
  });
});
