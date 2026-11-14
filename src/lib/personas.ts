import type { HealthPlan, PersonaSample } from "@/lib/schema";

/**
 * 1-click sample personas. These are fictional households with realistic 2027
 * plan designs. The UI must badge them "SAMPLE DATA". Their results are never
 * typed by hand: they run through the same engine as judge-typed inputs.
 */

const HDHP: HealthPlan = {
  id: "hdhp",
  name: "Saver HDHP + HSA",
  type: "HDHP_HSA",
  selfOnly: { monthlyPremium: 85, deductible: 2_000, oopMax: 4_500, employerHsaContribution: 750 },
  family: { monthlyPremium: 290, deductible: 4_000, oopMax: 9_000, employerHsaContribution: 1_500 },
  coinsuranceRate: 0.2,
};

const PPO: HealthPlan = {
  id: "ppo",
  name: "Choice PPO",
  type: "PPO",
  selfOnly: { monthlyPremium: 210, deductible: 750, oopMax: 3_500, employerHsaContribution: 0 },
  family: { monthlyPremium: 640, deductible: 1_500, oopMax: 7_000, employerHsaContribution: 0 },
  coinsuranceRate: 0.2,
  copays: { primaryCare: 25, specialist: 50, rx: 15 },
};

/** Elena's employer offers a weaker HDHP (no seed money) and a richer PPO. */
const ELENA_HDHP: HealthPlan = {
  id: "hdhp",
  name: "Bronze HDHP + HSA",
  type: "HDHP_HSA",
  selfOnly: { monthlyPremium: 160, deductible: 3_000, oopMax: 7_000, employerHsaContribution: 0 },
  family: { monthlyPremium: 520, deductible: 6_000, oopMax: 14_000, employerHsaContribution: 0 },
  coinsuranceRate: 0.3,
};

const ELENA_PPO: HealthPlan = {
  id: "ppo",
  name: "Premier PPO",
  type: "PPO",
  selfOnly: { monthlyPremium: 190, deductible: 500, oopMax: 3_000, employerHsaContribution: 0 },
  family: { monthlyPremium: 610, deductible: 1_000, oopMax: 6_000, employerHsaContribution: 0 },
  coinsuranceRate: 0.1,
  copays: { primaryCare: 20, specialist: 40, rx: 15 },
};

export const SAMPLE_PERSONAS: PersonaSample[] = [
  {
    id: "maya",
    label: "Maya, 33 · Austin, TX",
    story:
      "Senior designer earning $95,000. Healthy, a few visits a year, and about to default to the PPO because it feels safer.",
    isSample: true,
    input: {
      coverageTier: "SELF_ONLY",
      filingStatus: "SINGLE",
      age: 33,
      annualIncome: 95_000,
      marginalFederalRate: 0.22,
      state: "TX",
      marginalStateRate: 0,
      usage: { primaryCareVisits: 4, specialistVisits: 2, rxFills: 6, otherAllowedCharges: 1_200 },
      plannedHsaContribution: 3_750,
      plannedFsaContribution: 500,
      plans: [HDHP, PPO],
    },
  },
  {
    id: "marcus",
    label: "Marcus, 29 · Chicago, IL",
    story:
      "Software analyst earning $72,000. Almost never sees a doctor and overpays for coverage he doesn't use.",
    isSample: true,
    input: {
      coverageTier: "SELF_ONLY",
      filingStatus: "SINGLE",
      age: 29,
      annualIncome: 72_000,
      marginalFederalRate: 0.22,
      state: "IL",
      marginalStateRate: 0.0495,
      usage: { primaryCareVisits: 1, specialistVisits: 0, rxFills: 0, otherAllowedCharges: 0 },
      plannedHsaContribution: 2_000,
      plannedFsaContribution: 0,
      plans: [HDHP, PPO],
    },
  },
  {
    id: "elena",
    label: "Elena, 41 · Seattle, WA",
    story:
      "Married with two kids, household income $165,000, and a child on a specialty medication. Heavy, predictable care, where the PPO wins.",
    isSample: true,
    input: {
      coverageTier: "FAMILY",
      filingStatus: "MARRIED_FILING_JOINTLY",
      age: 41,
      annualIncome: 165_000,
      marginalFederalRate: 0.22,
      state: "WA",
      marginalStateRate: 0,
      usage: { primaryCareVisits: 10, specialistVisits: 12, rxFills: 36, otherAllowedCharges: 9_500 },
      plannedHsaContribution: 7_500,
      plannedFsaContribution: 3_500,
      plans: [ELENA_HDHP, ELENA_PPO],
    },
  },
];
