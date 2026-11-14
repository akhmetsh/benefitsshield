"use client";

import { useEffect, useState } from "react";

interface Props {
  onUnlock: () => void;
}

const FEATURES = [
  {
    title: "4-scenario stress matrix",
    body: "Your net cost on both plans in a $650, $2,200, $14,000 and $45,000 medical year.",
  },
  {
    title: "2027 IRS tax shield",
    body: "Federal, state and FICA savings from your HSA and FSA, with the 2027 limits applied.",
  },
  {
    title: "Post-enrollment copilot",
    body: "Deductible tracker, expense log and an FSA use-it-or-lose-it countdown with a calendar reminder.",
  },
];

export function Paywall({ onUnlock }: Props) {
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : { stripe: false }))
      .then((c: { stripe?: boolean }) => !cancelled && setStripeReady(Boolean(c.stripe)))
      .catch(() => !cancelled && setStripeReady(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const startCheckout = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", { method: "POST" });
      const data = (await response.json()) as { url?: string };
      if (!response.ok || !data.url) throw new Error("checkout failed");
      window.location.assign(data.url);
    } catch {
      setError("Stripe checkout could not start. Use the Judge Demo Unlock below.");
      setBusy(false);
    }
  };

  return (
    <section id="unlock" className="scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-md sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">BenefitsShield Pro</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Unlock your full plan</h2>
        </div>
        <p className="text-slate-900">
          <span className="text-4xl font-bold">$39</span>
          <span className="text-lg text-slate-600">/yr</span>
          <span className="ml-2 text-xs text-slate-500">USD · billed yearly</span>
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

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Reviewing this project?</p>
          <p className="mt-1 text-sm text-emerald-900/80">No setup or card needed. Unlocks every Pro feature in one click.</p>
          <button
            type="button"
            onClick={onUnlock}
            className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30"
          >
            Judge Demo Unlock (Test Card: 4242 •••• 4242)
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">Pay with Stripe (test mode)</p>
          {stripeReady ? (
            <>
              <button
                type="button"
                onClick={startCheckout}
                disabled={busy}
                className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/40"
              >
                {busy ? "Opening Stripe…" : "Pay $39 with Stripe"}
              </button>
              {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              {stripeReady === null ? "Checking payment options…" : "Stripe test checkout is not configured on this deployment. Use the Judge Demo Unlock."}
            </p>
          )}
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
            Test card <span className="tabular font-mono font-semibold">4242 4242 4242 4242</span>, any future expiry, any CVC. No real charge.
          </p>
        </div>
      </div>
    </section>
  );
}
