/**
 * BenefitsShield unit economics for the deck.
 * Run: npx tsx scripts/unit-economics.ts
 *
 * Every number traces to a cited benchmark or a value labeled ASSUMPTION.
 * Prints a markdown report and writes the same text to docs/unit-economics.md.
 * Not part of the app: no engine or UI code is imported.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Cited benchmarks (only the ones provided; url null = source named but no link supplied)
// ---------------------------------------------------------------------------

interface Benchmark {
  label: string;
  value: string;
  source: string;
  url: string | null;
}

const B = {
  renewalHealthFitness: { label: "Annual renewal rate, Health & Fitness (1st annual renewal)", value: "59.2%", source: "Adapty 2026", url: "https://adapty.io/blog/health-fitness-app-subscription-benchmarks/" },
  renewalAllCategories: { label: "Annual renewal rate, all categories (~72% cancel)", value: "~28.0%", source: "RevenueCat 2026", url: "https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026" },
  retentionD380: { label: "Annual subscription retention D380, North America, all categories", value: "20.0%", source: "Adapty 2026", url: null },
  trialToPaid: { label: "Trial-to-paid, Health & Fitness", value: "35.0% (Adapty) / 37.7% median (RevenueCat)", source: "Adapty 2026; RevenueCat 2026", url: null },
  installToTrial: { label: "Install-to-trial, North America, all categories", value: "14.5%", source: "Adapty 2026", url: "https://adapty.io/blog/health-fitness-app-subscription-benchmarks/" },
  downloadToPaidD35: { label: "D35 download-to-paid, North America, all categories", value: "2.6% median / 5.6% top quartile", source: "RevenueCat 2026", url: null },
  cacSearch: { label: "CAC, Google Search / PPC, B2C fintech", value: "$281.00", source: "First Page Sage 2026", url: "https://firstpagesage.com/seo-blog/fintech-cac-benchmarks-report/" },
  cacFinPlanning: { label: "CAC, consumer financial planning, blended", value: "$176.00", source: "First Page Sage 2026", url: "https://firstpagesage.com/seo-blog/fintech-cac-benchmarks-report/" },
  cacSocial: { label: "CAC, social media blended, B2C fintech", value: "$225.00", source: "First Page Sage 2026", url: "https://firstpagesage.com/seo-blog/fintech-cac-benchmarks-report/" },
  cplSearch: { label: "Google Search CPL, Finance & Insurance", value: "$74.44", source: "WordStream 2026", url: "https://www.wordstream.com/blog/2026-google-ads-benchmarks" },
  cpcSearch: { label: "Google Search CPC, Finance & Insurance", value: "$3.39", source: "WordStream 2026", url: "https://www.wordstream.com/blog/2026-google-ads-benchmarks" },
  tiktok: { label: "TikTok US conversion campaigns", value: "$10.00–$28.00 CPA / $0.80–$1.40 CPC", source: "Conversion Studio / Varos 2026", url: null },
  competitors: { label: "Competitor prices", value: "Monarch Money $99.99/yr; Rocket Money $84–$168/yr; ClearlyFair $19 flat audit", source: "Vendor pricing pages", url: null },
} satisfies Record<string, Benchmark>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const STRIPE_RATE = 0.029; // Stripe standard card fee (CLAUDE.md / SPEC.md)
const STRIPE_FIXED = 0.3;
const CORE_PRICE = 39; // decided price, core annual subscription
const AUDIT_PRICE = 9.5; // entry audit, one-time (acquisition offer)
const GROSS_MARGIN = 0.85; // ASSUMPTION
const ARR_TARGET = 100_000_000;

interface Case {
  name: "Conservative" | "Base";
  /** Annual renewal rate r. */
  renewal: number;
  renewalBasis: string;
  /** TikTok CPC (benchmark range: Conservative = worse end, Base = midpoint). */
  tiktokCpc: number;
  /** ASSUMPTION: TikTok landing-to-paid conversion. */
  tiktokLandingToPaid: number;
  tiktokConvBasis: string;
  /** ASSUMPTION: share of acquired customers who enter via the $9.50 audit. */
  auditEntryShare: number;
  /** ASSUMPTION: share of audit buyers who upgrade to the $39 annual plan. */
  auditToAnnual: number;
  /** ASSUMPTION: paid-channel mix. */
  mix: { search: number; meta: number; tiktok: number };
}

