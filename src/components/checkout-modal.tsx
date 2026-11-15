"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  OFFER_DURATION_MS,
  REGULAR_PRICE_CENTS,
  formatCountdown,
  formatPrice,
  priceCents,
  remainingMs,
} from "@/lib/pricing";
import type { PlanTier, Purchase } from "@/lib/schema";

interface Props {
  /** Epoch ms when the 10-minute offer ends. Set by the parent on first open. */
  deadline: number;
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

const TIER_INFO: Record<PlanTier, { title: string; features: string }> = {
  single: {
    title: "Single Bill Overcharge Audit (One-Time)",
    features: "Includes 1 hospital bill EOB audit + dispute script.",
  },
  annual: {
    title: "Full 2027 Overcharge Shield + Year-Round Copilot (Annual)",
    features: "Unlimited bill audits, 26-paycheck HR setup, deductible tracker & FSA rescue alerts.",
  },
};

function Price({ tier, timerActive, exitClaimed }: { tier: PlanTier; timerActive: boolean; exitClaimed: boolean }) {
  const was = priceCents(tier, { timerActive: false, exitClaimed: false });
  const now = priceCents(tier, { timerActive, exitClaimed });
  const suffix = tier === "annual" ? "/yr" : "";
  return (
    <span className="tabular flex items-baseline gap-2">
      {now !== was && <span className="text-sm text-slate-400 line-through">{formatPrice(was)}{suffix}</span>}
      <span className="text-2xl font-extrabold text-slate-900">{formatPrice(now)}<span className="text-base font-bold">{suffix}</span></span>
    </span>
  );
}

export function CheckoutModal({ deadline, initialTier, initialEmail, onClose, onDemoUnlock, onBeforeStripe }: Props) {
  const [tier, setTier] = useState<PlanTier>(initialTier);
  const [email, setEmail] = useState(initialEmail);
  const [view, setView] = useState<"offer" | "exit">("offer");
  const [exitSeen, setExitSeen] = useState(false);
  const [remaining, setRemaining] = useState(OFFER_DURATION_MS);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Live countdown. Prices flip back to regular the moment it reaches 00:00.
  useEffect(() => {
    const tick = () => setRemaining(remainingMs(deadline, Date.now()));
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [deadline]);

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

  const timerActive = remaining > 0;
  const ctx = { timerActive, exitClaimed: view === "exit" };

  /** First close on the main offer becomes the exit-intent step. */
  const requestClose = useCallback(() => {
    if (view === "offer" && !exitSeen) {
      setExitSeen(true);
      setView("exit");
      return;
    }
    onClose();
  }, [view, exitSeen, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

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
      amountCents: priceCents(tier, ctx),
      method,
      timerActive: ctx.timerActive,
      exitClaimed: ctx.exitClaimed,
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
        body: JSON.stringify({ tier, timerActive: ctx.timerActive, exitClaimed: ctx.exitClaimed }),
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

  const stripeButton = (label: string, className: string) =>
    stripeReady ? (
      <button type="button" onClick={stripeCheckout} disabled={busy} className={className}>
        {busy ? "Opening Stripe…" : label}
      </button>
    ) : (
      <p className="text-xs text-slate-500">
        {stripeReady === null ? "Checking payment options…" : "Stripe test checkout isn't configured on this deployment. Use the Judge Demo Unlock."}
      </p>
    );

  const selectedPrice = formatPrice(priceCents(tier, ctx));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
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
            <h2 id="checkout-title" className="text-xl font-bold text-slate-900">
              {view === "exit" ? "Wait — Claim an Extra 25% Off Before You Go" : "Activate your 2027 Shield"}
            </h2>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-2xl leading-none text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300">
            ×
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div role="timer" aria-live="off" className={`rounded-xl px-4 py-3 text-center text-sm font-extrabold tracking-wide ${timerActive ? "bg-red-600 text-white" : "bg-slate-200 text-slate-700"}`}>
            {timerActive ? `LAUNCH OFFER (DEMO): 50% OFF APPLIED FOR THE NEXT ${formatCountdown(remaining)}` : "OFFER ENDED — REGULAR PRICES APPLY (00:00)"}
          </div>

          {view === "offer" ? (
            <>
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Choose a plan</legend>
                {(["single", "annual"] as const).map((t) => {
                  const selected = tier === t;
                  return (
                    <label key={t} className={`relative flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-4 transition ${selected ? "border-emerald-600 bg-emerald-50" : "border-slate-200 hover:border-slate-400"} ${t === "annual" ? "sm:order-2" : "sm:order-1"}`}>
                      <input type="radio" name="tier" value={t} checked={selected} onChange={() => setTier(t)} className="absolute left-3 top-3 h-4 w-4 accent-emerald-700" />
                      {t === "annual" && <span className="absolute -top-3 right-3 rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Recommended</span>}
                      <span className="pl-6 text-xs font-bold uppercase text-slate-500">{t === "annual" ? "Option B" : "Option A"}</span>
                      <span className="text-sm font-semibold text-slate-900">{TIER_INFO[t].title}</span>
                      <Price tier={t} timerActive={timerActive} exitClaimed={false} />
                      <span className="text-xs text-slate-600">{TIER_INFO[t].features}</span>
                    </label>
                  );
                })}
              </fieldset>

              <div>
                <label htmlFor="checkout-email" className="text-sm font-medium text-slate-800">
                  Where should we send your 2027 Shield summary &amp; FSA deadline reminders?
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
                {stripeButton(`Continue to Stripe Checkout (Test Mode) · ${selectedPrice}`, "w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/40")}
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
                  Stripe test card <span className="tabular font-mono font-semibold">4242 4242 4242 4242</span>, any future expiry, any CVC. No real charge.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-4 rounded-2xl bg-slate-950 p-5 text-white">
              <p className="text-sm text-slate-300">Your 50% launch offer is still on the table. Take another 25% off, right now.</p>
              <ul className="space-y-2">
                {(["annual", "single"] as const).map((t) => {
                  const before = priceCents(t, { timerActive, exitClaimed: false });
                  const after = priceCents(t, { timerActive, exitClaimed: true });
                  return (
                    <li key={t}>
                      <button type="button" onClick={() => setTier(t)} aria-pressed={tier === t} className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left ${tier === t ? "border-emerald-400 bg-emerald-950" : "border-slate-700"}`}>
                        <span className="text-sm font-semibold">{t === "annual" ? "Annual Shield + Copilot" : "Single Bill Audit"}</span>
                        <span className="tabular text-right">
                          <span className="mr-2 text-sm text-slate-400 line-through">{formatPrice(before)}{t === "annual" ? "/yr" : ""}</span>
                          <span className="text-2xl font-extrabold text-emerald-300">{formatPrice(after)}{t === "annual" ? "/yr" : ""}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {error && <p role="alert" className="text-sm font-medium text-red-300">{error}</p>}
              <button
                type="button"
                onClick={demoUnlock}
                className="w-full rounded-xl bg-emerald-400 px-4 py-4 text-base font-extrabold text-slate-950 hover:bg-emerald-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/50"
              >
                Claim Extra 25% Off &amp; Unlock · {selectedPrice}
              </button>
              <div className="text-slate-200">
                {stripeButton(`Pay ${selectedPrice} with Stripe (Test Mode) instead`, "w-full rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60")}
              </div>
              <p className="text-center text-xs text-slate-400">Test card 4242 4242 4242 4242 · any future date · any CVC</p>
              <div className="text-center">
                <button type="button" onClick={onClose} className="text-xs text-slate-400 underline hover:text-slate-200">
                  No thanks, return to free simulator
                </button>
              </div>
            </div>
          )}

          <p className="text-center text-[11px] text-slate-400">
            Regular prices: {formatPrice(REGULAR_PRICE_CENTS.single)} single audit · {formatPrice(REGULAR_PRICE_CENTS.annual)}/yr annual. Educational estimates only.
          </p>
        </div>
      </div>
    </div>
  );
}
