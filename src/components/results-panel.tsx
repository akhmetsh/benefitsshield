"use client";

import { CostChart } from "@/components/cost-chart";
import { usd, usdCents } from "@/lib/format";
import { STRESS_SCENARIOS } from "@/lib/scenarios";
import type { CalculationResult } from "@/lib/schema";

interface Props {
  result: CalculationResult;
  bullets: string[];
  briefSource: "llm" | "template";
  computeMs: number | null;
  unlocked: boolean;
}

export function ResultsPanel({ result, bullets, briefSource, computeMs, unlocked }: Props) {
  const [winner, runnerUp] = result.plans;
  const tie = result.savingsVsNextBest === 0;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm sm:p-6" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
          {tie ? "It's a tie" : "Your lower-cost plan for 2027"}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{winner.planName}</h2>
        {tie ? (
          <p className="mt-2 text-slate-700">Both plans cost the same on these numbers.</p>
        ) : (
          <p className="mt-2 text-slate-700">
            <span className="tabular text-3xl font-bold text-emerald-700 sm:text-4xl">{usdCents(result.savingsVsNextBest)}</span>{" "}
            <span className="text-base">less per year than {runnerUp.planName}</span>
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Net cost = premiums + expected care + FSA forfeiture − employer HSA money − payroll tax savings.
          {computeMs !== null && <> Recalculated in {computeMs.toFixed(1)} ms.</>}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Net annual cost by plan</h3>
        <CostChart result={result} />
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {result.plans.map((p) => (
            <li key={p.planId} className="flex items-center justify-between gap-3 py-2">
              <span className="text-slate-700">
                {p.planName}
                {p.planType === "HDHP_HSA" && !p.hsaEligible && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">not HSA-qualified</span>
                )}
              </span>
              <span className="tabular font-semibold text-slate-900">{usdCents(p.netAnnualCost)}</span>
            </li>
          ))}
        </ul>
        {result.plans.some((p) => p.netAnnualCost < 0) && (
          <p className="mt-2 text-xs text-slate-500">A negative cost means employer HSA money plus tax savings exceed premiums and care.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Plain-English brief</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {briefSource === "llm" ? "AI wording · engine numbers" : "Rule-based"}
          </span>
        </div>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-slate-800">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>

      {!unlocked && (
        <a
          href="#unlock"
          className="block rounded-2xl bg-slate-900 p-5 text-center text-white shadow-sm transition hover:bg-slate-800"
        >
          <span className="block text-base font-semibold">Stress-test it: {usd(STRESS_SCENARIOS[STRESS_SCENARIOS.length - 1].charges)} worst year, tax shield, year-round copilot</span>
          <span className="mt-1 block text-sm text-slate-300">Unlock everything for $39/yr →</span>
        </a>
      )}
    </div>
  );
}
