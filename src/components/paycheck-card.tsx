"use client";

import { PAYCHECKS_PER_YEAR, calculatePaycheckSchedule } from "@/lib/engine/calculator";
import { usd, usdCents } from "@/lib/format";
import type { PlanResult } from "@/lib/schema";

function Schedule({ label, annual, note }: { label: string; annual: number; note?: string }) {
  const s = calculatePaycheckSchedule(annual);
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold text-slate-900">
        {usdCents(s.perPaycheck)}
        <span className="ml-1 text-sm font-medium text-slate-600">per paycheck</span>
      </p>
      <p className="tabular mt-1 text-xs text-slate-600">
        {usd(annual)} a year · {s.paychecks - 1} checks of {usdCents(s.perPaycheck)}, then {usdCents(s.finalPaycheck)}
      </p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/** Biweekly payroll amounts for the enrolled plan's HSA and FSA. */
export function PaycheckCard({ plan, fsaElection }: { plan: PlanResult; fsaElection: number }) {
  const hsaRoom = Math.max(0, plan.hsaContributionLimit - plan.employerHsaContribution);
  const showMax = plan.hsaEligible && hsaRoom > plan.employeeHsaContribution;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Payroll setup</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">Workday / ADP Biweekly Paycheck Setup</h2>
      <p className="mt-1 text-sm text-slate-600">
        {PAYCHECKS_PER_YEAR} paychecks in 2027. Enter these per-pay-period amounts in your payroll portal&apos;s benefits election for {plan.planName}.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {plan.hsaEligible && (
          <Schedule
            label="Your HSA contribution"
            annual={plan.employeeHsaContribution}
            note={`Employer adds ${usd(plan.employerHsaContribution)}; the 2027 IRS limit of ${usd(plan.hsaContributionLimit)} covers both.`}
          />
        )}
        {showMax && <Schedule label="To hit the 2027 IRS HSA limit" annual={hsaRoom} note="Your share after the employer seed." />}
        {fsaElection > 0 && <Schedule label="Health FSA election" annual={fsaElection} />}
      </div>
      {!plan.hsaEligible && fsaElection === 0 && (
        <p className="mt-3 text-sm text-slate-600">No HSA or FSA contributions for this plan. Add a planned amount above to see paycheck amounts.</p>
      )}
      {plan.hsaEligible && plan.employeeHsaContribution === 0 && !showMax && fsaElection === 0 && (
        <p className="mt-3 text-sm text-slate-600">No contribution planned.</p>
      )}
    </section>
  );
}
