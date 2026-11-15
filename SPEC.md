# SPEC.md — BenefitsShield Master Product Specification

Business Cup 2.0 · Track 01 — Money · US adults 25–45 · B2C only · Web only
Plan year modelled: **2027**. Spec written 2026-11-15 02:00 (Astana), updated at submission.

---

## 1. Product in one line

BenefitsShield shows a US employee which of their employer's health plans really costs less, HDHP + HSA or PPO, after premiums, expected care, employer HSA money and tax savings, then tracks the deductible, HSA and FSA through the year.

**Originality:** employer-paid benefits tools (Nayya, ALEX) are sold to HR. BenefitsShield sells the same kind of guidance straight to the employee, with no employer and no insurer commission.

**What the user pays for:** a clear answer in dollars ("Pick the HDHP. It costs you $2,235.63 less next year.") plus the year-round tracker that stops them losing FSA money.

---

## 2. Persona and pain

### Primary persona
**Maya, 33, senior designer in Austin, TX. Salary $95,000, single, 22% federal bracket, no state income tax.**

- **Trigger:** open enrollment closes in two weeks. Her employer offers an HDHP with an HSA and a PPO.
- **What she does today:** picks the PPO again because the lower deductible feels safer.
- **What it costs her:** on her sample numbers the PPO costs **$2,235.63 more** per year (engine output, tested).
- **Why existing options fail:** the employer's portal lists premiums and deductibles but never nets out the tax savings and employer HSA money; free calculators ignore FICA, the employer contribution inside the IRS limit, and FSA forfeiture.

### Sample personas (1-click, badged `SAMPLE DATA`)

| Persona | Situation | Engine result (tested) |
|---|---|---|
| **Maya**, 33, Austin TX, single, $95,000 | Light care: 4 primary visits, 2 specialist, 6 prescriptions, $1,200 other | HDHP $1,266.12 vs PPO $3,501.75. **HDHP wins by $2,235.63** |
| **Marcus**, 29, Chicago IL, single, $72,000 | Almost no care: 1 primary visit | HDHP −$272.00 vs PPO $2,545.00. **HDHP wins by $2,817.00** |
| **Elena**, 41, Seattle WA, married, family coverage, $165,000 | Heavy care: 10 primary, 12 specialist, 36 prescriptions, $9,500 other | PPO $9,352.25 vs HDHP $12,848.25. **PPO wins by $3,496.00** |

A negative net cost (Marcus) means employer HSA money plus tax savings exceed premiums and care. Elena exists so the tool visibly doesn't always say "HDHP".

These figures come from `comparePlans()` and are asserted in `calculator.test.ts`. The UI and the deck must read them from the engine, never from this table.

---

## 3. User flow (one page, no login)

The page is the product. Sections stack top to bottom; nothing sits behind navigation.

1. **Header:** name, one-line promise, disclaimer, `SAMPLE DATA` badge while a persona is loaded.
2. **Persona switcher:** Maya (loaded by default), Marcus, Elena, and "Use my own numbers".
3. **Inputs:**
   - About you: coverage (self-only / family), filing status, age, salary, federal rate, state and state rate.
   - Expected care: primary visits, specialist visits, prescriptions, other charges (slider).
   - Your plans (2 to 4): premium, deductible, out-of-pocket maximum, coinsurance, copays, employer HSA money, for both tiers.
   - Accounts: planned HSA and FSA contributions.
4. **Result (free):** the winning plan, the dollar gap, and a bar chart of net annual cost per plan. Recomputes on every change.
5. **Paywall:** "Unlock your full plan — $39/year". Opens Stripe Checkout in test mode. The test card `4242 4242 4242 4242`, any future date, any CVC, is printed beside the button.
6. **Full report (paid):**
   - Cost breakdown per plan: premiums, care, employer HSA, tax savings split into federal, state and FICA.
   - Three scenarios per plan: no care, expected, worst case.
   - Breakeven: the level of care at which the other plan becomes cheaper.
   - Warnings: HSA limit, FSA forfeiture, state rules, non-qualified HDHP.
   - Plain-English summary (LLM, with template fallback).
7. **Year tracker (paid, retention):** deductible progress, out-of-pocket progress, HSA pacing, FSA balance and deadline countdown, expense log, alerts. A **"Fast-forward +6 months"** button advances the demo clock.

