import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWED_AMOUNTS,
  IRS_2027,
  addMonths,
  calculateFsaElection,
  calculateFsaForfeiture,
  calculateHsaContribution,
  calculateOutOfPocket,
  calculatePlanResult,
  calculateTaxSavings,
  comparePlans,
  computeTrackerSnapshot,
  estimateMemberShare,
  findBreakevenAllowedCharges,
  getPayrollTaxRates,
  isHsaQualified,
  roundCents,
} from "@/lib/engine/calculator";
import { SAMPLE_PERSONAS } from "@/lib/personas";
import {
  CalculationResultSchema,
  HealthPlanSchema,
  PersonaSampleSchema,
  RetentionStateSchema,
  UserInputSchema,
  type HealthPlan,
  type RetentionState,
  type Usage,
  type UserInput,
} from "@/lib/schema";

// ---------------------------------------------------------------------------
// Fixtures with round numbers so every expected value can be checked by hand
// ---------------------------------------------------------------------------

const HDHP: HealthPlan = {
  id: "hdhp",
  name: "Test HDHP",
  type: "HDHP_HSA",
  selfOnly: { monthlyPremium: 100, deductible: 2_000, oopMax: 5_000, employerHsaContribution: 500 },
  family: { monthlyPremium: 300, deductible: 4_000, oopMax: 10_000, employerHsaContribution: 1_000 },
  coinsuranceRate: 0.2,
};

const PPO: HealthPlan = {
  id: "ppo",
  name: "Test PPO",
  type: "PPO",
  selfOnly: { monthlyPremium: 250, deductible: 500, oopMax: 3_000, employerHsaContribution: 0 },
  family: { monthlyPremium: 700, deductible: 1_000, oopMax: 6_000, employerHsaContribution: 0 },
  coinsuranceRate: 0.2,
  copays: { primaryCare: 25, specialist: 50, rx: 10 },
};

const NO_CARE: Usage = { primaryCareVisits: 0, specialistVisits: 0, rxFills: 0, otherAllowedCharges: 0 };
const other = (otherAllowedCharges: number): Usage => ({ ...NO_CARE, otherAllowedCharges });
const VISITS: Usage = { primaryCareVisits: 2, specialistVisits: 1, rxFills: 3, otherAllowedCharges: 0 };

const BASE: UserInput = {
  coverageTier: "SELF_ONLY",
  filingStatus: "SINGLE",
  age: 35,
  annualIncome: 100_000,
  marginalFederalRate: 0.22,
  state: "TX",
  marginalStateRate: 0,
  usage: NO_CARE,
  plannedHsaContribution: 4_000,
  plannedFsaContribution: 0,
  plans: [HDHP, PPO],
};

const byId = (result: ReturnType<typeof comparePlans>, id: string) => {
  const plan = result.plans.find((p) => p.planId === id);
  if (!plan) throw new Error(`plan ${id} missing`);
  return plan;
};

/** Money comparison with a tolerance of half a cent's rounding. */
const expectMoney = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.011);

// ---------------------------------------------------------------------------

describe("IRS 2027 constants", () => {
  it("matches Rev. Proc. 2026-24 (HSA / HDHP)", () => {
    expect(IRS_2027.hsaLimit).toEqual({ SELF_ONLY: 4_500, FAMILY: 9_000 });
    expect(IRS_2027.hsaCatchUp).toBe(1_000);
    expect(IRS_2027.hdhpMinDeductible).toEqual({ SELF_ONLY: 1_750, FAMILY: 3_500 });
    expect(IRS_2027.hdhpMaxOutOfPocket).toEqual({ SELF_ONLY: 8_700, FAMILY: 17_400 });
  });

  it("matches Rev. Proc. 2026-35 (health FSA) and the SSA wage base", () => {
    expect(IRS_2027.healthFsaLimit).toBe(3_500);
    expect(IRS_2027.healthFsaCarryoverMax).toBe(700);
    expect(IRS_2027.socialSecurityWageBase).toBe(192_300);
    expect(IRS_2027.socialSecurityRate + IRS_2027.medicareRate).toBeCloseTo(0.0765, 10);
  });
});

