"use client";

import { usd } from "@/lib/format";
import { HOSPITAL_BILL, HOSPITAL_DEMAND, SAMPLE_CATCH_PLAN, SAMPLE_CATCH_YTD, billTotal } from "@/lib/sample-bills";
import type { BillAudit } from "@/lib/engine/calculator";
import { REGULAR_PRICE_CENTS, formatPrice, priceCents } from "@/lib/pricing";

interface Props {
  onActivate: () => void;
  /** Engine audit of the sample overcharged hospital bill on the user's plan. */
  catchPreview: BillAudit | null;
}

const FEATURES = [
  {
    title: "Medical Bill / EOB Overcharge Scanner",
    body: "Check any hospital bill against your plan's deductible, coinsurance and out-of-pocket max, then copy a dispute script.",
  },
  {
    title: "Biweekly paycheck setup",
    body: "The exact HSA and FSA amount for each of your 26 paychecks to use your 2027 IRS limits.",
  },
  {
    title: "Deductible & FSA copilot",
    body: "Log bills all year, watch the deductible fill, and get an FSA use-it-or-lose-it countdown with a calendar reminder.",
  },
];

/** Inline preview of Pro. The button opens the checkout modal. */
export function Paywall({ onActivate, catchPreview }: Props) {
  const offer = priceCents("annual", { timerActive: true, exitClaimed: false });
  return (
    <section id="unlock" className="scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-md sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">BenefitsShield Pro · Medical Bill Overcharge Shield &amp; Copilot</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Protect Your 2027 Savings from Hospital Billing Errors</h2>
        </div>
        <p className="tabular text-slate-900">
          <span className="mr-2 text-lg text-slate-400 line-through">{formatPrice(REGULAR_PRICE_CENTS.annual)}</span>
          <span className="text-4xl font-bold">{formatPrice(offer)}</span>
          <span className="text-lg text-slate-600">/yr</span>
          <span className="ml-2 block text-xs text-slate-500 sm:inline">USD · 50% launch offer</span>
        </p>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <li key={f.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span aria-hidden>🔒</span>
              {f.title}
            </p>
            <p className="mt-1 text-sm text-slate-600">{f.body}</p>
          </li>
        ))}
      </ul>

      {catchPreview && catchPreview.overcharge > 0 && (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-emerald-500 bg-emerald-50 p-4" aria-label="Real catch preview">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-900">Example catch <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">Sample bill</span></p>
          <p className="mt-1 text-sm font-medium text-emerald-950">
            {usd(billTotal(HOSPITAL_BILL))} hospital bill with {usd(HOSPITAL_DEMAND)} demanded, {usd(SAMPLE_CATCH_YTD)} deductible already met, {Math.round(SAMPLE_CATCH_PLAN.coinsuranceRate * 100)}% coinsurance →{" "}
            <span className="font-extrabold text-emerald-700">Shield blocks {usd(catchPreview.overcharge)} overcharge</span>
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onActivate}
        className="mt-6 w-full rounded-xl bg-emerald-700 px-5 py-4 text-base font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30 sm:w-auto"
      >
        Activate 2027 Shield
      </button>
      <p className="mt-3 text-xs text-slate-500">Or start with a single bill audit. Test mode: card 4242 4242 4242 4242.</p>
    </section>
  );
}
