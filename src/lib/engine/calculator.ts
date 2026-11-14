/**
 * BenefitsShield deterministic engine.
 *
 * Rules for this file:
 *  - Pure functions only: no I/O, no Date.now(), no randomness, no network.
 *  - The LLM never does arithmetic. Every dollar shown in the UI comes from here.
 *  - Statutory constants live in IRS_2027 with their source.
 */
import {
  CalculationResultSchema,
  UserInputSchema,
  type AllowedAmounts,
  type CalculationResult,
  type CoverageTier,
  type HealthPlan,
  type PlanResult,
  type RetentionState,
  type TaxSavings,
  type TierTerms,
  type Usage,
  type UserInput,
} from "@/lib/schema";

// ---------------------------------------------------------------------------
// Statutory constants
// ---------------------------------------------------------------------------

/**
 * Sources:
 *  - HSA / HDHP: IRS Rev. Proc. 2026-24
 *  - Health FSA: IRS Rev. Proc. 2026-35
 *  - Social Security wage base: SSA announcement, Oct 14 2026
 */
export const IRS_2027 = {
  planYear: 2027,
  hsaLimit: { SELF_ONLY: 4_500, FAMILY: 9_000 },
  hsaCatchUpAge: 55,
  hsaCatchUp: 1_000,
  hdhpMinDeductible: { SELF_ONLY: 1_750, FAMILY: 3_500 },
  hdhpMaxOutOfPocket: { SELF_ONLY: 8_700, FAMILY: 17_400 },
  healthFsaLimit: 3_500,
  healthFsaCarryoverMax: 700,
  socialSecurityRate: 0.062,
  medicareRate: 0.0145,
  socialSecurityWageBase: 192_300,
} as const;

/**
 * States that tax HSA contributions (no state income tax savings on an HSA).
 * Health FSA contributions are still state-tax-free there.
 */
export const HSA_NON_CONFORMING_STATES: readonly string[] = ["CA", "NJ"];

/**
 * Assumed in-network allowed amounts when a plan has no copay for a category.
 * These are editable assumptions, not statutory values.
 */