All state is saved to `localStorage` under one key and validated with `RetentionStateSchema` on load.

---

## 4. Engine

Pure TypeScript in `src/lib/engine/calculator.ts`. Entry point: `comparePlans(input) -> CalculationResult`.

### 4.1 Statutory constants (`IRS_2027`)

| Constant | 2027 value | Source |
|---|---|---|
| HSA limit, self-only | **$4,500** | IRS Rev. Proc. 2026-24 |
| HSA limit, family | **$9,000** | IRS Rev. Proc. 2026-24 |
| HSA catch-up, age 55+ | $1,000 | IRS Rev. Proc. 2026-24 |
| HDHP minimum deductible | $1,750 self-only / $3,500 family | IRS Rev. Proc. 2026-24 |
| HDHP maximum out-of-pocket | $8,700 self-only / $17,400 family | IRS Rev. Proc. 2026-24 |
| Health FSA limit | $3,500 | IRS Rev. Proc. 2026-35 |
| Health FSA carryover | $700 | IRS Rev. Proc. 2026-35 |
| Social Security tax | 6.2% up to $192,300 of wages | SSA, Oct 14 2026 |
| Medicare tax | 1.45% | IRC §3101 |
| FICA tax shield | 7.65% (6.2% + 1.45%) | — |

> $4,300 / $8,550 are the **2025** HSA limits. They must not appear in code, UI or deck.

### 4.2 Formulas

For each plan `p` at the chosen coverage tier:

**Premiums**
```
AnnualPremium = 12 × MonthlyPremium
```

**Care (member cost sharing)**
```
Copays  = Σ units × min(copay, allowed amount)      categories where the plan has a copay
G       = other charges + Σ units × allowed amount  categories where it has none
OOP     = min( OOPMax, Copays + min(G, Deductible) + max(0, G − Deductible) × Coinsurance )
```
Default allowed amounts (editable assumptions): primary visit $150, specialist $250, prescription $40.

**HSA** (only if the plan is HDHP type, deductible ≥ IRS minimum and OOPMax ≤ IRS maximum)
```
Limit        = HSA limit for the tier (+ $1,000 if age ≥ 55)
EmployerHSA  = min(employer contribution, Limit)
EmployeeHSA  = min(planned contribution, Limit − EmployerHSA)
```

**Health FSA** (only on plans without an HSA)
```
FSAElection   = min(planned FSA contribution, $3,500)
FSAForfeiture = max(0, FSAElection − OOP − $700)
```

**Tax savings** (payroll contributions under Section 125)
```
FICA rate   = 7.65% if salary ≤ $192,300, else 1.45%
State rate  = marginal state rate, except 0 for HSA dollars in CA and NJ
TaxSavings  = EmployeeHSA × (Federal + State_HSA + FICA)
            + FSAElection × (Federal + State + FICA)
```
The federal and state marginal rates are user inputs, preset by the personas.

**Net annual cost**
```
Net = AnnualPremium + OOP + FSAForfeiture − EmployerHSA − TaxSavings
```
The employee's own HSA contribution isn't a cost: it stays their money.

**Scenarios:** the same formula with `OOP = 0` (no care), expected `OOP`, and `OOP = OOPMax` (worst case).

**Ranking:** lowest expected `Net` wins; ties go to the lower worst case.

**Breakeven:** scan "other charges" from $0 to $200,000 for the point where two plans cost the same; `null` if one plan wins throughout.

### 4.3 Simplifications (state them in the README)
- Family coverage uses one aggregate deductible and out-of-pocket maximum.
- In-network care only.
- FICA uses a single rate based on salary; the 0.9% Additional Medicare Tax isn't modelled.
- Marginal rates are inputs; the engine doesn't compute tax brackets.

### 4.4 Tracker
`computeTrackerSnapshot(state, plan, today)` returns deductible and out-of-pocket progress, HSA remaining to target, FSA balance, FSA dollars at risk after the $700 carryover, days to the FSA deadline, and alerts. `today` is an argument; the fast-forward button only changes `state.demoMonthOffset`.

### 4.5 LLM
One optional server call that rewrites the result as three plain-English bullets. Zod-validated, 4-second timeout, numbers injected from the engine. On any failure the deterministic template renders instead. The product works with no API key.

---

## 5. Monetization