describe("roundCents", () => {
  it("rounds to whole cents", () => {
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(1111.875)).toBe(1111.88);
    expect(roundCents(2.004)).toBe(2);
  });
});

describe("calculateOutOfPocket", () => {
  it("is $0 with zero medical usage", () => {
    expect(calculateOutOfPocket(HDHP, "SELF_ONLY", NO_CARE)).toBe(0);
    expect(calculateOutOfPocket(PPO, "SELF_ONLY", NO_CARE)).toBe(0);
    expect(calculateOutOfPocket(HDHP, "FAMILY", NO_CARE)).toBe(0);
  });

  it("charges the full amount below the deductible", () => {
    expect(calculateOutOfPocket(HDHP, "SELF_ONLY", other(1_500))).toBe(1_500);
  });

  it("adds coinsurance above the deductible", () => {
    // 2,000 deductible + 20% x 1,000
    expect(calculateOutOfPocket(HDHP, "SELF_ONLY", other(3_000))).toBe(2_200);
  });

  it("stops at the out-of-pocket maximum", () => {
    expect(calculateOutOfPocket(HDHP, "SELF_ONLY", other(100_000))).toBe(5_000);
    expect(calculateOutOfPocket(PPO, "SELF_ONLY", other(100_000))).toBe(3_000);
  });

  it("sends visits through the deductible when the plan has no copays", () => {
    // 2 x 150 + 1 x 250 + 3 x 40
    expect(calculateOutOfPocket(HDHP, "SELF_ONLY", VISITS)).toBe(670);
  });

  it("charges copays that bypass the deductible", () => {
    // 2 x 25 + 1 x 50 + 3 x 10
    expect(calculateOutOfPocket(PPO, "SELF_ONLY", VISITS)).toBe(130);
    // 130 copays + 500 deductible + 20% x 1,000
    expect(
      calculateOutOfPocket(PPO, "SELF_ONLY", { ...VISITS, otherAllowedCharges: 1_500 }),
    ).toBe(830);
  });

  it("counts copays toward the out-of-pocket maximum", () => {
    const heavy: Usage = { primaryCareVisits: 100, specialistVisits: 100, rxFills: 0, otherAllowedCharges: 0 };
    // 100 x 25 + 100 x 50 = 7,500, capped at 3,000
    expect(calculateOutOfPocket(PPO, "SELF_ONLY", heavy)).toBe(3_000);
  });

  it("uses the family deductible and maximum for family coverage", () => {
    // 4,000 deductible + 20% x 2,000
    expect(calculateOutOfPocket(HDHP, "FAMILY", other(6_000))).toBe(4_400);
    expect(calculateOutOfPocket(HDHP, "FAMILY", other(100_000))).toBe(10_000);
    // 1,000 deductible + 20% x 5,000
    expect(calculateOutOfPocket(PPO, "FAMILY", other(6_000))).toBe(2_000);
  });

  it("accepts custom allowed amounts and never charges a copay above them", () => {
    expect(
      calculateOutOfPocket(HDHP, "SELF_ONLY", { ...NO_CARE, primaryCareVisits: 2 }, {
        ...DEFAULT_ALLOWED_AMOUNTS,
        primaryCare: 200,
      }),
    ).toBe(400);
    expect(
      calculateOutOfPocket(PPO, "SELF_ONLY", { ...NO_CARE, rxFills: 3 }, {
        ...DEFAULT_ALLOWED_AMOUNTS,
        rx: 5,
      }),
    ).toBe(15);
  });
});

