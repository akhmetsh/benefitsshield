"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckoutModal } from "@/components/checkout-modal";
import { Copilot } from "@/components/copilot";
import { InputsPanel } from "@/components/inputs-panel";
import { Paywall } from "@/components/paywall";
import { LossVsSaved } from "@/components/loss-vs-saved";
import { PlanReport } from "@/components/plan-report";
import { ResultsPanel } from "@/components/results-panel";
import { auditBill, comparePlans } from "@/lib/engine/calculator";
import { usd } from "@/lib/format";
import { templateSummary } from "@/lib/llm/fallback";
import { formatPrice } from "@/lib/pricing";
import { SAMPLE_PERSONAS } from "@/lib/personas";
import { HOSPITAL_BILL, HOSPITAL_DEMAND, SAMPLE_CATCH_PLAN, SAMPLE_CATCH_YTD, billTotal } from "@/lib/sample-bills";
import {
  SummaryResponseSchema,
  UserInputSchema,
  PlanTierSchema,
  type CalculationResult,
  type PlanTier,
  type Purchase,
  type RetentionState,
  type UserInput,
} from "@/lib/schema";
import { clearApp, loadApp, saveApp } from "@/lib/storage";

const DEFAULT_PERSONA = SAMPLE_PERSONAS[0];
const CUSTOM = "custom";

type Computed =
  | { ok: true; result: CalculationResult; ms: number }
  | { ok: false; message: string };

function compute(input: UserInput): Computed {
  const start = performance.now();
  const parsed = UserInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }
  try {
    const result = comparePlans(parsed.data);
    return { ok: true, result, ms: performance.now() - start };
  } catch {
    return { ok: false, message: "These inputs could not be calculated. Check the numbers." };
  }
}

