import type { UserInput } from "@/lib/schema";

/**
 * The four stress-test years in the paid matrix. These are *inputs* (total
 * in-network allowed charges for the year), not outputs: every dollar of cost
 * comes from comparePlans().
 */
export const STRESS_SCENARIOS = [
  { id: "routine", label: "Routine year", detail: "Checkups and a few prescriptions", charges: 650 },
  { id: "injury", label: "Urgent care or ER visit", detail: "A broken wrist or a bad infection", charges: 2_200 },
  { id: "surgery", label: "Planned surgery", detail: "Surgery plus follow-up care", charges: 14_000 },
  { id: "catastrophic", label: "Catastrophic year", detail: "Hospital stay, cancer or major accident", charges: 45_000 },
] as const;

/** Replaces expected care with one lump-sum year of in-network charges. */
export function withStressCharges(input: UserInput, charges: number): UserInput {
  return {
    ...input,
    usage: { primaryCareVisits: 0, specialistVisits: 0, rxFills: 0, otherAllowedCharges: charges },
  };
}
