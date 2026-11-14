"use client";

import { useEffect, useRef, useState } from "react";
import { auditBill, getTierTerms } from "@/lib/engine/calculator";
import { buildDisputeScript } from "@/lib/dispute";
import { usd, usdCents } from "@/lib/format";
import { HOSPITAL_BILL, HOSPITAL_DEMAND, URGENT_BILL, billTotal, type SampleBill } from "@/lib/sample-bills";
import type { CoverageTier, HealthPlan } from "@/lib/schema";

interface Props {
  plan: HealthPlan;
  tier: CoverageTier;
  /** Logs the verified share to the tracker. Undefined until the tracker is started. */
  onLog?: (amount: number, description: string) => void;
  /** Max audits for this tier (1 for the Single Audit). Undefined means unlimited. */
  scansLimit?: number;
  scansUsed: number;
  onScanComplete: () => void;
  onUpgrade: () => void;
  /** Shown instead of the log button when there is no tracker to log into. */
  noTrackerHint: string;
}

const SCAN_MS = 1_200;
const ACCEPTED = /\.(pdf|jpe?g|png)$/i;

interface Statement {
  facility: string;
  lineItems: SampleBill["lineItems"] | null;
  billed: number;
  ytd: number;
  demanded: number;
  kind: "sample" | "upload" | "custom";
}

