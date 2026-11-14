"use client";

import { useMemo, useState } from "react";
import { BillScanner } from "@/components/bill-scanner";
import { FsaChips } from "@/components/fsa-chips";
import { PaycheckCard } from "@/components/paycheck-card";
import { IRS_2027, addMonths, computeTrackerSnapshot, estimateMemberShare } from "@/lib/engine/calculator";
import { formatIsoDate, percent, usd, usdCents } from "@/lib/format";
import { buildFsaCalendar } from "@/lib/ics";
import type { CalculationResult, Expense, HealthPlan, RetentionState, UserInput } from "@/lib/schema";

interface Props {
  input: UserInput;
  result: CalculationResult;
  retention: RetentionState | null;
  onChange: (next: RetentionState | null) => void;
}

const PLAN_YEAR_START = "2027-01-01";
const FSA_DEADLINE = "2027-12-31";
const NEXT_BILL = 1_000;
/** Demo clock offset that lands inside the 90-day FSA warning window of a Dec 31 deadline. */
const FSA_WINDOW_OFFSET = 10;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function Bar({ value, tone }: { value: number; tone: "emerald" | "amber" | "slate" }) {
  const colors = { emerald: "bg-emerald-600", amber: "bg-amber-500", slate: "bg-slate-500" };
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className={`h-full rounded-full transition-all duration-500 ${colors[tone]}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="tabular text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

export function Copilot({ input, result, retention, onChange }: Props) {
  const trackedPlan = retention ? input.plans.find((p) => p.id === retention.selectedPlanId) : undefined;
  const scanPlan = trackedPlan ?? input.plans.find((p) => p.id === result.recommendedPlanId) ?? input.plans[0];
  const scanTier = retention?.coverageTier ?? input.coverageTier;
  const planResult = result.plans.find((p) => p.planId === scanPlan.id) ?? result.plans[0];

  const logVerified = retention
    ? (amount: number, description: string) => {
        const date = addMonths(retention.enrolledOn, retention.demoMonthOffset);
        onChange({
          ...retention,
          expenses: [
            ...retention.expenses,
            {
              id: `bill-${retention.expenses.length + 1}-${date}-${Math.round(amount * 100)}`,
              date,
              description: description.slice(0, 120),
              amount,
              paidFrom: "POCKET",
              countsTowardDeductible: true,
            },
          ],
        });
      }
    : undefined;

  return (
    <div className="space-y-6">
      <BillScanner plan={scanPlan} tier={scanTier} onLog={logVerified} />
      <PaycheckCard plan={planResult} fsaElection={retention ? retention.fsaElection : planResult.fsaElection} />
      {!retention ? (
        <StartTracker input={input} result={result} onStart={onChange} />
      ) : trackedPlan ? (
        <Tracker plan={trackedPlan} state={retention} onChange={onChange} />
      ) : (
        <Shell>
          <p className="text-sm text-slate-700">Your saved plan is no longer in this comparison.</p>
          <button type="button" onClick={() => onChange(null)} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Start a new tracker
          </button>
        </Shell>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Post-enrollment copilot</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">Year-round tracker</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StartTracker({ input, result, onStart }: { input: UserInput; result: CalculationResult; onStart: (s: RetentionState) => void }) {
  const [planId, setPlanId] = useState(result.recommendedPlanId);
  const [fsaText, setFsaText] = useState<string | null>(null);
  const chosen = result.plans.find((p) => p.planId === planId) ?? result.plans[0];
  // A general FSA can't sit next to an HSA, but a limited-purpose (dental and vision) FSA can.
  const defaultFsa = chosen.hsaEligible
    ? Math.min(input.plannedFsaContribution, IRS_2027.healthFsaLimit)
    : chosen.fsaElection;
  const fsa = fsaText === null ? defaultFsa : Math.min(IRS_2027.healthFsaLimit, Math.max(0, Number(fsaText) || 0));

  const start = () => {
    const today = todayIso();
    const enrolledOn = today > PLAN_YEAR_START ? today : PLAN_YEAR_START;
    const tierPlan = input.plans.find((p) => p.id === chosen.planId);
    const samples: Expense[] = tierPlan
      ? [
          { id: "sample-1", date: "2027-02-14", description: "Urgent care visit (sample)", amount: 180, paidFrom: "POCKET", countsTowardDeductible: true },
          { id: "sample-2", date: "2027-04-22", description: "Specialist visit and labs (sample)", amount: 420, paidFrom: "POCKET", countsTowardDeductible: true },
          { id: "sample-3", date: "2027-05-30", description: "Prescription fills (sample)", amount: 150, paidFrom: fsa > 0 ? "FSA" : "POCKET", countsTowardDeductible: true },
        ]
      : [];
    onStart({
      version: 1,
      unlocked: true,
      planYear: 2027,
      selectedPlanId: chosen.planId,
      coverageTier: input.coverageTier,
      enrolledOn,
      expenses: samples,
      hsaContributedToDate: 0,
      hsaAnnualTarget: chosen.employerHsaContribution + chosen.employeeHsaContribution,
      fsaElection: fsa,
      fsaDeadline: FSA_DEADLINE,
      demoMonthOffset: 0,
    });
  };

  return (
    <Shell>
      <p className="text-sm text-slate-600">Pick the plan you enrolled in. We start the year with three sample bills so you can fast-forward and see the tracker move.</p>
      <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Plan you enrolled in</legend>
        {result.plans.map((p) => (
          <label key={p.planId} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${planId === p.planId ? "border-emerald-600 bg-emerald-50" : "border-slate-200"}`}>
            <input type="radio" name="enrolled-plan" checked={planId === p.planId} onChange={() => { setPlanId(p.planId); setFsaText(null); }} className="accent-emerald-700" />
            <span className="font-medium text-slate-900">{p.planName}</span>
            {p.planId === result.recommendedPlanId && <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Recommended</span>}
          </label>
        ))}
      </fieldset>
      <div className="mt-4 max-w-xs">
        <label htmlFor="fsa-election" className="text-sm font-medium text-slate-700">
          {chosen.hsaEligible ? "Limited-purpose FSA election (dental and vision)" : "Health FSA election"}
        </label>
        <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white px-2 focus-within:border-emerald-600">
          <span className="text-sm text-slate-500">$</span>
          <input id="fsa-election" type="number" min={0} max={IRS_2027.healthFsaLimit} step={50} value={fsaText ?? defaultFsa} onChange={(e) => setFsaText(e.target.value)} className="tabular w-full bg-transparent px-1 py-2 text-sm outline-none" />
        </div>
        <p className="mt-1 text-xs text-slate-500">2027 limit {usd(IRS_2027.healthFsaLimit)}. Unspent dollars above the {usd(IRS_2027.healthFsaCarryoverMax)} carryover are lost.</p>
      </div>
      <button type="button" onClick={start} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30">
        Start my 2027 tracker
      </button>
    </Shell>
  );
}

