import { describe, expect, it } from "vitest";
import { auditBill } from "@/lib/engine/calculator";
import { HOSPITAL_BILL, HOSPITAL_DEMAND, SAMPLE_CATCH_PLAN, SAMPLE_CATCH_YTD, billTotal } from "@/lib/sample-bills";

describe("Paywall example catch (sample bill, Maya's HDHP)", () => {
  it("$4,200 ER bill, $2,000 deductible met, 20% coinsurance: $840 owed, $1,810 overcharge (from auditBill)", () => {
    // $4,200 billed, $2,000 deductible already met, $2,650 demanded, 20% coinsurance.
    // Owed = 4,200 x 0.2 = 840 (OOP left 4,500 - 2,000 = 2,500 doesn't cap it). Overcharge = 2,650 - 840 = 1,810.
    expect(billTotal(HOSPITAL_BILL)).toBe(4_200);
    expect(HOSPITAL_DEMAND).toBe(2_650);
    expect(SAMPLE_CATCH_YTD).toBe(2_000);
    expect(SAMPLE_CATCH_PLAN.coinsuranceRate).toBe(0.2);
    const audit = auditBill(SAMPLE_CATCH_PLAN, "SELF_ONLY", {
      billedAmount: billTotal(HOSPITAL_BILL),
      ytdPaid: SAMPLE_CATCH_YTD,
      demandedAmount: HOSPITAL_DEMAND,
    });
    expect(audit.legalShare).toBe(840);
    expect(audit.overcharge).toBe(1_810);
  });
});
