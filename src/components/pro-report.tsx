"use client";

import { useMemo } from "react";
import { comparePlans } from "@/lib/engine/calculator";
import { usd, usdCents } from "@/lib/format";
import { STRESS_SCENARIOS, withStressCharges } from "@/lib/scenarios";
import type { CalculationResult, PlanResult, UserInput } from "@/lib/schema";

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StressMatrix({ input }: { input: UserInput }) {
  const rows = useMemo(
    () =>
      STRESS_SCENARIOS.map((s) => ({
        scenario: s,
        result: comparePlans(withStressCharges(input, s.charges)),
      })),
    [input],
  );
  const planOrder = input.plans.map((p) => ({ id: p.id, name: p.name }));

  return (
    <Section
      title="4-scenario stress matrix"
      subtitle="Your net annual cost if the year goes this way. Each row replaces your expected care with one year of in-network charges."
    >
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-semibold">Scenario</th>
              {planOrder.map((p) => (
                <th key={p.id} className="py-2 px-3 text-right font-semibold">{p.name}</th>
              ))}
              <th className="py-2 pl-3 text-right font-semibold">Cheaper plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ scenario, result }) => (
              <tr key={scenario.id} className="border-b border-slate-100 align-top">
                <td className="py-3 pr-3">
                  <p className="font-semibold text-slate-900">{usd(scenario.charges)}</p>
                  <p className="text-xs text-slate-500">{scenario.label}: {scenario.detail}</p>
                </td>
                {planOrder.map((p) => {
                  const plan = result.plans.find((r) => r.planId === p.id);
                  const best = result.recommendedPlanId === p.id;
                  return (
                    <td key={p.id} className={`tabular py-3 px-3 text-right ${best ? "font-bold text-emerald-700" : "text-slate-700"}`}>
                      {plan ? usdCents(plan.netAnnualCost) : "—"}
                    </td>
                  );
                })}
                <td className="py-3 pl-3 text-right">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    {result.plans[0].planName}
                  </span>
                  <p className="tabular mt-1 text-xs text-slate-500">saves {usd(result.savingsVsNextBest)}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 text-sm ${strong ? "border-t border-slate-200 pt-2.5 font-semibold text-slate-900" : muted ? "text-slate-500" : "text-slate-700"}`}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

function TaxShieldCard({ plan }: { plan: PlanResult }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{plan.planName}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${plan.hsaEligible ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
          {plan.hsaEligible ? "HSA-qualified" : "No HSA"}
        </span>
      </div>
      <div className="mt-2 divide-y divide-slate-100">
        {plan.hsaEligible ? (
          <>
            <Row label="2027 IRS HSA limit" value={usd(plan.hsaContributionLimit)} muted />
            <Row label="Employer HSA seed" value={usdCents(plan.employerHsaContribution)} />
            <Row label="Your HSA contribution" value={usdCents(plan.employeeHsaContribution)} />
          </>
        ) : (
          <Row label="Health FSA election" value={usdCents(plan.fsaElection)} />
        )}
        <Row label="Federal income tax saved" value={usdCents(plan.taxSavings.federal)} />
        <Row label="State income tax saved" value={usdCents(plan.taxSavings.state)} />
        <Row label="FICA (Social Security + Medicare) saved" value={usdCents(plan.taxSavings.fica)} />
        <Row label="Total tax shield" value={usdCents(plan.taxSavings.total)} strong />
      </div>
      {plan.fsaForfeiture > 0 && (
        <p className="mt-2 text-xs text-amber-800">FSA money you would forfeit on expected care: {usdCents(plan.fsaForfeiture)}</p>
      )}
    </div>
  );
}

export function ProReport({ input, result }: { input: UserInput; result: CalculationResult }) {
  const warnings = Array.from(new Set(result.warnings));
  return (
    <div className="space-y-4">
      <StressMatrix input={input} />

      <Section
        title="2027 IRS HSA / FSA tax shield"
        subtitle="Payroll contributions skip federal income tax, state income tax and FICA. Statutory limits come from IRS Rev. Proc. 2026-24 (HSA) and 2026-35 (FSA)."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {result.plans.map((p) => (
            <TaxShieldCard key={p.planId} plan={p} />
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-700">
          {result.breakevenAllowedCharges === null
            ? "Breakeven: the recommended plan stays cheaper at every level of care up to $200,000."
            : `Breakeven: the other plan becomes cheaper once your other medical charges reach about ${usd(result.breakevenAllowedCharges)}.`}
        </p>
        {warnings.length > 0 && (
          <ul className="mt-3 space-y-2">
            {warnings.map((w) => (
              <li key={w} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {w}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
