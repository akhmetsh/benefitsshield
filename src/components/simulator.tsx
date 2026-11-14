"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copilot } from "@/components/copilot";
import { InputsPanel } from "@/components/inputs-panel";
import { Paywall } from "@/components/paywall";
import { LossVsSaved } from "@/components/loss-vs-saved";
import { PlanReport } from "@/components/plan-report";
import { ResultsPanel } from "@/components/results-panel";
import { comparePlans } from "@/lib/engine/calculator";
import { usd } from "@/lib/format";
import { templateSummary } from "@/lib/llm/fallback";
import { SAMPLE_PERSONAS } from "@/lib/personas";
import {
  SummaryResponseSchema,
  UserInputSchema,
  type CalculationResult,
  type RetentionState,
  type UserInput,
} from "@/lib/schema";
import { loadApp, saveApp } from "@/lib/storage";

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

/** Sticky mobile summary: a link to the paywall while locked, plain text once unlocked. */
function Bar({ href, className, children }: { href?: string; className: string; children: React.ReactNode }) {
  return href ? (
    <a href={href} className={className}>{children}</a>
  ) : (
    <div className={className}>{children}</div>
  );
}

export function Simulator() {
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA.id);
  const [input, setInput] = useState<UserInput>(DEFAULT_PERSONA.input);
  const [unlocked, setUnlocked] = useState(false);
  const [retention, setRetention] = useState<RetentionState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Restore saved state, and finish a Stripe test checkout if we just came back from one.
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage is only readable after mount; reading it during render would cause a hydration mismatch */
  useEffect(() => {
    const saved = loadApp();
    if (saved) {
      setPersonaId(saved.personaId);
      setInput(saved.input);
      setUnlocked(saved.unlocked);
      setRetention(saved.retention);
    }
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("checkout") === "success" && sessionId) {
      fetch(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`)
        .then((r) => r.json())
        .then((d: { paid?: boolean }) => {
          if (d.paid) {
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
    saveApp({ version: 1, unlocked, personaId, input, retention: retention ? { ...retention, unlocked } : null });
  }, [hydrated, unlocked, personaId, input, retention]);

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
  const unlock = () => setUnlocked(true);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-700 text-lg text-white">🛡</span>
          <span className="text-lg font-bold tracking-tight text-slate-900">BenefitsShield</span>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide ${persona ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900"}`}
        >
          {persona ? "SAMPLE US 2027 PLAN DATA" : "YOUR NUMBERS · US 2027 RULES"}
        </span>
      </header>

      <section className="mt-6">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl">
          HDHP + HSA or PPO? See which one really costs you less in 2027.
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Premiums, expected care, employer HSA money and tax savings, netted out in dollars. No login. Change any number and the answer updates instantly.
        </p>
        <p className="mt-3 max-w-3xl text-xs text-slate-500">
          Educational estimates only. Not insurance, tax, medical or legal advice. BenefitsShield does not sell insurance.
        </p>

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

      <main className="mt-8 grid gap-6 lg:grid-cols-12">
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
          <LossVsSaved result={result} unlocked={unlocked} />
          <PlanReport input={input} result={result} />
          {unlocked ? (
            <Copilot input={input} result={result} retention={retention} onChange={setRetention} />
          ) : (
            <Paywall onUnlock={unlock} />
          )}
        </div>
      )}

      {result && (
        <Bar
          href={unlocked ? undefined : "#unlock"}
          className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
        >
          <span className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold text-slate-900">{result.plans[0].planName}</span>
            <span className="tabular shrink-0 font-bold text-emerald-700">saves {usd(result.savingsVsNextBest)}/yr</span>
          </span>
        </Bar>
      )}

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500">
        <p>
          Educational simulation using 2027 IRS rules — not licensed financial, tax, or medical advice. Zero PII is collected or stored.
        </p>
        <p className="mt-1">
          Educational estimates only. Not insurance, tax, medical or legal advice. BenefitsShield does not sell insurance. Your numbers stay in this browser.
        </p>
      </footer>
    </div>
  );
}
