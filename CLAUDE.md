# CLAUDE.md — BenefitsShield

Root context for every AI coding session in this repo. Read this, then `SPEC.md`, before changing anything.

## What we are building

**BenefitsShield** is a B2C web app for US working adults (25–45) choosing an employer health plan during open enrollment. It compares an HDHP + HSA against a traditional PPO using 2027 IRS rules, shows the true net annual cost of each, sells a $39/year plan through a Stripe test-mode paywall, and then tracks the deductible, HSA and FSA through the year in `localStorage`.

Context: Business Cup 2.0 hackathon, Track 01 (Money), judged by Zimran. **Submit by 10:30 on Nov 15; feature freeze 08:30.**

## How we are judged

| Weight | Criterion | What it means for code |
|---|---|---|
| 40% | Does it work? | Live in production. Real engine, judge-typed inputs change outputs. Judges read this repo. |
| 20% | Value & retention | Working paywall with USD price. A working return mechanic inside the app. |
| 15% | Problem & user | One US persona, one pain. US copy, USD, US tax rules. |
| 15% | Business potential | Unit economics with cited benchmarks. |
| 10% | Originality | B2C unbundling of employer-only benefits tools. |

Pass/fail gates: B2C only, web only, no login wall, public repo, English UI.

## Tech stack

- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS + shadcn/ui
- Recharts for charts
- Zod for every data boundary
- Vitest for engine tests
- Stripe Checkout in **test mode**
- Vercel for hosting
- No database. Client state lives in `localStorage`.

## Repo map

```
/CLAUDE.md                          this file
/SPEC.md                            product spec: persona, flow, formulas, cutlines
/vitest.config.ts                   "@/..." -> ./src, node environment, globals
/src/lib/schema.ts                  Zod schemas = the contract. Change here first.
/src/lib/engine/calculator.ts       pure deterministic engine + IRS_2027 constants
/src/lib/engine/calculator.test.ts  engine tests with hand-checked numbers
/src/lib/personas.ts                3 labeled sample personas (Maya, Marcus, Elena)
/src/lib/llm/                       optional plain-English summary + fallback
/src/app/                           UI (one page)
```

## Engine rules (non-negotiable)

1. **Pure functions only** in `src/lib/engine/`. No `fetch`, no `Date.now()`, no `Math.random()`, no `localStorage`, no React. Pass dates in as arguments.
2. **The LLM never does arithmetic.** Every dollar on screen comes from `comparePlans()` or `computeTrackerSnapshot()`.
3. **No hardcoded outputs.** Sample personas are inputs only; their results come from the same engine as typed inputs. Never write a result number into UI copy.
4. **Statutory numbers live in `IRS_2027`** in `calculator.ts`, each with a source. Don't put tax constants anywhere else. 2027 HSA limits are **$4,500 self-only / $9,000 family** (Rev. Proc. 2026-24). $4,300 / $8,550 are the 2025 limits; don't use them.
5. **Schema first.** To add a field: update `schema.ts`, then the engine, then a test, then the UI.
6. **Every engine change needs a test** whose expected value was worked out by hand and shown in a comment. Run `npm run test` before every commit. All tests must pass.
7. Round money with `roundCents()` at output boundaries only.

## LLM rules

- One use only: turning the engine's result into a 3-bullet plain-English summary.
- Call it from a server route. Validate the response with Zod. Time out after 4 seconds.
- On any failure (no key, timeout, bad shape) render the deterministic template summary immediately. The app must work fully with no API key.
- Numbers in the summary are injected from the engine result, never generated.

## Secrets (strict)

- Never commit keys, tokens or `.env*` files. `.env*` is in `.gitignore`.
- Keys live only in Vercel environment variables and a local, uncommitted `.env.local`.
- Only names prefixed `NEXT_PUBLIC_` may reach the browser. The Stripe **secret** key and the LLM key are server-only.
- Stripe stays in test mode (`sk_test_...`, `pk_test_...`). Never add live keys.
- Before each commit: `git diff --cached | grep -E "sk_(test|live)_|api[_-]?key|secret"` must print nothing.
- If a key is ever committed, rotate it at once; removing it in a later commit isn't enough.

## Product rules

- **No login, no sign-up.** The first screen is the working calculator with Maya loaded.
- Sample data is always badged `SAMPLE DATA`.
- **No dead UI.** If a button doesn't work end to end, delete it.
- Disclaimer visible on the page: "Educational estimates only. Not insurance, tax, medical or legal advice. BenefitsShield does not sell insurance."
- No personal data leaves the browser. Don't collect names, dates of birth or health conditions.
- Price is **$39/year**, shown in USD. Test card `4242 4242 4242 4242` is printed next to the pay button.
- B2C only. No employer, HR or team features or copy.
- US English, USD, mobile-responsive.

## Working style

- Small commits, often, with clear messages. Judges may read the history.
- Don't add dependencies without need. Don't refactor working code after 06:00.
- When behind, follow the cutlines in `SPEC.md` instead of inventing new scope.

## Commands

```
npm run dev      # local dev server
npm run test     # engine tests (must pass before commit)
npm run build    # production build
```