describe("HSA rules", () => {
  it("recognises an HSA-qualified HDHP at the exact IRS thresholds", () => {
    const edge: HealthPlan = {
      ...HDHP,
      selfOnly: { ...HDHP.selfOnly, deductible: 1_750, oopMax: 8_700 },
    };
    expect(isHsaQualified(edge, "SELF_ONLY")).toBe(true);
    expect(isHsaQualified(HDHP, "FAMILY")).toBe(true);
    expect(isHsaQualified(PPO, "SELF_ONLY")).toBe(false);
  });

  it("rejects an HDHP below the minimum deductible or above the maximum out-of-pocket", () => {
    const lowDeductible: HealthPlan = { ...HDHP, selfOnly: { ...HDHP.selfOnly, deductible: 1_500 } };
    const highOop: HealthPlan = { ...HDHP, selfOnly: { ...HDHP.selfOnly, oopMax: 9_000 } };
    expect(isHsaQualified(lowDeductible, "SELF_ONLY")).toBe(false);
    expect(isHsaQualified(highOop, "SELF_ONLY")).toBe(false);
  });

  it("subtracts the employer contribution from the employee's room (self-only)", () => {
    const within = calculateHsaContribution(HDHP, { coverageTier: "SELF_ONLY", age: 35, plannedHsaContribution: 4_000 });
    expect(within).toEqual({ eligible: true, limit: 4_500, employer: 500, employee: 4_000, trimmed: 0 });

    const over = calculateHsaContribution(HDHP, { coverageTier: "SELF_ONLY", age: 35, plannedHsaContribution: 4_500 });
    expect(over.employee).toBe(4_000);
    expect(over.trimmed).toBe(500);
  });

  it("uses the $9,000 family limit", () => {
    const hsa = calculateHsaContribution(HDHP, { coverageTier: "FAMILY", age: 35, plannedHsaContribution: 9_000 });
    expect(hsa.limit).toBe(9_000);
    expect(hsa.employer).toBe(1_000);
    expect(hsa.employee).toBe(8_000);
  });

  it("adds the $1,000 catch-up at age 55", () => {
    const hsa = calculateHsaContribution(HDHP, { coverageTier: "SELF_ONLY", age: 55, plannedHsaContribution: 6_000 });
    expect(hsa.limit).toBe(5_500);
    expect(hsa.employee).toBe(5_000);
    const younger = calculateHsaContribution(HDHP, { coverageTier: "SELF_ONLY", age: 54, plannedHsaContribution: 6_000 });
    expect(younger.limit).toBe(4_500);
  });

  it("gives no HSA on a PPO", () => {
    const hsa = calculateHsaContribution(PPO, { coverageTier: "SELF_ONLY", age: 35, plannedHsaContribution: 4_000 });
    expect(hsa).toEqual({ eligible: false, limit: 0, employer: 0, employee: 0, trimmed: 0 });
  });
});

describe("tax savings", () => {
  it("combines federal, state and FICA (7.65%)", () => {
    const rates = getPayrollTaxRates(BASE, "HSA");
    expect(rates.federal).toBe(0.22);
    expect(rates.state).toBe(0);
    expect(rates.fica).toBeCloseTo(0.0765, 10);
    expect(calculateTaxSavings(4_000, rates)).toEqual({ federal: 880, state: 0, fica: 306, total: 1_186 });
  });

  it("adds state income tax savings in a conforming state", () => {
    const il = { ...BASE, state: "IL", marginalStateRate: 0.0495 };
    expect(calculateTaxSavings(4_000, getPayrollTaxRates(il, "HSA"))).toEqual({
      federal: 880,
      state: 198,
      fica: 306,
      total: 1_384,
    });
  });

  it("gives no state savings on an HSA in CA and NJ, but keeps them on an FSA", () => {
    for (const state of ["CA", "NJ"]) {
      const input = { ...BASE, state, marginalStateRate: 0.093 };
      expect(getPayrollTaxRates(input, "HSA").state).toBe(0);
      expect(getPayrollTaxRates(input, "FSA").state).toBe(0.093);
      expectMoney(calculateTaxSavings(1_000, getPayrollTaxRates(input, "FSA")).state, 93);
    }
  });

  it("drops Social Security above the wage base (Medicare 1.45% only)", () => {
    const high = { ...BASE, annualIncome: 250_000 };
    expect(getPayrollTaxRates(high, "HSA").fica).toBe(0.0145);
    expect(calculateTaxSavings(4_000, getPayrollTaxRates(high, "HSA")).fica).toBe(58);
    const atBase = { ...BASE, annualIncome: 192_300 };
    expect(getPayrollTaxRates(atBase, "HSA").fica).toBeCloseTo(0.0765, 10);
  });
});