export const DEFAULT_ALLOWED_AMOUNTS: AllowedAmounts = {
  primaryCare: 150,
  specialist: 250,
  rx: 40,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Rounds to whole cents. */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getTierTerms(plan: HealthPlan, tier: CoverageTier): TierTerms {
  return tier === "SELF_ONLY" ? plan.selfOnly : plan.family;
}

const ZERO_USAGE: Usage = {
  primaryCareVisits: 0,
  specialistVisits: 0,
  rxFills: 0,
  otherAllowedCharges: 0,
};

// ---------------------------------------------------------------------------
// Medical cost sharing
// ---------------------------------------------------------------------------

/**
 * What the member pays for care in a year.
 *
 *   copays       = sum(units x min(copay, allowed))        (categories with a copay)
 *   G            = other charges + sum(units x allowed)    (categories without one)
 *   OOP          = min(oopMax, copays + min(G, D) + max(0, G - D) x coinsurance)
 *
 * The family tier uses the family deductible and out-of-pocket maximum as a
 * single aggregate bucket.
 */
export function calculateOutOfPocket(
  plan: HealthPlan,
  tier: CoverageTier,
  usage: Usage,
  allowedAmounts: AllowedAmounts = DEFAULT_ALLOWED_AMOUNTS,
): number {
  const terms = getTierTerms(plan, tier);
  const categories = [
    ["primaryCare", usage.primaryCareVisits],
    ["specialist", usage.specialistVisits],
    ["rx", usage.rxFills],
  ] as const;

  let copayTotal = 0;
  let deductibleCharges = usage.otherAllowedCharges;

  for (const [category, units] of categories) {
    const allowed = allowedAmounts[category];
    const copay = plan.copays?.[category];
    if (copay === undefined) {
      deductibleCharges += units * allowed;
    } else {
      copayTotal += units * Math.min(copay, allowed);
    }
  }

  const paidTowardDeductible = Math.min(deductibleCharges, terms.deductible);
  const coinsurance =
    Math.max(0, deductibleCharges - terms.deductible) * plan.coinsuranceRate;

  return roundCents(
    Math.min(terms.oopMax, copayTotal + paidTowardDeductible + coinsurance),
  );
}

// ---------------------------------------------------------------------------
// HSA
// ---------------------------------------------------------------------------

/** True when the plan meets the IRS 2027 HDHP definition for the tier. */
export function isHsaQualified(plan: HealthPlan, tier: CoverageTier): boolean {
  if (plan.type !== "HDHP_HSA") return false;
  const terms = getTierTerms(plan, tier);
  return (
    terms.deductible >= IRS_2027.hdhpMinDeductible[tier] &&
    terms.oopMax <= IRS_2027.hdhpMaxOutOfPocket[tier]
  );
}

export interface HsaContribution {
  eligible: boolean;
  /** IRS limit for the tier, including the age 55+ catch-up. */
  limit: number;
  /** Employer money. Counts toward the limit. */
  employer: number;
  /** Employee payroll contribution after the limit is applied. */
  employee: number;
  /** How much of the planned contribution was cut by the limit. */
  trimmed: number;
}

/**
 * The IRS limit covers employer + employee money combined, so the employee's
 * room is the limit minus the employer contribution.
 */
export function calculateHsaContribution(
  plan: HealthPlan,
  input: Pick<UserInput, "coverageTier" | "age" | "plannedHsaContribution">,
): HsaContribution {
  if (!isHsaQualified(plan, input.coverageTier)) {
    return { eligible: false, limit: 0, employer: 0, employee: 0, trimmed: 0 };
  }
  const limit =
    IRS_2027.hsaLimit[input.coverageTier] +
    (input.age >= IRS_2027.hsaCatchUpAge ? IRS_2027.hsaCatchUp : 0);
  const employer = Math.min(
    getTierTerms(plan, input.coverageTier).employerHsaContribution,
    limit,
  );
  const room = Math.max(0, limit - employer);
  const employee = Math.min(input.plannedHsaContribution, room);
  return {
    eligible: true,
    limit,
    employer,
    employee,
    trimmed: roundCents(input.plannedHsaContribution - employee),
  };
}

// ---------------------------------------------------------------------------
// Taxes
// ---------------------------------------------------------------------------

export interface PayrollTaxRates {
  federal: number;
  state: number;
  fica: number;
}

/**
 * Marginal rates saved on each pre-tax payroll dollar (Section 125).
 *
 *   federal = marginal federal income tax rate
 *   state   = marginal state rate (0 for HSA dollars in CA and NJ)
 *   fica    = 7.65% up to the Social Security wage base, 1.45% above it
 */
export function getPayrollTaxRates(
  input: Pick<
    UserInput,
    "annualIncome" | "marginalFederalRate" | "marginalStateRate" | "state"
  >,
  account: "HSA" | "FSA",
): PayrollTaxRates {
  const stateTaxesAccount =
    account === "HSA" && HSA_NON_CONFORMING_STATES.includes(input.state);
  const fica =
    input.annualIncome > IRS_2027.socialSecurityWageBase
      ? IRS_2027.medicareRate
      : IRS_2027.socialSecurityRate + IRS_2027.medicareRate;
  return {
    federal: input.marginalFederalRate,
    state: stateTaxesAccount ? 0 : input.marginalStateRate,
    fica,
  };
}

/** savings = contribution x (federal + state + fica) */
export function calculateTaxSavings(
  contribution: number,
  rates: PayrollTaxRates,
): TaxSavings {
  const federal = roundCents(contribution * rates.federal);
  const state = roundCents(contribution * rates.state);
  const fica = roundCents(contribution * rates.fica);
  return { federal, state, fica, total: roundCents(federal + state + fica) };
}

function addTaxSavings(a: TaxSavings, b: TaxSavings): TaxSavings {
  return {
    federal: roundCents(a.federal + b.federal),
    state: roundCents(a.state + b.state),
    fica: roundCents(a.fica + b.fica),
    total: roundCents(a.total + b.total),
  };
}

// ---------------------------------------------------------------------------
// Health FSA
// ---------------------------------------------------------------------------

/** Election after the IRS limit. A general health FSA can't sit next to an HSA. */
export function calculateFsaElection(
  plannedContribution: number,
  hsaEligible: boolean,
): number {
  if (hsaEligible) return 0;
  return Math.min(plannedContribution, IRS_2027.healthFsaLimit);
}

/** FSA dollars lost: election - eligible spending - maximum carryover. */
export function calculateFsaForfeiture(
  election: number,
  eligibleSpending: number,
): number {
  return roundCents(
    Math.max(
      0,
      election - eligibleSpending - IRS_2027.healthFsaCarryoverMax,
    ),
  );
}

// ---------------------------------------------------------------------------
// Plan result
// ---------------------------------------------------------------------------

/**
 * Net annual cost of one plan:
 *
 *   net = premiums + out-of-pocket + FSA forfeiture
 *         - employer HSA contribution - tax savings
 *
 * The employee's own HSA contribution is not a cost: it stays their money.
 */
export function calculatePlanResult(
  plan: HealthPlan,
  input: UserInput,
): PlanResult {
  const tier = input.coverageTier;
  const terms = getTierTerms(plan, tier);
  const allowed = input.allowedAmounts ?? DEFAULT_ALLOWED_AMOUNTS;
  const warnings: string[] = [];

  const annualPremium = roundCents(terms.monthlyPremium * 12);
  const expectedOutOfPocket = calculateOutOfPocket(plan, tier, input.usage, allowed);
  const zeroUsageOutOfPocket = calculateOutOfPocket(plan, tier, ZERO_USAGE, allowed);
  const worstCaseOutOfPocket = terms.oopMax;

  const hsa = calculateHsaContribution(plan, input);
  const fsaElection = calculateFsaElection(
    input.plannedFsaContribution,
    hsa.eligible,
  );

  const taxSavings = addTaxSavings(
    calculateTaxSavings(hsa.employee, getPayrollTaxRates(input, "HSA")),
    calculateTaxSavings(fsaElection, getPayrollTaxRates(input, "FSA")),
  );

  const netCost = (outOfPocket: number) =>
    roundCents(
      annualPremium +
        outOfPocket +
        calculateFsaForfeiture(fsaElection, outOfPocket) -
        hsa.employer -
        taxSavings.total,
    );

  if (plan.type === "HDHP_HSA" && !hsa.eligible) {
    warnings.push(
      `${plan.name} does not meet the 2027 IRS rules for an HSA-qualified plan ` +
        `(deductible of at least $${IRS_2027.hdhpMinDeductible[tier].toLocaleString("en-US")} ` +
        `and out-of-pocket maximum of at most $${IRS_2027.hdhpMaxOutOfPocket[tier].toLocaleString("en-US")}), ` +
        `so no HSA savings are counted.`,
    );
  }
  if (hsa.trimmed > 0) {
    warnings.push(
      `Your planned HSA contribution was reduced by $${hsa.trimmed.toLocaleString("en-US")} ` +
        `to stay within the 2027 limit of $${hsa.limit.toLocaleString("en-US")}, ` +
        `which includes your employer's $${hsa.employer.toLocaleString("en-US")}.`,
    );
  }
  if (!hsa.eligible && input.plannedFsaContribution > IRS_2027.healthFsaLimit) {
    warnings.push(
      `Your planned FSA contribution was reduced to the 2027 limit of ` +
        `$${IRS_2027.healthFsaLimit.toLocaleString("en-US")}.`,
    );
  }
  if (hsa.eligible && HSA_NON_CONFORMING_STATES.includes(input.state)) {
    warnings.push(
      `${input.state} taxes HSA contributions, so no state income tax savings are counted on the HSA.`,
    );
  }
  const fsaForfeiture = calculateFsaForfeiture(fsaElection, expectedOutOfPocket);
  if (fsaForfeiture > 0) {
    warnings.push(
      `With your expected care you would lose $${fsaForfeiture.toLocaleString("en-US")} of FSA money ` +
        `(use-it-or-lose-it, after the $${IRS_2027.healthFsaCarryoverMax} carryover).`,
    );
  }

  return {
    planId: plan.id,
    planName: plan.name,
    planType: plan.type,
    hsaEligible: hsa.eligible,
    annualPremium,
    expectedOutOfPocket,
    worstCaseOutOfPocket,
    hsaContributionLimit: hsa.limit,
    employerHsaContribution: hsa.employer,
    employeeHsaContribution: hsa.employee,
    fsaElection,
    fsaForfeiture,
    taxSavings,
    netAnnualCost: netCost(expectedOutOfPocket),
    zeroUsageNetCost: netCost(zeroUsageOutOfPocket),
    worstCaseNetCost: netCost(worstCaseOutOfPocket),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Breakeven
// ---------------------------------------------------------------------------

const BREAKEVEN_SCAN_MAX = 200_000;
const BREAKEVEN_SCAN_STEP = 250;

/**
 * Finds the level of "other allowed charges" at which two plans cost the
 * same, holding everything else in the input fixed. Returns null when one
 * plan is cheaper at every level between $0 and $200,000.
 */
export function findBreakevenAllowedCharges(
  input: UserInput,
  planAId: string,
  planBId: string,
): number | null {
  const planA = input.plans.find((p) => p.id === planAId);
  const planB = input.plans.find((p) => p.id === planBId);
  if (!planA || !planB) return null;

  const difference = (charges: number) => {
    const scenario: UserInput = {
      ...input,
      usage: { ...input.usage, otherAllowedCharges: charges },
    };
    return (
      calculatePlanResult(planA, scenario).netAnnualCost -
      calculatePlanResult(planB, scenario).netAnnualCost
    );
  };

  let low = 0;
  let lowDiff = difference(low);
  if (lowDiff === 0) return 0;

  for (
    let high = BREAKEVEN_SCAN_STEP;
    high <= BREAKEVEN_SCAN_MAX;
    high += BREAKEVEN_SCAN_STEP
  ) {
    const highDiff = difference(high);
    if (highDiff === 0) return high;
    if (Math.sign(highDiff) !== Math.sign(lowDiff)) {
      let a = low;
      let b = high;
      while (b - a > 1) {
        const mid = (a + b) / 2;
        if (Math.sign(difference(mid)) === Math.sign(lowDiff)) a = mid;
        else b = mid;
      }
      return Math.round((a + b) / 2);
    }
    low = high;
    lowDiff = highDiff;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Comparison (main entry point)
// ---------------------------------------------------------------------------

/**
 * Validates the input, costs every plan and ranks them by expected net annual
 * cost (ties broken by the lower worst case). Throws a ZodError on bad input.
 */
export function comparePlans(rawInput: unknown): CalculationResult {
  const input = UserInputSchema.parse(rawInput);

  const plans = input.plans
    .map((plan) => calculatePlanResult(plan, input))
    .sort(
      (a, b) =>
        a.netAnnualCost - b.netAnnualCost ||
        a.worstCaseNetCost - b.worstCaseNetCost,
    );

  const best = plans[0];
  const nextBest = plans[1];
  const mostExpensive = plans[plans.length - 1];

  return CalculationResultSchema.parse({
    planYear: IRS_2027.planYear,
    coverageTier: input.coverageTier,
    plans,
    recommendedPlanId: best.planId,
    savingsVsNextBest: roundCents(nextBest.netAnnualCost - best.netAnnualCost),
    savingsVsMostExpensive: roundCents(
      mostExpensive.netAnnualCost - best.netAnnualCost,
    ),
    breakevenAllowedCharges: findBreakevenAllowedCharges(
      input,
      best.planId,
      nextBest.planId,
    ),
    warnings: plans.flatMap((p) => p.warnings),
  });
}

// ---------------------------------------------------------------------------
// Retention tracker (post-enrollment dashboard)
// ---------------------------------------------------------------------------

export interface TrackerSnapshot {
  /** "Today" after applying the demo fast-forward, as an ISO date. */
  asOfDate: string;
  deductible: number;
  deductibleMet: number;
  deductibleRemaining: number;
  deductibleProgress: number;
  oopMax: number;
  oopMet: number;
  oopRemaining: number;
  hsaContributedToDate: number;
  hsaRemainingToTarget: number;
  fsaElection: number;
  fsaSpent: number;
  fsaRemaining: number;
  /** FSA dollars that would be lost today, after the carryover. */
  fsaAtRisk: number;
  daysUntilFsaDeadline: number;
  alerts: string[];
}

const MS_PER_DAY = 86_400_000;

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Adds calendar months, clamping to the last day of the target month. */
export function addMonths(iso: string, months: number): string {
  const date = parseIsoDate(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the dashboard numbers from saved state. `today` is passed in so the
 * function stays pure; the "Fast-Forward" demo toggle only changes
 * state.demoMonthOffset.
 */
export function computeTrackerSnapshot(
  state: RetentionState,
  plan: HealthPlan,
  today: string,
): TrackerSnapshot {
  const terms = getTierTerms(plan, state.coverageTier);
  const asOfDate = addMonths(today, state.demoMonthOffset);
  const expenses = state.expenses.filter((e) => e.date <= asOfDate);

  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const oopMet = Math.min(terms.oopMax, sum(expenses.map((e) => e.amount)));
  const deductibleMet = Math.min(
    terms.deductible,
    sum(expenses.filter((e) => e.countsTowardDeductible).map((e) => e.amount)),
  );
  const fsaSpent = Math.min(
    state.fsaElection,
    sum(expenses.filter((e) => e.paidFrom === "FSA").map((e) => e.amount)),
  );
  const fsaRemaining = roundCents(state.fsaElection - fsaSpent);
  const fsaAtRisk = roundCents(
    Math.max(0, fsaRemaining - IRS_2027.healthFsaCarryoverMax),
  );
  const daysUntilFsaDeadline = Math.round(
    (parseIsoDate(state.fsaDeadline).getTime() -
      parseIsoDate(asOfDate).getTime()) /
      MS_PER_DAY,
  );
  const hsaRemainingToTarget = roundCents(
    Math.max(0, state.hsaAnnualTarget - state.hsaContributedToDate),
  );

  const alerts: string[] = [];
  if (fsaAtRisk > 0 && daysUntilFsaDeadline >= 0 && daysUntilFsaDeadline <= 90) {
    alerts.push(
      `Spend $${fsaAtRisk.toLocaleString("en-US")} of FSA money in the next ` +
        `${daysUntilFsaDeadline} days or lose it.`,
    );
  }
  if (fsaAtRisk > 0 && daysUntilFsaDeadline < 0) {
    alerts.push(
      `The FSA deadline has passed with $${fsaAtRisk.toLocaleString("en-US")} unspent.`,
    );
  }
  if (terms.deductible > 0 && deductibleMet >= terms.deductible) {
    alerts.push(
      "Deductible met: the plan now pays its share of every covered bill.",
    );
  }
  if (oopMet >= terms.oopMax && terms.oopMax > 0) {
    alerts.push(
      "Out-of-pocket maximum reached: covered in-network care is $0 for the rest of the year.",
    );
  }

  return {
    asOfDate,
    deductible: terms.deductible,
    deductibleMet: roundCents(deductibleMet),
    deductibleRemaining: roundCents(terms.deductible - deductibleMet),
    deductibleProgress:
      terms.deductible === 0
        ? 1
        : Math.round((deductibleMet / terms.deductible) * 1000) / 1000,
    oopMax: terms.oopMax,
    oopMet: roundCents(oopMet),
    oopRemaining: roundCents(terms.oopMax - oopMet),
    hsaContributedToDate: state.hsaContributedToDate,
    hsaRemainingToTarget,
    fsaElection: state.fsaElection,
    fsaSpent: roundCents(fsaSpent),
    fsaRemaining,
    fsaAtRisk,
    daysUntilFsaDeadline,
    alerts,
  };
}
