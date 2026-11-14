import { describe, expect, it } from "vitest";
import { auditBill, getTierTerms } from "@/lib/engine/calculator";
import { buildDisputeScript } from "@/lib/dispute";
import { SAMPLE_PERSONAS } from "@/lib/personas";

describe("buildDisputeScript", () => {
  const plan = SAMPLE_PERSONAS[0].input.plans[0];
  const terms = getTierTerms(plan, "SELF_ONLY");
  const bill = { billedAmount: 4_200, ytdPaid: 2_000, demandedAmount: 2_650 };

  it("cites the plan numbers and the overcharge from the audit", () => {
    // Maya HDHP: ded 2,000 (all paid), coinsurance 20% -> legal = 4,200 x 0.2 = 840; overcharge 1,810
    const text = buildDisputeScript(plan, terms, bill, auditBill(plan, "SELF_ONLY", bill));
    expect(text).toContain("$840.00");
    expect(text).toContain("$1,810.00");
    expect(text).toContain("20%");
    expect(text).toContain(plan.name);
  });

  it("omits the overcharge paragraph for a fair bill", () => {
    const fair = { billedAmount: 1_200, ytdPaid: 0, demandedAmount: 1_200 };
    const text = buildDisputeScript(plan, terms, fair, auditBill(plan, "SELF_ONLY", fair));
    expect(text).not.toContain("overstates");
  });
});