describe("health FSA", () => {
  it("caps the election at $3,500 and blocks it next to an HSA", () => {
    expect(calculateFsaElection(5_000, false)).toBe(3_500);
    expect(calculateFsaElection(1_200, false)).toBe(1_200);
    expect(calculateFsaElection(1_000, true)).toBe(0);
  });

  it("forfeits unspent money beyond the $700 carryover", () => {
    expect(calculateFsaForfeiture(2_000, 500)).toBe(800);
    expect(calculateFsaForfeiture(2_000, 1_500)).toBe(0);
    expect(calculateFsaForfeiture(700, 0)).toBe(0);
  });
});

describe("comparePlans — single filer, zero medical usage", () => {
  const result = comparePlans(BASE);
  const hdhp = byId(result, "hdhp");
  const ppo = byId(result, "ppo");

  it("costs the HDHP: premiums - employer money - tax savings", () => {
    expect(hdhp.annualPremium).toBe(1_200);
    expect(hdhp.expectedOutOfPocket).toBe(0);
    expect(hdhp.employerHsaContribution).toBe(500);
    expect(hdhp.employeeHsaContribution).toBe(4_000);
    expect(hdhp.taxSavings).toEqual({ federal: 880, state: 0, fica: 306, total: 1_186 });
    // 1,200 + 0 - 500 - 1,186
    expect(hdhp.netAnnualCost).toBe(-486);
    expect(hdhp.zeroUsageNetCost).toBe(-486);
  });

  it("costs the PPO: premiums only", () => {
    expect(ppo.annualPremium).toBe(3_000);
    expect(ppo.taxSavings.total).toBe(0);
    expect(ppo.netAnnualCost).toBe(3_000);
  });

  it("reports worst-case exposure at the out-of-pocket maximum", () => {
    expect(hdhp.worstCaseOutOfPocket).toBe(5_000);
    // 1,200 + 5,000 - 500 - 1,186
    expect(hdhp.worstCaseNetCost).toBe(4_514);
    expect(ppo.worstCaseOutOfPocket).toBe(3_000);
    expect(ppo.worstCaseNetCost).toBe(6_000);
  });

  it("recommends the cheaper plan and reports the savings", () => {
    expect(result.recommendedPlanId).toBe("hdhp");
    expect(result.plans[0].planId).toBe("hdhp");
    expect(result.savingsVsNextBest).toBe(3_486);
    expect(result.savingsVsMostExpensive).toBe(3_486);
    expect(result.planYear).toBe(2027);
  });

  it("returns a result that satisfies the schema", () => {
    expect(CalculationResultSchema.safeParse(result).success).toBe(true);
  });
});

describe("comparePlans — maximum out-of-pocket scenario", () => {
  const result = comparePlans({ ...BASE, usage: other(500_000) });

  it("caps expected cost at the worst case for each plan", () => {
    const hdhp = byId(result, "hdhp");
    const ppo = byId(result, "ppo");
    expect(hdhp.expectedOutOfPocket).toBe(5_000);
    expect(hdhp.netAnnualCost).toBe(4_514);
    expect(hdhp.netAnnualCost).toBe(hdhp.worstCaseNetCost);
    expect(ppo.expectedOutOfPocket).toBe(3_000);
    expect(ppo.netAnnualCost).toBe(6_000);
    expect(ppo.netAnnualCost).toBe(ppo.worstCaseNetCost);
  });
});

