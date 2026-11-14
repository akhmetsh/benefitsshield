import { z } from "zod";

/**
 * BenefitsShield data contract.
 * Every value that crosses a boundary (UI -> engine, engine -> UI, localStorage,
 * LLM output) is validated against one of these schemas.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const CoverageTierSchema = z.enum(["SELF_ONLY", "FAMILY"]);
export type CoverageTier = z.infer<typeof CoverageTierSchema>;

export const FilingStatusSchema = z.enum([
  "SINGLE",
  "MARRIED_FILING_JOINTLY",
  "HEAD_OF_HOUSEHOLD",
]);
export type FilingStatus = z.infer<typeof FilingStatusSchema>;

export const PlanTypeSchema = z.enum(["HDHP_HSA", "PPO"]);
export type PlanType = z.infer<typeof PlanTypeSchema>;

export const UsStateSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, "Use a 2-letter US state code, e.g. TX");

const money = (max: number) => z.number().finite().min(0).max(max);
const rate = (max: number) => z.number().finite().min(0).max(max);

// ---------------------------------------------------------------------------
// Health plan
// ---------------------------------------------------------------------------

/** Cost terms that differ between self-only and family coverage. */
export const TierTermsSchema = z.object({
  /** Employee's share of the premium, per month, in USD. */
  monthlyPremium: money(5_000),
  /** Annual deductible in USD (aggregate for the family tier). */
  deductible: money(30_000),
  /** Annual in-network out-of-pocket maximum in USD. */
  oopMax: money(40_000),
  /** Annual employer HSA contribution ("seed") in USD. 0 for non-HSA plans. */
  employerHsaContribution: money(9_000).default(0),
});
export type TierTerms = z.infer<typeof TierTermsSchema>;

/**
 * Flat copays charged before the deductible. A category with a copay bypasses
 * the deductible; a category without one is billed at its allowed amount and
 * goes through deductible + coinsurance.
 */
export const CopaysSchema = z.object({
  primaryCare: money(500).optional(),
  specialist: money(500).optional(),
  rx: money(500).optional(),
});
export type Copays = z.infer<typeof CopaysSchema>;

export const HealthPlanSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    type: PlanTypeSchema,
    selfOnly: TierTermsSchema,
    family: TierTermsSchema,
    /** Share the member pays after the deductible, e.g. 0.2 for 20%. */
    coinsuranceRate: rate(1),
    copays: CopaysSchema.optional(),
  })
  .superRefine((plan, ctx) => {
    for (const tier of ["selfOnly", "family"] as const) {
      if (plan[tier].oopMax < plan[tier].deductible) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [tier, "oopMax"],
          message: "Out-of-pocket maximum cannot be lower than the deductible",
        });
      }
    }
  });
export type HealthPlan = z.infer<typeof HealthPlanSchema>;

// ---------------------------------------------------------------------------
// User input
// ---------------------------------------------------------------------------

/** Expected care for the plan year. */
export const UsageSchema = z.object({
  primaryCareVisits: z.number().int().min(0).max(100),
  specialistVisits: z.number().int().min(0).max(100),
  rxFills: z.number().int().min(0).max(200),
  /**
   * All other in-network allowed charges in USD (labs, imaging, ER, surgery,
   * childbirth). Always subject to deductible + coinsurance.
   */
  otherAllowedCharges: money(2_000_000),
});
export type Usage = z.infer<typeof UsageSchema>;

/** Assumed allowed amount per unit when a plan has no copay for the category. */
export const AllowedAmountsSchema = z.object({
  primaryCare: money(2_000),
  specialist: money(2_000),
  rx: money(2_000),
});
export type AllowedAmounts = z.infer<typeof AllowedAmountsSchema>;

export const UserInputSchema = z
  .object({
    coverageTier: CoverageTierSchema,
    filingStatus: FilingStatusSchema,
    age: z.number().int().min(18).max(100),
    /** Annual wages in USD. Used for the Social Security wage-base check. */
    annualIncome: money(10_000_000),
    /** Marginal federal income tax rate, 0.10 to 0.37. */
    marginalFederalRate: rate(0.37),
    state: UsStateSchema,
    /** Marginal state income tax rate, e.g. 0 for TX, 0.0495 for IL. */
    marginalStateRate: rate(0.15),
    usage: UsageSchema,
    /** Overrides the engine's default allowed amounts per visit / fill. */
    allowedAmounts: AllowedAmountsSchema.optional(),
    /** What the employee wants to put into an HSA via payroll, per year. */
    plannedHsaContribution: money(20_000),
    /** What the employee wants to put into a health FSA via payroll, per year. */
    plannedFsaContribution: money(20_000),
    plans: z.array(HealthPlanSchema).min(2).max(4),
  })
  .superRefine((input, ctx) => {
    const ids = input.plans.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plans"],
        message: "Plan ids must be unique",
      });
    }
  });