/** Template bullets render immediately; the server may upgrade the wording if an LLM key is set. */
function useBrief(result: CalculationResult | null) {
  const template = useMemo(() => (result ? templateSummary(result) : null), [result]);
  const [llm, setLlm] = useState<{ key: string; bullets: string[] } | null>(null);
  const llmOff = useRef(false);
  const key = useMemo(() => (result ? JSON.stringify(result) : ""), [result]);

  useEffect(() => {
    if (!result || llmOff.current) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    const debounce = setTimeout(async () => {
      try {
        const response = await fetch("/api/summary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(result),
          signal: controller.signal,
        });
        const parsed = SummaryResponseSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.source === "template") {
          llmOff.current = true;
          return;
        }
        setLlm({ key, bullets: parsed.data.bullets });
      } catch {
        // Timeout or network error: the template stays on screen.
      }
    }, 700);
    return () => {
      clearTimeout(debounce);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [result, key]);

  if (llm && llm.key === key) return { bullets: llm.bullets, source: "llm" as const };
  return { bullets: template ?? [], source: "template" as const };
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const JOURNEY = [
  { n: 1, title: "Compare 2027 plans", badge: "Free", body: "Exact net cost, employer HSA money and tax savings", target: "compare" },
  { n: 2, title: "Audit hospital bills", badge: "Pro", body: "Catch EOB overcharges, copy a dispute script", target: "shield" },
  { n: 3, title: "Year-round copilot", badge: "Pro", body: "Paycheck HSA setup and FSA deadline alerts", target: "shield" },
] as const;

export function Simulator() {
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA.id);
  const [input, setInput] = useState<UserInput>(DEFAULT_PERSONA.input);
  const [unlocked, setUnlocked] = useState(false);
  const [retention, setRetention] = useState<RetentionState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [auditsUsed, setAuditsUsed] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTier, setCheckoutTier] = useState<PlanTier>("annual");

  // Restore saved state, and finish a Stripe test checkout if we just came back from one.
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage is only readable after mount; reading it during render would cause a hydration mismatch */
  useEffect(() => {
    const saved = loadApp();
    if (saved) {
      setPersonaId(saved.personaId);
      setInput(saved.input);
      setUnlocked(saved.unlocked);
      setRetention(saved.retention);
      setPurchase(saved.purchase);
      setAuditsUsed(saved.auditsUsed);
    }
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("checkout") === "success" && sessionId) {
      fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
        .then((r) => r.json())
        .then((d: { paid?: boolean; tier?: string | null; amountCents?: number }) => {
          const tier = PlanTierSchema.safeParse(d.tier);
          if (d.paid && tier.success) {
            // Keep the email saved before the redirect; the server never saw it.
            setPurchase((prev) => ({
              tier: tier.data,
              email: prev?.email ?? "",
              amountCents: d.amountCents ?? 0,
              method: "stripe",
            }));
            setUnlocked(true);
            setNotice("Payment confirmed (Stripe test mode). Pro is unlocked.");
          } else {
            setNotice("We could not confirm that payment. Try again or use the Judge Demo Unlock.");
          }
        })
        .catch(() => setNotice("We could not confirm that payment. Try again or use the Judge Demo Unlock."));
    } else if (params.get("checkout") === "cancelled") {
      setNotice("Checkout cancelled. Nothing was charged.");
    }
    if (params.has("checkout")) window.history.replaceState(null, "", window.location.pathname);
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    saveApp({ version: 1, unlocked, personaId, input, retention: retention ? { ...retention, unlocked } : null, purchase, auditsUsed });
  }, [hydrated, unlocked, personaId, input, retention, purchase, auditsUsed]);

  const computed = useMemo(() => compute(input), [input]);
  const result = computed.ok ? computed.result : null;
  const brief = useBrief(result);

  const edit = useCallback((next: UserInput) => {
    setInput(next);
    setPersonaId(CUSTOM);
  }, []);

  const pickPersona = (id: string) => {
    const persona = SAMPLE_PERSONAS.find((p) => p.id === id);
    if (!persona) return;
    setPersonaId(persona.id);
    setInput(persona.input);
    setRetention(null);
  };

  const persona = SAMPLE_PERSONAS.find((p) => p.id === personaId);

  const openCheckout = (tier: PlanTier = "annual") => {
    setCheckoutTier(tier);
    setCheckoutOpen(true);
  };

  const completeDemoUnlock = (next: Purchase) => {
    setPurchase(next);
    setUnlocked(true);
    setCheckoutOpen(false);
    setNotice(`Shield unlocked: ${next.tier === "annual" ? "Annual" : "Single Audit"} at ${formatPrice(next.amountCents)} (demo, test card).`);
  };

  /** Saves the choice right now: the page is about to leave for Stripe. */
  const rememberBeforeStripe = (next: Purchase) => {
    setPurchase(next);
    saveApp({ version: 1, unlocked, personaId, input, retention, purchase: next, auditsUsed });
  };

  /** Presenter reset: clears saved state and replays the paywall without Incognito. */
  const lockDemo = () => {
    clearApp();
    setUnlocked(false);
    setPurchase(null);
    setAuditsUsed(0);
    setRetention(null);
    setCheckoutOpen(false);
    setPersonaId(DEFAULT_PERSONA.id);
    setInput(DEFAULT_PERSONA.input);
    setNotice("Demo locked. Saved state cleared; the paywall is ready to replay.");
  };

  const tier: PlanTier = purchase?.tier ?? "annual";

  // "Example catch" on the paywall: auditBill() on the fixed, labeled sample bill.
  const catchPreview = auditBill(SAMPLE_CATCH_PLAN, "SELF_ONLY", {
    billedAmount: billTotal(HOSPITAL_BILL),
    ytdPaid: SAMPLE_CATCH_YTD,
    demandedAmount: HOSPITAL_DEMAND,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
      <header className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-[#f6f8fb]/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-lg text-white">🛡</span>
            <span className="text-lg font-bold tracking-tight text-slate-900">BenefitsShield</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide ${persona ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900"}`}
            >
              {persona ? "SAMPLE US 2027 PLAN DATA" : "YOUR NUMBERS · US 2027 RULES"}
            </span>
            <button
              type="button"
              onClick={() => scrollToId("shield")}
              className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30"
            >
              <span aria-hidden>🛡️ </span>Bill Overcharge Shield
            </button>
            {unlocked && (
              <button
                type="button"
                onClick={lockDemo}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/50"
              >
                Reset demo
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="mt-6">
        <h1 className="max-w-4xl text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
          Pick the Cheapest 2027 Health Plan for Free. Catch Hospital Overcharges All Year.
        </h1>
        <p className="mt-3 max-w-3xl text-base text-slate-600 sm:text-lg">
          Compare HDHP + HSA vs. PPO using exact 2027 IRS math—then audit hospital bills for billing errors and protect expiring FSA funds.
        </p>
        <p className="mt-3 max-w-3xl text-xs text-slate-500">
          Educational estimates only. Not insurance, tax, medical or legal advice. BenefitsShield does not sell insurance.
        </p>

        <ol className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Your journey">
          {JOURNEY.map((step) => (
            <li key={step.n}>
              <button
                type="button"
                onClick={() => scrollToId(step.target)}
                className={`flex h-full w-full items-start gap-3 rounded-2xl border p-3 text-left transition hover:shadow-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/25 ${step.badge === "Free" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-500"}`}
              >
                <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${step.badge === "Free" ? "bg-emerald-700 text-white" : "bg-slate-900 text-white"}`}>{step.n}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                    {step.n}. {step.title}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${step.badge === "Free" ? "bg-emerald-700 text-white" : "bg-slate-900 text-white"}`}>{step.badge}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-600">{step.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Sample personas">
          {SAMPLE_PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pickPersona(p.id)}
              aria-pressed={personaId === p.id}
              className={`rounded-xl border px-4 py-2 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/25 ${personaId === p.id ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-emerald-600"}`}
            >
              {p.label}
              <span className={`ml-2 text-[10px] font-bold ${personaId === p.id ? "text-emerald-100" : "text-amber-700"}`}>SAMPLE DATA</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPersonaId(CUSTOM)}
            aria-pressed={personaId === CUSTOM}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/25 ${personaId === CUSTOM ? "border-sky-700 bg-sky-700 text-white" : "border-dashed border-slate-400 bg-white text-slate-700 hover:border-sky-600"}`}
          >
            Use my own numbers
          </button>
        </div>
        {persona && <p className="mt-3 max-w-3xl text-sm text-slate-600">{persona.story}</p>}
        {notice && (
          <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {notice}
          </p>
        )}
      </section>

      <main id="compare" className="mt-8 grid scroll-mt-20 gap-6 lg:grid-cols-12">
        <div className="order-2 lg:order-1 lg:col-span-5">
          <InputsPanel input={input} onChange={edit} />
        </div>
        <div className="order-1 lg:order-2 lg:col-span-7">
          <div className="lg:sticky lg:top-4">
            {computed.ok ? (
              <ResultsPanel result={computed.result} bullets={brief.bullets} briefSource={brief.source} computeMs={hydrated ? computed.ms : null} />
            ) : (
              <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
                {computed.message}
              </div>
            )}
          </div>
        </div>
      </main>

      {result && (
        <div className="mt-10 space-y-6">
          <LossVsSaved result={result} unlocked={unlocked} onActivate={() => openCheckout("annual")} />
          <div id="shield" className="scroll-mt-20">
          {unlocked ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm text-emerald-950">
                  <span className="font-bold">{tier === "annual" ? "Annual Shield active" : "Single Audit active"}</span>
                  {purchase && <span className="text-emerald-800"> · {formatPrice(purchase.amountCents)} · {purchase.email || "no email"}</span>}
                </p>
                <button type="button" onClick={lockDemo} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/20">
                  Lock Demo (Replay Paywall)
                </button>
              </div>
              <Copilot
                tier={tier}
                auditsUsed={auditsUsed}
                onScanComplete={() => setAuditsUsed((n) => n + 1)}
                onUpgrade={() => openCheckout("annual")}
                input={input}
                result={result}
                retention={retention}
                onChange={setRetention}
              />
            </div>
          ) : (
            <Paywall onActivate={() => openCheckout("annual")} catchPreview={catchPreview} />
          )}
          </div>
          <PlanReport input={input} result={result} />
        </div>
      )}

      {result && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold text-slate-900">{result.plans[0].planName} · saves {usd(result.savingsVsNextBest)}/yr</span>
            {!unlocked && (
              <button type="button" onClick={() => openCheckout("annual")} className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">
                Activate Shield
              </button>
            )}
          </div>
        </div>
      )}

      {checkoutOpen && (
        <CheckoutModal
          initialTier={checkoutTier}
          initialEmail={purchase?.email ?? ""}
          onClose={() => setCheckoutOpen(false)}
          onDemoUnlock={completeDemoUnlock}
          onBeforeStripe={rememberBeforeStripe}
        />
      )}

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500">
        <p>
          Educational simulation using 2027 IRS rules — not licensed financial, tax, or medical advice. Zero PII is collected or stored on our servers; an optional email stays in your browser.
        </p>
        <p className="mt-1">
          Educational estimates only. Not insurance, tax, medical or legal advice. BenefitsShield does not sell insurance. Your numbers stay in this browser.
        </p>
      </footer>
    </div>
  );
}