describe("comparePlans — family coverage, married filing jointly", () => {
  const result = comparePlans({
    ...BASE,
    coverageTier: "FAMILY",
    filingStatus: "MARRIED_FILING_JOINTLY",
    plannedHsaContribution: 8_000,
    usage: other(6_000),
  });

  it("uses family premiums, deductibles and the $9,000 HSA limit", () => {
    const hdhp = byId(result, "hdhp");
    expect(hdhp.annualPremium).toBe(3_600);
    expect(hdhp.expectedOutOfPocket).toBe(4_400);
    expect(hdhp.hsaContributionLimit).toBe(9_000);
    expect(hdhp.employeeHsaContribution).toBe(8_000);
    expect(hdhp.taxSavings.total).toBe(2_372); // 8,000 x 29.65%
    // 3,600 + 4,400 - 1,000 - 2,372
    expect(hdhp.netAnnualCost).toBe(4_628);
    expect(hdhp.worstCaseNetCost).toBe(10_228);

    const ppo = byId(result, "ppo");
    expect(ppo.annualPremium).toBe(8_400);
    expect(ppo.expectedOutOfPocket).toBe(2_000);
    expect(ppo.netAnnualCost).toBe(10_400);
    expect(ppo.worstCaseNetCost).toBe(14_400);

    expect(result.savingsVsNextBest).toBe(5_772);
  });

  it("trims a planned contribution above the family limit and says so", () => {
    const trimmed = comparePlans({
      ...BASE,
      coverageTier: "FAMILY",
      filingStatus: "MARRIED_FILING_JOINTLY",
      plannedHsaContribution: 9_000,
    });
    const hdhp = byId(trimmed, "hdhp");
    expect(hdhp.employeeHsaContribution).toBe(8_000);
    expect(hdhp.warnings.some((w) => w.includes("reduced by $1,000"))).toBe(true);
  });
});

describe("comparePlans — FSA, state rules and warnings", () => {
  it("counts FSA tax savings and forfeiture on the PPO only", () => {
    const result = comparePlans({ ...BASE, plannedFsaContribution: 2_000 });
    const ppo = byId(result, "ppo");
    expect(ppo.fsaElection).toBe(2_000);
    expect(ppo.taxSavings.total).toBe(593); // 2,000 x 29.65%
    expect(ppo.fsaForfeiture).toBe(1_300); // 2,000 - 0 - 700
    expect(ppo.netAnnualCost).toBe(3_707); // 3,000 + 1,300 - 593
    expect(ppo.warnings.some((w) => w.includes("lose $1,300"))).toBe(true);

    const hdhp = byId(result, "hdhp");
    expect(hdhp.fsaElection).toBe(0);
    expect(hdhp.netAnnualCost).toBe(-486);
  });

  it("removes state HSA savings in California and warns", () => {
    const result = comparePlans({ ...BASE, state: "CA", marginalStateRate: 0.093 });
    const hdhp = byId(result, "hdhp");
    expect(hdhp.taxSavings.state).toBe(0);
    expect(hdhp.taxSavings.total).toBe(1_186);
    expect(hdhp.warnings.some((w) => w.startsWith("CA taxes HSA"))).toBe(true);
  });

  it("gives no HSA benefit to an HDHP that fails the IRS thresholds", () => {
    const notQualified: HealthPlan = {
      ...HDHP,
      selfOnly: { ...HDHP.selfOnly, deductible: 1_500 },
    };
    const result = comparePlans({ ...BASE, plans: [notQualified, PPO] });
    const hdhp = byId(result, "hdhp");
    expect(hdhp.hsaEligible).toBe(false);
    expect(hdhp.employerHsaContribution).toBe(0);
    expect(hdhp.taxSavings.total).toBe(0);
    expect(hdhp.netAnnualCost).toBe(1_200);
    expect(result.warnings.some((w) => w.includes("does not meet the 2027 IRS rules"))).toBe(true);
  });

  it("changes the output when the input changes (nothing is hardcoded)", () => {
    const a = comparePlans({ ...BASE, usage: other(1_000) });
    const b = comparePlans({ ...BASE, usage: other(1_001) });
    expect(byId(b, "hdhp").netAnnualCost - byId(a, "hdhp").netAnnualCost).toBe(1);
    const c = comparePlans({ ...BASE, marginalFederalRate: 0.24 });
    expect(byId(c, "hdhp").taxSavings.federal).toBe(960);
  });

  it("is deterministic", () => {
    expect(comparePlans(BASE)).toEqual(comparePlans(BASE));
  });

  it("ranks up to four plans cheapest first", () => {
    const epo: HealthPlan = { ...PPO, id: "epo", name: "Test EPO", selfOnly: { ...PPO.selfOnly, monthlyPremium: 180 } };
    const result = comparePlans({ ...BASE, plans: [PPO, epo, HDHP] });
    expect(result.plans.map((p) => p.planId)).toEqual(["hdhp", "epo", "ppo"]);
    expect(result.savingsVsNextBest).toBe(2_646); // 2,160 - (-486)
    expect(result.savingsVsMostExpensive).toBe(3_486);
  });
});

