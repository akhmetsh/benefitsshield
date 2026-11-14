"use client";

import { usdCents } from "@/lib/format";
import type { CalculationResult } from "@/lib/schema";

/** Side-by-side stakes: what the costliest plan loses vs what the best plan keeps. */
export function LossVsSaved({ result, unlocked }: { result: CalculationResult; unlocked: boolean }) {
  const best = result.plans[0];
  const worst = result.plans[result.plans.length - 1];
  const gap = result.savingsVsMostExpensive;

  if (gap === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
        Your plans cost the same on these numbers, so there is nothing to lose or save by switching.
      </section>
    );
  }

  return (
    <section aria-label="Money lost versus saved" className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-red-800">Status Quo Loss</p>
        <p className="tabular mt-2 text-4xl font-extrabold text-red-700 sm:text-5xl">-{usdCents(gap)}<span className="text-lg font-bold">/yr</span></p>
        <p className="mt-2 text-sm text-red-900">
          lost by picking {worst.planName}: excess premiums, cost sharing and forgone payroll tax savings.
        </p>
        <p className="tabular mt-3 text-xs text-red-800">Net cost {usdCents(worst.netAnnualCost)} per year</p>
      </div>

      <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">BenefitsShield Optimization</p>
        <p className="tabular mt-2 text-4xl font-extrabold text-emerald-700 sm:text-5xl">+{usdCents(gap)}<span className="text-lg font-bold">/yr</span></p>
        <p className="mt-2 text-sm text-emerald-950">kept by choosing {best.planName}.</p>
        <p className="tabular mt-3 text-xs text-emerald-900">Net cost {usdCents(best.netAnnualCost)} per year</p>
        {unlocked ? (
          <p className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-sm font-semibold text-emerald-900">Pro is active: scan bills in the Billing Error Shield below.</p>
        ) : (
          <a href="#unlock" className="mt-4 block rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-bold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30">
            Protect Your 2027 Savings from Hospital Billing Errors ($39/yr)
          </a>
        )}
      </div>
    </section>
  );
}
