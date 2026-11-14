import { usd } from "@/lib/format";
import type { CalculationResult, PlanResult } from "@/lib/schema";

/**
 * Deterministic 3-bullet summary. Every number is read from the engine result;
 * the same placeholder map feeds the optional LLM wording (see summarize.ts).
 */

export const SUMMARY_TOKENS = [
  "winner",
  "runnerUp",
  "savings",
  "winnerNet",
  "runnerUpNet",
  "winnerWorst",
  "runnerUpWorst",
  "breakeven",
  "taxSavings",
  "employerHsa",
] as const;
export type SummaryToken = (typeof SUMMARY_TOKENS)[number];

export function summaryValues(result: CalculationResult): Record<SummaryToken, string> {
  const winner = result.plans[0];
  const runnerUp = result.plans[1];
  return {
    winner: winner.planName,
    runnerUp: runnerUp.planName,
    savings: usd(result.savingsVsNextBest),
    winnerNet: usd(winner.netAnnualCost),
    runnerUpNet: usd(runnerUp.netAnnualCost),
    winnerWorst: usd(winner.worstCaseNetCost),
    runnerUpWorst: usd(runnerUp.worstCaseNetCost),
    breakeven: result.breakevenAllowedCharges === null ? "n/a" : usd(result.breakevenAllowedCharges),
    taxSavings: usd(winner.taxSavings.total),
    employerHsa: usd(winner.employerHsaContribution),
  };
}

export function fillTokens(template: string, values: Record<SummaryToken, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key as SummaryToken] : match,
  );
}

function tradeOff(winner: PlanResult, runnerUp: PlanResult): string {
  if (winner.worstCaseNetCost > runnerUp.worstCaseNetCost) {
    return "Trade-off: {winner} costs less in a typical year, but in a very bad year it costs more ({winnerWorst} vs {runnerUpWorst} at the out-of-pocket maximum), so keep cash or HSA money aside for a surprise bill.";
  }
  return "Trade-off: {winner} also protects you better in a very bad year ({winnerWorst} vs {runnerUpWorst} at the out-of-pocket maximum), so the cheaper plan is not the riskier one here.";
}

function benefitLine(winner: PlanResult): string {
  if (winner.employerHsaContribution > 0 || winner.taxSavings.total > 0) {
    return "Where the savings come from: {employerHsa} of employer HSA money and {taxSavings} of payroll tax savings are already netted out of {winner}'s cost.";
  }
  return "Where the savings come from: {winner} has lower premiums and cost sharing for the care you expect, with no HSA or tax savings counted.";
}

function breakevenLine(result: CalculationResult): string {
  if (result.breakevenAllowedCharges === null) {
    return "Switch point: no level of medical spending up to $200,000 makes {runnerUp} the cheaper choice.";
  }
  return "Switch point: if your other medical charges rose to about {breakeven}, {runnerUp} would become the cheaper plan.";
}

/** Three templates with {tokens}; the order is headline, trade-off, why/when. */
export function summaryTemplates(result: CalculationResult): [string, string, string] {
  const winner = result.plans[0];
  const runnerUp = result.plans[1];
  return [
    "Pick {winner}: it costs about {winnerNet} net next year versus {runnerUpNet} for {runnerUp}, a gap of {savings}.",
    tradeOff(winner, runnerUp),
    result.breakevenAllowedCharges === null ? benefitLine(winner) + " " + breakevenLine(result) : breakevenLine(result),
  ];
}

export function templateSummary(result: CalculationResult): [string, string, string] {
  const values = summaryValues(result);
  const [a, b, c] = summaryTemplates(result);
  return [fillTokens(a, values), fillTokens(b, values), fillTokens(c, values)];
}