describe("breakeven", () => {
  it("is null when one plan wins at every level of care", () => {
    expect(findBreakevenAllowedCharges(BASE, "hdhp", "ppo")).toBeNull();
    expect(comparePlans(BASE).breakevenAllowedCharges).toBeNull();
  });

  it("finds the crossover point between two plans", () => {
    const a: HealthPlan = {
      id: "a",
      name: "Plan A",
      type: "HDHP_HSA",
      selfOnly: { monthlyPremium: 200, deductible: 3_000, oopMax: 6_000, employerHsaContribution: 0 },
      family: { monthlyPremium: 500, deductible: 6_000, oopMax: 12_000, employerHsaContribution: 0 },
      coinsuranceRate: 0.2,
    };
    const b: HealthPlan = {
      id: "b",
      name: "Plan B",
      type: "PPO",
      selfOnly: { monthlyPremium: 300, deductible: 0, oopMax: 6_000, employerHsaContribution: 0 },
      family: { monthlyPremium: 800, deductible: 0, oopMax: 12_000, employerHsaContribution: 0 },
      coinsuranceRate: 0.2,
    };
    const input: UserInput = { ...BASE, plannedHsaContribution: 0, plans: [a, b] };
    // 2,400 + G = 3,600 + 0.2 G  ->  G = 1,500
    const breakeven = findBreakevenAllowedCharges(input, "a", "b");
    expect(breakeven).not.toBeNull();
    expect(Math.abs((breakeven as number) - 1_500)).toBeLessThanOrEqual(1);
    expect(comparePlans(input).breakevenAllowedCharges).toBe(breakeven);
  });

  it("returns null for an unknown plan id", () => {
    expect(findBreakevenAllowedCharges(BASE, "hdhp", "nope")).toBeNull();
  });
});