function NumberBox({ id, label, value, onChange, hint }: { id: string; label: string; value: number; onChange: (n: number) => void; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-slate-700">{label}</label>
      <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white px-2 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
        <span className="text-sm text-slate-500">$</span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={1_000_000}
          step={10}
          value={Math.round(value * 100) / 100}
          onChange={(e) => onChange(Math.min(1_000_000, Math.max(0, Number(e.target.value) || 0)))}
          className="tabular w-full bg-transparent px-1 py-2 text-sm outline-none"
        />
      </div>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function BillScanner({ plan, tier, onLog, scansLimit, scansUsed, onScanComplete, onUpgrade, noTrackerHint }: Props) {
  const exhausted = scansLimit !== undefined && scansUsed >= scansLimit;
  const terms = getTierTerms(plan, tier);
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [logged, setLogged] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const fairDemand = () =>
    auditBill(plan, tier, { billedAmount: billTotal(URGENT_BILL), ytdPaid: 0, demandedAmount: 0 }).legalShare;

  const scan = (build: () => Statement) => {
    timers.current.forEach(clearTimeout);
    setPhase("scanning");
    setProgress(0);
    setLogged(false);
    setCopied(false);
    timers.current = [
      setTimeout(() => setProgress(100), 30),
      setTimeout(() => {
        setStatement(build());
        setPhase("done");
        onScanComplete();
      }, SCAN_MS),
    ];
  };

  const simulateHospital = () =>
    scan(() => ({ facility: HOSPITAL_BILL.facility, lineItems: HOSPITAL_BILL.lineItems, billed: billTotal(HOSPITAL_BILL), ytd: terms.deductible, demanded: HOSPITAL_DEMAND, kind: "sample" }));

  const simulateUrgent = () =>
    scan(() => ({ facility: URGENT_BILL.facility, lineItems: URGENT_BILL.lineItems, billed: billTotal(URGENT_BILL), ytd: 0, demanded: fairDemand(), kind: "sample" }));

  const handleFile = (file: File | undefined) => {
    setDragging(false);
    if (!file) return;
    if (!ACCEPTED.test(file.name)) {
      setFileError("Use a PDF, JPG or PNG.");
      return;
    }
    setFileError(null);
    // The file is never read or uploaded. The scan below is a simulation that loads the demo statement.
    simulateHospital();
  };

  const startManual = () =>
    scan(() => ({ facility: "Your statement", lineItems: null, billed: 1_000, ytd: 0, demanded: 1_000, kind: "custom" }));

  const edit = (patch: Partial<Pick<Statement, "billed" | "ytd" | "demanded">>) => {
    setLogged(false);
    setCopied(false);
    setStatement((s) => (s ? { ...s, ...patch, lineItems: patch.billed !== undefined ? null : s.lineItems, kind: "custom" } : s));
  };

  const bill = statement ? { billedAmount: statement.billed, ytdPaid: statement.ytd, demandedAmount: statement.demanded } : null;
  const audit = bill ? auditBill(plan, tier, bill) : null;
  const script = bill && audit ? buildDisputeScript(plan, terms, bill, audit) : "";

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script);
    } catch {
      const area = document.createElement("textarea");
      area.value = script;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    timers.current.push(setTimeout(() => setCopied(false), 2_500));
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Billing error shield</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Medical Bill / EOB Overcharge Scanner</h2>
          {scansLimit !== undefined && <p className="mt-1 text-xs text-slate-500">Single Audit: {Math.max(0, scansLimit - scansUsed)} of {scansLimit} audit left</p>}
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold tracking-wide text-white">
          CLIENT-SIDE BILL SIMULATOR • ZERO PII STORED
        </span>
      </div>

      {exhausted ? (
        <div className="mt-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-950">Your Single Bill Audit is used.</p>
          <p className="mt-1 text-sm text-emerald-900">Upgrade to the Annual Shield for unlimited bill audits, paycheck setup and the year-round tracker.</p>
          <button type="button" onClick={onUpgrade} className="mt-3 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">
            Upgrade to the Annual Shield
          </button>
        </div>
      ) : (
        <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a hospital bill PDF or JPG, or press Enter to choose a file"
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        className={`mt-4 cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/25 ${dragging ? "border-emerald-600 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:border-emerald-600"}`}
      >
        <p className="text-sm font-medium text-slate-800">Drop hospital bill PDF/JPG or click a sample bill below to simulate OCR extraction</p>
        <p className="mt-1 text-xs text-slate-500">Nothing is uploaded or read. The scan below is a simulation.</p>
        <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {fileError && <p role="alert" className="mt-2 text-sm text-red-700">{fileError}</p>}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={simulateHospital} disabled={phase === "scanning"} className="rounded-xl bg-red-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/30">
          Simulate Upload: Overcharged Hospital EOB ({usd(billTotal(HOSPITAL_BILL))} billed / {usd(HOSPITAL_DEMAND)} demanded)
        </button>
        <button type="button" onClick={simulateUrgent} disabled={phase === "scanning"} className="rounded-xl bg-emerald-700 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30">
          Simulate Upload: Fair Urgent Care Bill ({usd(billTotal(URGENT_BILL))} billed / {usd(fairDemand())} demanded)
        </button>
      </div>
      <button type="button" onClick={startManual} disabled={phase === "scanning"} className="mt-2 text-xs font-medium text-slate-600 underline disabled:opacity-60">
        Or type my own bill numbers
      </button>

        </>
      )}

      {phase === "scanning" && (
        <div className="mt-5 rounded-xl bg-slate-900 p-4 text-white" role="status">
          <p className="text-sm font-medium">Scanning EOB line items &amp; checking 2027 plan rules…</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${progress}%`, transition: `width ${SCAN_MS}ms linear` }} />
          </div>
        </div>
      )}

      {phase === "done" && statement && audit && (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Extracted Hospital Statement</h3>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                {statement.kind === "custom" ? "YOUR NUMBERS" : "SAMPLE DATA · SIMULATED OCR"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{statement.facility}</p>
            {statement.lineItems && (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {statement.lineItems.map((item) => (
                  <li key={item.cpt} className="flex justify-between gap-3 py-1.5">
                    <span className="text-slate-700">{item.description} <span className="text-xs text-slate-400">CPT {item.cpt}</span></span>
                    <span className="tabular text-slate-900">{usdCents(item.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <NumberBox id="bill-billed" label="Total billed" value={statement.billed} onChange={(n) => edit({ billed: n })} />
              <NumberBox id="bill-ytd" label="YTD deductible already paid" value={statement.ytd} onChange={(n) => edit({ ytd: n })} hint={`Plan deductible ${usd(terms.deductible)}`} />
              <NumberBox id="bill-demand" label="Clinic amount demanded" value={statement.demanded} onChange={(n) => edit({ demanded: n })} />
            </div>
          </div>

          <div
            role="alert"
            className={`rounded-2xl px-4 py-3 text-base font-bold ${audit.verdict === "OVERCHARGE" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`}
          >
            {audit.verdict === "OVERCHARGE"
              ? `🚨 OVERCHARGE DETECTED: Clinic is trying to overcharge you by ${usdCents(audit.overcharge)} — Keep ${usdCents(audit.overcharge)} in your pocket`
              : "✅ FAIR BILL: Matches your plan rules"}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-red-800">Clinic Demands You Pay</p>
              <p className="tabular mt-1 text-3xl font-bold text-red-700">{usdCents(statement.demanded)}</p>
              {audit.findings.length > 0 ? (
                <ul className="mt-3 space-y-1.5 text-sm text-red-900">
                  {audit.findings.map((f) => (
                    <li key={f} className="flex gap-2"><span aria-hidden>✕</span><span>{f}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-700">No billing errors found.</p>
              )}
            </div>
            <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-900">Your True Legal Share</p>
              <p className="tabular mt-1 text-3xl font-bold text-emerald-700">{usdCents(audit.legalShare)}</p>
              <dl className="mt-3 space-y-1 text-sm text-emerald-950">
                <div className="flex justify-between gap-3"><dt>Deductible left before this bill</dt><dd className="tabular">{usdCents(audit.remainingDeductible)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Paid toward deductible</dt><dd className="tabular">{usdCents(audit.deductiblePortion)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Coinsurance ({Math.round(plan.coinsuranceRate * 100)}%)</dt><dd className="tabular">{usdCents(audit.coinsurancePortion)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Out-of-pocket max left</dt><dd className="tabular">{usdCents(audit.remainingOopMax)}</dd></div>
              </dl>
              {audit.cappedByOopMax && <p className="mt-2 text-xs text-emerald-900">Capped by your out-of-pocket maximum.</p>}
              <p className="mt-2 text-xs text-slate-600">Using {plan.name}.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {audit.verdict === "OVERCHARGE" && (
              <button type="button" onClick={copyScript} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-400/40">
                {copied ? "Copied ✓" : "Copy Billing Dispute Script"}
              </button>
            )}
            {onLog ? (
              <button
                type="button"
                disabled={logged}
                onClick={() => { onLog(audit.legalShare, `Verified bill: ${statement.facility}`); setLogged(true); }}
                className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30"
              >
                {logged ? "Logged to tracker ✓" : `+ Log Verified Share (${usdCents(audit.legalShare)}) to YTD Tracker`}
              </button>
            ) : (
              <p className="self-center text-xs text-slate-500">{noTrackerHint}</p>
            )}
          </div>
          {audit.verdict === "OVERCHARGE" && (
            <details className="rounded-xl bg-slate-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">Preview dispute script</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-slate-700">{script}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
