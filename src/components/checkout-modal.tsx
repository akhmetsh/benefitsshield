"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice, priceCents } from "@/lib/pricing";
import type { PlanTier, Purchase } from "@/lib/schema";

interface Props {
  initialTier: PlanTier;
  initialEmail: string;
  onClose: () => void;
  /** Judge demo unlock: the parent saves the purchase and unlocks. */
  onDemoUnlock: (purchase: Purchase) => void;
  /** Called right before redirecting to Stripe so the choice survives the round trip. */
  onBeforeStripe: (purchase: Purchase) => void;
}

const DEMO_EMAIL = "maya@example.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TIER_INFO: Record<PlanTier, { label: string; title: string; features: string; suffix: string }> = {
  single: {
    label: "Entry offer",
    title: "Single Bill Overcharge Audit (One-Time)",
    features: "Includes 1 hospital bill EOB audit + dispute script.",
    suffix: " one-time",
  },
  annual: {
    label: "Core subscription",
    title: "Full 2027 Overcharge Shield + Year-Round Copilot (Annual)",
    features: "Unlimited bill audits, 26-paycheck HSA/FSA setup, deductible tracker & FSA deadline alerts.",
    suffix: "/year",
  },
};

export function CheckoutModal({ initialTier, initialEmail, onClose, onDemoUnlock, onBeforeStripe }: Props) {
  const [tier, setTier] = useState<PlanTier>(initialTier);
  const [email, setEmail] = useState(initialEmail);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

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

  // Lock page scroll and move focus into the dialog.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const buildPurchase = (method: Purchase["method"]): Purchase | null => {
    const trimmed = email.trim();
    if (trimmed && !EMAIL_PATTERN.test(trimmed)) {
      setError("That email doesn't look right. Fix it or leave it blank.");
      return null;
    }
    setError(null);
    return {
      tier,
      email: trimmed || (method === "demo" ? DEMO_EMAIL : ""),
      amountCents: priceCents(tier),
      method,
    };
  };

  const demoUnlock = () => {
    const purchase = buildPurchase("demo");
    if (purchase) onDemoUnlock(purchase);
  };

  const stripeCheckout = async () => {
    const purchase = buildPurchase("stripe");
    if (!purchase) return;
    setBusy(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = (await response.json()) as { url?: string };
      if (!response.ok || !data.url) throw new Error("checkout failed");
      onBeforeStripe(purchase);
      window.location.assign(data.url);
    } catch {
      setError("Stripe checkout could not start. Use the Judge Demo Unlock instead.");
      setBusy(false);
    }
  };

  const selectedPrice = formatPrice(priceCents(tier));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">BenefitsShield Pro</p>
            <h2 id="checkout-title" className="text-xl font-bold text-slate-900">Activate your 2027 Shield</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-2xl leading-none text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300">
            ×
          </button>
        </div>

        <div className="space-y-5 p-5">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Choose a plan</legend>
            {(["single", "annual"] as const).map((t) => {
              const selected = tier === t;
              const info = TIER_INFO[t];
              return (
                <label key={t} className={`relative flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-4 transition ${selected ? "border-emerald-600 bg-emerald-50" : "border-slate-200 hover:border-slate-400"} ${t === "annual" ? "sm:order-2" : "sm:order-1"}`}>
                  <input type="radio" name="tier" value={t} checked={selected} onChange={() => setTier(t)} className="absolute left-3 top-3 h-4 w-4 accent-emerald-700" />
                  {t === "annual" && <span className="absolute -top-3 right-3 rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Recommended</span>}
                  <span className="pl-6 text-xs font-bold uppercase text-slate-500">{info.label}</span>
                  <span className="text-sm font-semibold text-slate-900">{info.title}</span>
                  <span className="tabular text-2xl font-extrabold text-slate-900">
                    {formatPrice(priceCents(t))}
                    <span className="text-base font-bold">{info.suffix}</span>
                  </span>
                  <span className="text-xs text-slate-600">{info.features}</span>
                </label>
              );
            })}
          </fieldset>

          <div>
            <label htmlFor="checkout-email" className="text-sm font-medium text-slate-800">
              Email for your receipt (optional)
            </label>
            <input
              id="checkout-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={DEMO_EMAIL}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            />
            <p className="mt-1 text-xs text-slate-500">Stored locally in your browser only • Zero PII sent to server</p>
          </div>

          {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}

          <div className="space-y-3">
            <button type="button" onClick={demoUnlock} className="w-full rounded-xl bg-emerald-700 px-4 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30">
              Judge Demo Unlock (1-Click) · {selectedPrice} · Test Card 4242 •••• 4242
            </button>
            {stripeReady ? (
              <button type="button" onClick={stripeCheckout} disabled={busy} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/40">
                {busy ? "Opening Stripe…" : `Continue to Stripe Checkout (Test Mode) · ${selectedPrice}`}
              </button>
            ) : (
              <p className="text-xs text-slate-500">
                {stripeReady === null ? "Checking payment options…" : "Stripe test checkout isn't configured on this deployment. Use the Judge Demo Unlock."}
              </p>
            )}
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
              Stripe test card <span className="tabular font-mono font-semibold">4242 4242 4242 4242</span>, any future expiry, any CVC. No real charge.
            </p>
          </div>

          <p className="text-center text-[11px] text-slate-400">
            Prices in USD: {formatPrice(priceCents("annual"))}/year core subscription · {formatPrice(priceCents("single"))} one-time single bill audit. Educational estimates only.
          </p>
        </div>
      </div>
    </div>
  );
}