describe("sample personas", () => {
  it("all validate against the schema and are flagged as samples", () => {
    expect(SAMPLE_PERSONAS.map((p) => p.id)).toEqual(["maya", "marcus", "elena"]);
    for (const persona of SAMPLE_PERSONAS) {
      expect(PersonaSampleSchema.safeParse(persona).success).toBe(true);
      expect(persona.isSample).toBe(true);
    }
  });

  it("Maya (single, TX, $95k): HDHP beats PPO by $2,235.63", () => {
    const result = comparePlans(SAMPLE_PERSONAS[0].input);
    const hdhp = byId(result, "hdhp");
    const ppo = byId(result, "ppo");
    expect(hdhp.expectedOutOfPocket).toBe(2_108); // 2,000 + 20% x 540
    expectMoney(hdhp.taxSavings.total, 1_111.88); // 3,750 x 29.65%
    expectMoney(hdhp.netAnnualCost, 1_266.12);
    expect(ppo.expectedOutOfPocket).toBe(1_130); // 290 copays + 750 + 20% x 450
    expectMoney(ppo.netAnnualCost, 3_501.75);
    expect(result.recommendedPlanId).toBe("hdhp");
    expectMoney(result.savingsVsNextBest, 2_235.63);
  });

  it("Marcus (single, IL, low usage): HDHP beats PPO by $2,817", () => {
    const result = comparePlans(SAMPLE_PERSONAS[1].input);
    expectMoney(byId(result, "hdhp").netAnnualCost, -272); // 1,020 + 150 - 750 - 692
    expectMoney(byId(result, "ppo").netAnnualCost, 2_545);
    expectMoney(result.savingsVsNextBest, 2_817);
  });

  it("Elena (family, WA, heavy usage): PPO beats HDHP by $3,496", () => {
    const result = comparePlans(SAMPLE_PERSONAS[2].input);
    const hdhp = byId(result, "hdhp");
    const ppo = byId(result, "ppo");
    expect(hdhp.expectedOutOfPocket).toBe(8_832); // 6,000 + 30% x 9,440
    expectMoney(hdhp.netAnnualCost, 12_848.25);
    expect(ppo.expectedOutOfPocket).toBe(3_070); // 1,220 copays + 1,000 + 10% x 8,500
    expectMoney(ppo.netAnnualCost, 9_352.25);
    expect(result.recommendedPlanId).toBe("ppo");
    expectMoney(result.savingsVsNextBest, 3_496);
  });
});

describe("input validation", () => {
  it("rejects fewer than two plans, duplicate ids and bad state codes", () => {
    expect(() => comparePlans({ ...BASE, plans: [HDHP] })).toThrow();
    expect(() => comparePlans({ ...BASE, plans: [HDHP, { ...PPO, id: "hdhp" }] })).toThrow();
    expect(() => comparePlans({ ...BASE, state: "Texas" })).toThrow();
    expect(() => comparePlans({ ...BASE, marginalFederalRate: 0.5 })).toThrow();
    expect(() => comparePlans({ ...BASE, usage: other(-1) })).toThrow();
    expect(() => comparePlans(null)).toThrow();
  });

  it("rejects a plan whose out-of-pocket maximum is below its deductible", () => {
    const broken = { ...PPO, selfOnly: { ...PPO.selfOnly, deductible: 4_000, oopMax: 3_000 } };
    expect(HealthPlanSchema.safeParse(broken).success).toBe(false);
  });

  it("defaults the employer HSA contribution to 0", () => {
    const parsed = HealthPlanSchema.parse({
      id: "x",
      name: "X",
      type: "PPO",
      selfOnly: { monthlyPremium: 1, deductible: 1, oopMax: 1 },
      family: { monthlyPremium: 1, deductible: 1, oopMax: 1 },
      coinsuranceRate: 0,
    });
    expect(parsed.selfOnly.employerHsaContribution).toBe(0);
    expect(UserInputSchema.safeParse(BASE).success).toBe(true);
  });

  it("does not mutate its input", () => {
    const frozen = JSON.parse(JSON.stringify(BASE));
    calculatePlanResult(HDHP, BASE);
    comparePlans(BASE);
    expect(BASE).toEqual(frozen);
  });
});