- **Free:** calculator, sample personas, own inputs, the winning plan and the dollar gap.
- **Paid, $39/year (core subscription):** full report, scenarios, breakeven, warnings, summary, year tracker.
- **Entry offer, $9.50 (single bill audit):** one hospital bill audit plus dispute script; upgrades to the $39/year subscription.
- **Paywall trigger:** immediately after the user sees the dollar gap.
- **Checkout:** Stripe Checkout, test mode, test card printed on screen. Success sets `unlocked: true` in saved state.
- Annual billing matches the annual decision and avoids monthly churn.

### Unit economics

All unit economics (net ARPU, renewal, LTV, CAC by channel, LTV : CAC, payback, subscribers for $100M ARR) live in one place: [`docs/unit-economics.md`](docs/unit-economics.md). It is generated by `npx tsx scripts/unit-economics.ts`, with a formula and a cited benchmark or an `ASSUMPTION` label for every number. SPEC.md deliberately repeats none of those figures, so there is a single source of truth.

Pricing used by that model:

| Product | Price | Role |
|---|---|---|
| Core subscription (Annual Shield + Copilot) | **$39/year** | Recurring revenue |
| Single Bill Audit | **$9.50** one-time | Entry offer; upgrades to the $39/year subscription |

The deck may show LTV and CAC only as they appear in `docs/unit-economics.md`, with the source next to each number.

---

## 6. Retention loop (must work in the live app)

1. After checkout the user picks the plan they enrolled in; the tracker starts.
2. Through the year they log bills. The tracker shows deductible progress and the HSA pace.
3. From 90 days before the FSA deadline the tracker warns how many dollars will be lost.

**Roadmap (in build, not in the live app):** next open enrollment, last year's logged spending pre-fills "expected care", so the second comparison is better than the first.

**Demo proof:** the "Fast-forward +6 months" button shows steps 2 and 3 in ten seconds; a reload keeps the state.

---

## 7. Build log and cutlines (historical)

**Status at submission:** live at https://benefitsshield.vercel.app/, 80 tests passing. The plan below is the schedule written at 02:00 and is kept as a record.

| By | Done |
|---|---|
| 02:00 | Schema, engine, first passing test suite ✅ |
| 02:45 | Next.js scaffold, public repo, Vercel deploy, engine wired to a bare page |
| 05:00 | Full calculator UI in production: personas, inputs, result, chart, disclaimer |
| 06:30 | Paywall and full report |
| 08:00 | Year tracker with fast-forward; mobile pass; README |
| 08:30 | **Feature freeze** |
| 10:30 | Audit fixes, deck, **submit** |

### Cutlines
- **05:00, calculator not working end to end in production:** drop the LLM summary (template only) and the breakeven display.
- **06:30, Stripe not working:** keep the paywall with the $39/year price (and the $9.50 single audit) and unlock with the on-screen Judge Demo Unlock button.
- **08:00, tracker unfinished:** ship deductible bar, FSA countdown and fast-forward only; drop the expense log form and pre-load three sample expenses, badged as sample data.
- **Never cut:** engine and tests, sample personas, own-number inputs, a working paywall, saved state across reloads, the disclaimer, the public repo with no secrets.

### Definition of done
Ticked items were checked against the live site or the repo at submission. Unticked items are manual browser checks still to confirm before the pitch.

- [x] URL opens straight into the calculator with Maya loaded; no login
- [x] Changing any input changes the result (engine test "changes the output when the input changes")
- [ ] Persona switch and "Use my own numbers" both work
- [ ] Paywall completes with the Judge Demo Unlock (Stripe test checkout needs `STRIPE_SECRET_KEY` set on the deployment)
- [ ] Tracker state survives a reload; fast-forward works
- [x] Disclaimer visible; `SAMPLE DATA` badge visible
- [ ] Works on a phone; no console errors; no dead buttons
- [x] `npm run test` passes; repo public; no secrets; README present

---

## 8. Open risks

1. **"Free calculators already do this."** Our answer is accuracy (FICA, employer money inside the limit, FSA forfeiture, state rules, IRS qualification check) plus the year tracker. A sharper segment, such as expecting parents choosing across two employers' plans, would be a stronger answer.
2. **Unit economics** are benchmarked or labeled `ASSUMPTION` line by line in `docs/unit-economics.md`; read the LTV : CAC result there before pitching.
3. **Retention relies on manual bill logging.** The FSA countdown carries the story today; next-year pre-fill is on the roadmap (§6).
