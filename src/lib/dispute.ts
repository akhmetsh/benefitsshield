import { usdCents } from "@/lib/format";
import type { BillAudit, BillAuditInput } from "@/lib/engine/calculator";
import type { HealthPlan, TierTerms } from "@/lib/schema";

/** Formal dispute message with the plan's own numbers. No names or account ids. */
export function buildDisputeScript(
  plan: HealthPlan,
  terms: TierTerms,
  bill: BillAuditInput,
  audit: BillAudit,
): string {
  const lines = [
    "Subject: Request for corrected statement — patient responsibility does not match plan terms",
    "",
    "To the Billing Department,",
    "",
    `I am reviewing the statement showing ${usdCents(bill.billedAmount)} billed and ${usdCents(bill.demandedAmount)} due from me. Under my ${plan.name} (2027 plan year), the amount I owe is ${usdCents(audit.legalShare)}:`,
    "",
    `- Annual deductible: ${usdCents(terms.deductible)}; already paid this year: ${usdCents(bill.ytdPaid)}; remaining: ${usdCents(audit.remainingDeductible)}`,
    `- Coinsurance after the deductible: ${Math.round(plan.coinsuranceRate * 100)}%`,
    `- Annual out-of-pocket maximum: ${usdCents(terms.oopMax)}; remaining: ${usdCents(audit.remainingOopMax)}`,
    `- Calculation: ${usdCents(audit.deductiblePortion)} toward the deductible + ${usdCents(audit.coinsurancePortion)} coinsurance = ${usdCents(audit.legalShare)}`,
  ];
  if (audit.verdict === "OVERCHARGE") {
    lines.push("", `The statement overstates my responsibility by ${usdCents(audit.overcharge)}.`);
    for (const finding of audit.findings) lines.push(`- ${finding}`);
  }
  lines.push(
    "",
    "Please send a corrected, itemized statement reflecting my insurer's explanation of benefits, and place any collection activity on hold until it is resolved.",
    "",
    "Thank you.",
  );
  return lines.join("\n");
}