function Tracker({ plan, state, onChange }: { plan: HealthPlan; state: RetentionState; onChange: (s: RetentionState | null) => void }) {
  const snap = useMemo(() => computeTrackerSnapshot(state, plan, state.enrolledOn), [state, plan]);
  const [formOpen, setFormOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [paidFrom, setPaidFrom] = useState<Expense["paidFrom"]>("POCKET");
  const [counts, setCounts] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const nextBillShare = estimateMemberShare(plan, snap, NEXT_BILL);
  const deductibleMet = snap.deductible > 0 && snap.deductibleRemaining === 0;
  const visibleExpenses = state.expenses.filter((e) => e.date <= snap.asOfDate);
  const hiddenCount = state.expenses.length - visibleExpenses.length;
  const hasSamples = state.expenses.some((e) => e.id.startsWith("sample-"));
  const fsaTone = snap.fsaAtRisk > 0 && snap.daysUntilFsaDeadline <= 90 ? "amber" : "emerald";

  const setOffset = (months: number) => onChange({ ...state, demoMonthOffset: Math.min(12, Math.max(0, months)) });

  const addExpense = () => {
    const value = Number(amount);
    if (!desc.trim()) return setFormError("Add a short description.");
    if (!Number.isFinite(value) || value <= 0) return setFormError("Enter an amount above $0.");
    const expense: Expense = {
      id: `exp-${state.expenses.length + 1}-${snap.asOfDate}-${Math.round(value * 100)}`,
      date: snap.asOfDate,
      description: desc.trim().slice(0, 120),
      amount: Math.min(value, 1_000_000),
      paidFrom,
      countsTowardDeductible: counts,
    };
    onChange({ ...state, expenses: [...state.expenses, expense] });
    setDesc("");
    setAmount("");
    setFormError(null);
    setFormOpen(false);
  };

  const downloadIcs = () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const label = state.fsaElection > 0 ? `You have ${usd(snap.fsaRemaining)} of FSA money left to use.` : "";
    const blob = new Blob([buildFsaCalendar(state.fsaDeadline, label, stamp)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "benefitsshield-fsa-deadline.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Demo clock</p>
          <p className="text-sm font-semibold">{formatIsoDate(snap.asOfDate)}{state.demoMonthOffset > 0 && <span className="ml-2 text-emerald-300">+{state.demoMonthOffset} months</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOffset(state.demoMonthOffset === 0 ? 6 : state.demoMonthOffset < FSA_WINDOW_OFFSET ? FSA_WINDOW_OFFSET : 0)} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/50">
            {state.demoMonthOffset === 0 ? "Fast-Forward +6 Months" : state.demoMonthOffset < FSA_WINDOW_OFFSET ? `Jump to FSA deadline window (+${FSA_WINDOW_OFFSET - state.demoMonthOffset} months)` : "Back to start"}
          </button>
          <button type="button" onClick={() => setOffset(state.demoMonthOffset + 1)} disabled={state.demoMonthOffset >= 12} className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-40">
            +1 month
          </button>
        </div>
      </div>

      {snap.alerts.length > 0 && (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {snap.alerts.map((a) => (
            <li key={a} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{a}</li>
          ))}
        </ul>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Deductible · {plan.name}</h3>
          <Bar value={snap.deductibleProgress} tone={deductibleMet ? "emerald" : "slate"} />
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Paid so far" value={usd(snap.deductibleMet)} />
            <Stat label="Remaining" value={usd(snap.deductibleRemaining)} />
            <Stat label="Out-of-pocket left" value={usd(snap.oopRemaining)} />
          </div>
          <p className="text-sm text-slate-700" aria-live="polite">
            {snap.oopRemaining === 0
              ? "Out-of-pocket maximum reached: covered in-network care is now $0."
              : deductibleMet
                ? `Deductible met. You now pay ${percent(plan.coinsuranceRate)} coinsurance: a ${usd(NEXT_BILL)} bill costs you ${usdCents(nextBillShare)}.`
                : `Until the deductible is met you pay full price. A ${usd(NEXT_BILL)} bill right now costs you ${usdCents(nextBillShare)}, then ${percent(plan.coinsuranceRate)} coinsurance applies.`}
          </p>

          {!formOpen ? (
            <button type="button" onClick={() => setFormOpen(true)} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30">
              + Log Medical Expense
            </button>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); addExpense(); }} className="space-y-3 rounded-xl bg-slate-50 p-3">
              <div>
                <label htmlFor="exp-desc" className="text-xs font-medium text-slate-700">What was it?</label>
                <input id="exp-desc" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={120} placeholder="e.g. Dentist cleaning" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-emerald-600" />
              </div>
              <div>
                <label htmlFor="exp-amount" className="text-xs font-medium text-slate-700">What you paid ($)</label>
                <input id="exp-amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-emerald-600" />
                <div className="mt-2 flex flex-wrap gap-2">
                  {[50, 150, 500, 1_000].map((q) => (
                    <button key={q} type="button" onClick={() => setAmount(String(q))} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-emerald-600">
                      {usd(q)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="exp-from" className="text-xs font-medium text-slate-700">Paid from</label>
                  <select id="exp-from" value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as Expense["paidFrom"])} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
                    <option value="POCKET">Out of pocket</option>
                    <option value="HSA">HSA card</option>
                    <option value="FSA">FSA card</option>
                  </select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-xs text-slate-700">
                  <input type="checkbox" checked={counts} onChange={(e) => setCounts(e.target.checked)} className="accent-emerald-700" />
                  Counts toward deductible
                </label>
              </div>
              {formError && <p className="text-xs text-red-700">{formError}</p>}
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Add expense</button>
                <button type="button" onClick={() => { setFormOpen(false); setFormError(null); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">Cancel</button>
              </div>
            </form>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">Health FSA · use it or lose it</h3>
          <div>
            <label htmlFor="fsa-edit" className="text-xs font-medium text-slate-700">Your FSA election for 2027</label>
            <div className="mt-1 flex max-w-[11rem] items-center rounded-lg border border-slate-300 bg-white px-2 focus-within:border-emerald-600">
              <span className="text-sm text-slate-500">$</span>
              <input id="fsa-edit" type="number" min={0} max={IRS_2027.healthFsaLimit} step={50} value={state.fsaElection} onChange={(e) => onChange({ ...state, fsaElection: Math.min(IRS_2027.healthFsaLimit, Math.max(0, Number(e.target.value) || 0)) })} className="tabular w-full bg-transparent px-1 py-1.5 text-sm outline-none" />
            </div>
          </div>
          {state.fsaElection > 0 ? (
            <>
              <Bar value={snap.fsaSpent / state.fsaElection} tone={fsaTone} />
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Left" value={usd(snap.fsaRemaining)} />
                <Stat label="Spent" value={usd(snap.fsaSpent)} />
                <Stat label="At risk" value={usd(snap.fsaAtRisk)} />
              </div>
              {snap.fsaRemaining > 0 && snap.fsaAtRisk === 0 && (
                <p className="text-xs text-slate-500">Your {usd(snap.fsaRemaining)} balance fits inside the {usd(IRS_2027.healthFsaCarryoverMax)} carryover, so nothing is at risk yet.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-600">No health FSA election. Enter an amount to see the use-it-or-lose-it countdown.</p>
          )}
          <div className={`rounded-xl p-4 ${snap.daysUntilFsaDeadline <= 90 && snap.fsaAtRisk > 0 ? "bg-amber-50" : "bg-slate-50"}`}>
            <p className="text-xs text-slate-500">Deadline {formatIsoDate(state.fsaDeadline)}</p>
            <p className="tabular text-3xl font-bold text-slate-900">
              {snap.daysUntilFsaDeadline >= 0 ? snap.daysUntilFsaDeadline : 0}
              <span className="ml-1 text-base font-medium text-slate-600">days left</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">{usd(IRS_2027.healthFsaCarryoverMax)} can carry over; the rest is forfeited.</p>
          </div>
          <FsaChips />
          <button type="button" onClick={downloadIcs} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:border-emerald-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/20">
            Download calendar reminder (.ics)
          </button>
          <p className="text-xs text-slate-500">
            HSA target for 2027: {usd(state.hsaAnnualTarget)} (employer and you combined).
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-900">Expense log</h3>
          {hasSamples && (
            <button type="button" onClick={() => onChange({ ...state, expenses: state.expenses.filter((e) => !e.id.startsWith("sample-")) })} className="text-xs font-medium text-slate-600 underline">
              Clear sample bills
            </button>
          )}
        </div>
        {visibleExpenses.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing logged yet. Log a bill or fast-forward to see the sample bills.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {visibleExpenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-slate-800">
                  {e.description}
                  <span className="ml-2 text-xs text-slate-500">{formatIsoDate(e.date)} · {e.paidFrom === "POCKET" ? "out of pocket" : e.paidFrom}</span>
                  {e.id.startsWith("sample-") && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">SAMPLE DATA</span>}
                </span>
                <span className="tabular font-semibold text-slate-900">{usdCents(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {hiddenCount > 0 && <p className="mt-1 text-xs text-slate-500">{hiddenCount} later bill{hiddenCount > 1 ? "s" : ""} will appear as the demo clock moves forward.</p>}
      </div>

      <button type="button" onClick={() => onChange(null)} className="mt-5 text-xs font-medium text-slate-500 underline">
        Reset tracker
      </button>
    </Shell>
  );
}