describe("retention tracker", () => {
  const state: RetentionState = RetentionStateSchema.parse({
    version: 1,
    unlocked: true,
    planYear: 2027,
    selectedPlanId: "ppo",
    coverageTier: "SELF_ONLY",
    enrolledOn: "2026-11-20",
    expenses: [
      { id: "1", date: "2027-02-10", description: "Urgent care", amount: 300, paidFrom: "FSA" },
      { id: "2", date: "2027-05-01", description: "MRI", amount: 400, paidFrom: "POCKET" },
      { id: "3", date: "2027-08-01", description: "Specialist copay", amount: 50, paidFrom: "FSA", countsTowardDeductible: false },
    ],
    hsaContributedToDate: 0,
    hsaAnnualTarget: 0,
    fsaElection: 2_000,
    fsaDeadline: "2027-12-31",
  });

  it("defaults the demo offset to 0", () => {
    expect(state.demoMonthOffset).toBe(0);
  });

  it("shows progress as of today", () => {
    const snap = computeTrackerSnapshot(state, PPO, "2027-03-01");
    expect(snap.asOfDate).toBe("2027-03-01");
    expect(snap.deductibleMet).toBe(300);
    expect(snap.deductibleRemaining).toBe(200);
    expect(snap.deductibleProgress).toBe(0.6);
    expect(snap.oopMet).toBe(300);
    expect(snap.fsaSpent).toBe(300);
    expect(snap.fsaRemaining).toBe(1_700);
    expect(snap.fsaAtRisk).toBe(1_000);
    expect(snap.daysUntilFsaDeadline).toBe(305);
    expect(snap.alerts).toEqual([]);
  });

  it("fast-forwards with the demo offset and raises alerts", () => {
    const snap = computeTrackerSnapshot({ ...state, demoMonthOffset: 9 }, PPO, "2027-03-01");
    expect(snap.asOfDate).toBe("2027-12-01");
    expect(snap.deductibleMet).toBe(500);
    expect(snap.deductibleProgress).toBe(1);
    expect(snap.oopMet).toBe(750);
    expect(snap.fsaSpent).toBe(350);
    expect(snap.fsaAtRisk).toBe(950);
    expect(snap.daysUntilFsaDeadline).toBe(30);
    expect(snap.alerts.some((a) => a.includes("Spend $950"))).toBe(true);
    expect(snap.alerts.some((a) => a.startsWith("Deductible met"))).toBe(true);
  });

  it("tracks HSA pacing against the annual target", () => {
    const snap = computeTrackerSnapshot(
      { ...state, selectedPlanId: "hdhp", fsaElection: 0, hsaContributedToDate: 1_500, hsaAnnualTarget: 4_500 },
      HDHP,
      "2027-03-01",
    );
    expect(snap.hsaRemainingToTarget).toBe(3_000);
    expect(snap.fsaAtRisk).toBe(0);
  });

  it("adds months and clamps to the end of the month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2027-03-15", 6)).toBe("2027-09-15");
    expect(addMonths("2027-11-15", 2)).toBe("2028-01-15");
  });
});

describe("estimateMemberShare", () => {
  // HDHP-like terms: 20% coinsurance. Deductible has $1,500 left, OOP has $4,000 left.
  const room = { deductibleRemaining: 1_500, oopRemaining: 4_000 };
  const plan = { coinsuranceRate: 0.2 };

  it("charges the full bill while it fits inside the remaining deductible", () => {
    // bill $1,000 <= $1,500 left -> member pays $1,000
    expect(estimateMemberShare(plan, room, 1_000)).toBe(1_000);
  });

  it("switches to coinsurance after the deductible", () => {
    // $1,500 + (2,000 - 1,500) x 0.2 = 1,500 + 100 = 1,600
    expect(estimateMemberShare(plan, room, 2_000)).toBe(1_600);
  });

  it("caps the member share at the remaining out-of-pocket room", () => {
    // 1,500 + (50,000 - 1,500) x 0.2 = 11,200 -> capped at 4,000
    expect(estimateMemberShare(plan, room, 50_000)).toBe(4_000);
  });

  it("charges only coinsurance once the deductible is met", () => {
    // deductible met: 1,000 x 0.2 = 200
    expect(
      estimateMemberShare(plan, { deductibleRemaining: 0, oopRemaining: 3_000 }, 1_000),
    ).toBe(200);
  });

  it("charges nothing once the out-of-pocket maximum is reached", () => {
    expect(
      estimateMemberShare(plan, { deductibleRemaining: 0, oopRemaining: 0 }, 1_000),
    ).toBe(0);
  });
});