const CASES: Case[] = [
  {
    name: "Conservative",
    renewal: 0.28,
    renewalBasis: "RevenueCat 2026 all-categories (~28.0%), the worse of the two cited renewal rates",
    tiktokCpc: 1.4,
    tiktokLandingToPaid: 0.01,
    tiktokConvBasis: "ASSUMPTION 1.0%",
    auditEntryShare: 0.5,
    auditToAnnual: 0.1,
    mix: { search: 0.4, meta: 0.4, tiktok: 0.2 },
  },
  {
    name: "Base",
    renewal: 0.592,
    renewalBasis: "Adapty 2026 Health & Fitness 1st annual renewal (59.2%)",
    tiktokCpc: 1.1,
    tiktokLandingToPaid: 0.026,
    tiktokConvBasis: "ASSUMPTION 2.6%, proxied from RevenueCat 2026 D35 download-to-paid median",
    auditEntryShare: 0.5,
    auditToAnnual: 0.2,
    mix: { search: 0.4, meta: 0.4, tiktok: 0.2 },
  },
];

const CAC_SEARCH = 281; // First Page Sage 2026
const CAC_META = 225; // First Page Sage 2026, social media blended

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

const net = (price: number) => price - (STRIPE_RATE * price + STRIPE_FIXED);

function compute(c: Case) {
  const arpu = net(CORE_PRICE);
  const auditNet = net(AUDIT_PRICE);
  const years = 1 / (1 - c.renewal);
  const ltvAnnual = arpu * GROSS_MARGIN * years;
  const pAnnual = 1 - c.auditEntryShare + c.auditEntryShare * c.auditToAnnual;
  const auditRevenuePerUser = c.auditEntryShare * auditNet * GROSS_MARGIN;
  const ltv = pAnnual * ltvAnnual + auditRevenuePerUser;
  const cacTiktok = c.tiktokCpc / c.tiktokLandingToPaid;
  const cacBlended = c.mix.search * CAC_SEARCH + c.mix.meta * CAC_META + c.mix.tiktok * cacTiktok;
  const monthlyContribution = (arpu * GROSS_MARGIN) / 12;
  return {
    arpu,
    auditNet,
    years,
    ltvAnnual,
    pAnnual,
    auditRevenuePerUser,
    ltv,
    cacTiktok,
    cacBlended,
    ltvToCacAnnual: ltvAnnual / cacBlended,
    ltvToCac: ltv / cacBlended,
    payback: cacBlended / monthlyContribution,
    subsForArr: ARR_TARGET / CORE_PRICE,
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const x = (n: number) => `${n.toFixed(2)}×`;

const [cons, base] = CASES.map(compute);
const [cc, bc] = CASES;

type Row = [metric: string, formula: string, conservative: string, base: string, basis: string];
const rows: Row[] = [
  ["Net annual ARPU", "39 − (0.029 × 39 + 0.30)", usd(cons.arpu), usd(base.arpu), "Price decided; Stripe fee 2.9% + $0.30"],
  ["Net audit revenue (one-time)", "9.50 − (0.029 × 9.50 + 0.30)", usd(cons.auditNet), usd(base.auditNet), "Price decided; Stripe fee"],
  ["Gross margin", "—", pct(GROSS_MARGIN), pct(GROSS_MARGIN), "ASSUMPTION"],
  ["Annual renewal rate r", "benchmark", pct(cc.renewal), pct(bc.renewal), `Cons: ${cc.renewalBasis}. Base: ${bc.renewalBasis}`],
  ["Expected paid years", "1 / (1 − r)", cons.years.toFixed(2), base.years.toFixed(2), "Formula"],
  ["LTV, direct annual subscriber", "ARPU × GM × years", usd(cons.ltvAnnual), usd(base.ltvAnnual), "Formula"],
  ["Audit-entry share a", "—", pct(cc.auditEntryShare), pct(bc.auditEntryShare), "ASSUMPTION"],
  ["Audit → annual upgrade rate u", "—", pct(cc.auditToAnnual), pct(bc.auditToAnnual), "ASSUMPTION"],
  ["P(becomes annual subscriber)", "(1 − a) + a × u", pct(cons.pAnnual), pct(base.pAnnual), "Formula"],
  ["Audit revenue per acquired user", "a × audit net × GM", usd(cons.auditRevenuePerUser), usd(base.auditRevenuePerUser), "Formula"],
  ["LTV per acquired customer", "P(annual) × LTV annual + audit revenue", usd(cons.ltv), usd(base.ltv), "Formula"],
  ["CAC, Search", "benchmark", usd(CAC_SEARCH), usd(CAC_SEARCH), "First Page Sage 2026, Google Search / PPC B2C fintech"],
  ["CAC, Meta", "benchmark", usd(CAC_META), usd(CAC_META), "First Page Sage 2026, social media blended B2C fintech"],
  ["TikTok CPC", "benchmark range", usd(cc.tiktokCpc), usd(bc.tiktokCpc), "Conversion Studio / Varos 2026 ($0.80–$1.40): Cons = worse end, Base = midpoint"],
  ["TikTok landing-to-paid", "—", pct(cc.tiktokLandingToPaid), pct(bc.tiktokLandingToPaid), `Cons: ${cc.tiktokConvBasis}. Base: ${bc.tiktokConvBasis}`],
  ["CAC, TikTok", "CPC / landing-to-paid", usd(cons.cacTiktok), usd(base.cacTiktok), "Formula"],
  ["Channel mix (Search / Meta / TikTok)", "—", `${pct(cc.mix.search)} / ${pct(cc.mix.meta)} / ${pct(cc.mix.tiktok)}`, `${pct(bc.mix.search)} / ${pct(bc.mix.meta)} / ${pct(bc.mix.tiktok)}`, "ASSUMPTION"],
  ["Blended CAC", "Σ mix × channel CAC", usd(cons.cacBlended), usd(base.cacBlended), "Formula"],
  ["LTV : CAC (direct annual)", "LTV annual / blended CAC", x(cons.ltvToCacAnnual), x(base.ltvToCacAnnual), "Formula"],
  ["LTV : CAC (per acquired customer)", "LTV per customer / blended CAC", x(cons.ltvToCac), x(base.ltvToCac), "Formula"],
  ["Payback period (months)", "CAC / (ARPU × GM / 12)", cons.payback.toFixed(1), base.payback.toFixed(1), "Formula"],
  ["Subscribers for $100M ARR", "100,000,000 / 39", Math.ceil(cons.subsForArr).toLocaleString("en-US"), Math.ceil(base.subsForArr).toLocaleString("en-US"), "Formula (gross ARR at list $39)"],
];

const table = [
  "| Metric | Formula | Conservative | Base | Basis |",
  "|---|---|---:|---:|---|",
  ...rows.map((r) => `| ${r.join(" | ")} |`),
].join("\n");

const sources = Object.values(B as Record<string, Benchmark>)
  .map((b) => `- ${b.label}: ${b.value}. ${b.source}${b.url ? ` — ${b.url}` : " — (URL not supplied; verify before citing)"}`)
  .join("\n");

const notes = [
  "- Values marked ASSUMPTION are not benchmarks. Change them in `scripts/unit-economics.ts` and rerun.",
  "- The $9.50 audit is modelled as an acquisition offer, not ARPU.",
  "- Benchmarks used in the math: annual renewal (Adapty, RevenueCat), Search and social CAC (First Page Sage), TikTok CPC range (Conversion Studio / Varos).",
  "- Listed for context only, not used in the math: D380 retention, trial-to-paid, install-to-trial, Google CPL/CPC, consumer financial-planning CAC, competitor prices.",
].join("\n");

const report = `# BenefitsShield unit economics

Generated by \`npx tsx scripts/unit-economics.ts\`. Do not edit by hand.

${table}

## Notes
${notes}

## Sources
${sources}
`;

console.log(report);
const out = resolve(process.cwd(), "docs/unit-economics.md");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, report);
console.error(`Wrote ${out}`);
