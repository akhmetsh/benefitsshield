# BenefitsShield

A B2C web app for US employees choosing a 2027 health plan during open enrollment. It compares an HDHP + HSA against a traditional PPO using 2027 IRS rules, shows the true net annual cost of each, then sells a Pro tier (a one-time Single Bill Audit, or the Annual Shield at $39/yr during the 50% launch offer, $78/yr list) that protects the savings with a **medical bill overcharge scanner** and a year-round tracker.

Built for Business Cup 2.0, Track 01 (Money). No login, no database, no PII: all state lives in your browser's `localStorage`.

## The funnel

**1. Free: plan comparison (the hook)**
- Pick Maya, Marcus or Elena (badged `SAMPLE DATA`) or type your own numbers. Every plan and tax input is a slider plus a numeric box, and the result recalculates in milliseconds.
- Winner, savings breakdown (federal, state and FICA tax shield, employer HSA money), a net-cost chart and a plain-English 3-bullet brief.
- The 4-scenario stress matrix ($650 / $2,200 / $14,000 / $45,000 medical years).
- A **Status Quo Loss vs. BenefitsShield Optimization** card pair: the dollars lost by picking the costliest plan against the dollars kept by picking the best one. Both figures come from the engine.

**2. Paid ($39/yr): the Medical Bill Overcharge Shield**
- The emerald card turns directly into the paywall: *Protect Your 2027 Savings from Hospital Billing Errors ($39/yr)*.
- **Bill / EOB scanner:** drop a PDF/JPG or run a preset. A 1.2-second simulated scan extracts line items, then you can edit billed, YTD deductible paid and clinic demand. The engine returns the **true legal share** (remaining deductible + coinsurance, capped by the out-of-pocket max), a verdict (`OVERCHARGE` or `FAIR`), the specific billing errors found, a one-click **dispute script**, and a button to log the verified share to the tracker.
- **Biweekly paycheck setup:** the HSA/FSA amount for each of 26 paychecks.
- **Year-round tracker:** deductible progress, expense log, FSA use-it-or-lose-it countdown, IRS Pub. 502 eligibility chips, `.ics` reminder, and a **Fast-Forward +6 Months** demo clock.

**Unlocking:** the **Judge Demo Unlock** button works with no setup. Stripe Checkout (test mode) appears when `STRIPE_SECRET_KEY` is set to an `sk_test_` key. Unlock status persists in `localStorage`.

> The bill scanner is a client-side simulation. Dropped files are never read or uploaded; the demo statement is loaded instead. Nothing identifying is collected.

## How the numbers work

All dollars come from pure functions in `src/lib/engine/calculator.ts`; the UI and the optional LLM never do arithmetic.

- `comparePlans()` ranks plans by net annual cost: premiums + expected care + FSA forfeiture − employer HSA − payroll tax savings.
- `auditBill()` checks a clinic's demand: `legal = min(oopLeft, min(bill, dedLeft) + max(0, bill − dedLeft) × coinsurance)`. A demand within $1 of the legal share is fair.
- `calculatePaycheckSchedule()` splits a yearly amount over 26 paychecks, putting leftover cents on the last one.
- `computeTrackerSnapshot(state, plan, today)` powers the tracker: deductible and out-of-pocket progress, FSA balance, dollars at risk after the carryover, days to the FSA deadline and alerts. `today` is an argument; the fast-forward button only changes a month offset.
- Statutory 2027 constants live only in `IRS_2027` in `calculator.ts`; see Data sources below.

### Data sources
- HSA limits ($4,500 self-only / $9,000 family, $1,000 catch-up at 55+), HDHP minimum deductible ($1,750 / $3,500) and maximum out-of-pocket ($8,700 / $17,400): [IRS Rev. Proc. 2026-24](https://www.irs.gov/pub/irs-drop/rp-26-24.pdf)
- Health FSA limit ($3,500) and carryover ($700): [IRS Rev. Proc. 2026-35](https://www.irs.gov/pub/irs-drop/rp-26-35.pdf)
- 2027 Social Security wage base ($192,300): [SSA contribution and benefit base](https://www.ssa.gov/oact/cola/cbb.html)
- FICA rates (6.2% Social Security, 1.45% Medicare): IRC §3101

### Simplifications (SPEC.md §4.3)
- **Family coverage** uses one aggregate deductible and one aggregate out-of-pocket maximum (no embedded per-person deductibles).
- **In-network care only.** Out-of-network pricing and balance billing are not modelled.
- **FICA** uses a single rate based on salary: 7.65% when salary is at or below the $192,300 2027 Social Security wage base, 1.45% above it. The 0.9% Additional Medicare Tax is not modelled.
- **Federal and state marginal tax rates are user inputs**, not full bracket calculations.
- The bill audit tracks one YTD figure for both the deductible and the out-of-pocket max.

## Optional LLM brief
With `ANTHROPIC_API_KEY` set, `/api/summary` asks a model to reword the 3 bullets. The model writes `{placeholders}` only; output containing any digit or unknown placeholder is rejected, and engine numbers are injected afterwards. 4-second timeout; on any failure the rule-based text is used. The app works fully with no key.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # engine + summary + dispute tests
npm run lint
npm run build
```

Environment variables (server-only, never committed; use `.env.local` or Vercel settings):

| Name | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Optional. `sk_test_...` enables Stripe Checkout in test mode. Live keys are refused. |
| `ANTHROPIC_API_KEY` | Optional. Enables the AI wording of the brief. |

Test card: `4242 4242 4242 4242`, any future date, any CVC.

## Disclaimer
Educational simulation using 2027 IRS rules — not licensed financial, tax, or medical advice. Zero PII is collected or stored. BenefitsShield does not sell insurance.