export type UserInput = z.infer<typeof UserInputSchema>;

// ---------------------------------------------------------------------------
// Calculation result
// ---------------------------------------------------------------------------

export const TaxSavingsSchema = z.object({
  federal: z.number(),
  state: z.number(),
  fica: z.number(),
  total: z.number(),
});
export type TaxSavings = z.infer<typeof TaxSavingsSchema>;

export const PlanResultSchema = z.object({
  planId: z.string(),
  planName: z.string(),
  planType: PlanTypeSchema,
  /** True when the plan meets the IRS 2027 HDHP rules for the chosen tier. */
  hsaEligible: z.boolean(),
  annualPremium: z.number(),
  /** Member cost sharing for the user's expected usage. */
  expectedOutOfPocket: z.number(),
  /** The plan's out-of-pocket maximum for the chosen tier. */
  worstCaseOutOfPocket: z.number(),
  hsaContributionLimit: z.number(),
  employerHsaContribution: z.number(),
  /** Employee payroll HSA contribution after applying the IRS limit. */
  employeeHsaContribution: z.number(),
  /** Health FSA election after applying the IRS limit (0 with an HSA). */
  fsaElection: z.number(),
  /** FSA dollars lost in the expected scenario (beyond the carryover). */
  fsaForfeiture: z.number(),
  taxSavings: TaxSavingsSchema,
  /** premiums + out-of-pocket + FSA forfeiture - employer HSA - tax savings */
  netAnnualCost: z.number(),
  /** Net cost if the household uses no care at all. */
  zeroUsageNetCost: z.number(),
  /** Net cost if the household hits the out-of-pocket maximum. */
  worstCaseNetCost: z.number(),
  warnings: z.array(z.string()),
});
export type PlanResult = z.infer<typeof PlanResultSchema>;

export const CalculationResultSchema = z.object({
  planYear: z.literal(2027),
  coverageTier: CoverageTierSchema,
  /** Sorted by netAnnualCost, cheapest first. */
  plans: z.array(PlanResultSchema).min(2),
  recommendedPlanId: z.string(),
  /** Expected-cost gap between the recommended plan and the next best. */
  savingsVsNextBest: z.number(),
  /** Expected-cost gap between the recommended plan and the most expensive. */
  savingsVsMostExpensive: z.number(),
  /**
   * "Other allowed charges" level at which the recommended plan and the next
   * best cost the same. null when one plan wins at every level of care.
   */
  breakevenAllowedCharges: z.number().nullable(),
  warnings: z.array(z.string()),
});
export type CalculationResult = z.infer<typeof CalculationResultSchema>;

// ---------------------------------------------------------------------------
// Sample personas
// ---------------------------------------------------------------------------

export const PersonaSampleSchema = z.object({
  id: z.string().min(1),
  /** Short label for the 1-click switcher, e.g. "Maya, 33 · Austin, TX". */
  label: z.string().min(1),
  /** One line on the situation this persona demonstrates. */
  story: z.string().min(1),
  /** Always true: the UI must badge this as sample data. */
  isSample: z.literal(true),
  input: UserInputSchema,
});
export type PersonaSample = z.infer<typeof PersonaSampleSchema>;

// ---------------------------------------------------------------------------
// Retention state (post-enrollment tracker, stored in localStorage)
// ---------------------------------------------------------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, e.g. 2027-03-15");

export const ExpenseSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  description: z.string().min(1).max(120),
  /** What the member paid in USD. */
  amount: money(1_000_000),
  paidFrom: z.enum(["HSA", "FSA", "POCKET"]),
  countsTowardDeductible: z.boolean().default(true),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const RetentionStateSchema = z.object({
  version: z.literal(1),
  /** True after the Stripe test checkout (or promo unlock) succeeds. */
  unlocked: z.boolean(),
  planYear: z.literal(2027),
  selectedPlanId: z.string().min(1),
  coverageTier: CoverageTierSchema,
  enrolledOn: isoDate,
  expenses: z.array(ExpenseSchema),
  /** Employee + employer HSA dollars deposited so far this year. */
  hsaContributedToDate: money(20_000),
  hsaAnnualTarget: money(20_000),
  fsaElection: money(20_000),
  /** Last day to incur FSA expenses, usually Dec 31 of the plan year. */
  fsaDeadline: isoDate,
  /** Demo "fast-forward" offset in months, 0 to 12. */
  demoMonthOffset: z.number().int().min(0).max(12).default(0),
});
export type RetentionState = z.infer<typeof RetentionStateSchema>;
