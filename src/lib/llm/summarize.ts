import { z } from "zod";
import {
  SUMMARY_TOKENS,
  fillTokens,
  summaryValues,
  templateSummary,
} from "@/lib/llm/fallback";
import {
  SummaryBulletsSchema,
  type CalculationResult,
  type SummaryResponse,
} from "@/lib/schema";

/**
 * Optional LLM wording for the 3-bullet brief. Server-only.
 *
 * The model never sees or writes a dollar figure: it writes sentences with
 * {placeholders}, we reject any output that contains digits or unknown
 * placeholders, and the engine's numbers are injected afterwards.
 */

export const LLM_TIMEOUT_MS = 4_000;
const MODEL = "claude-haiku-5-5";

const ModelOutputSchema = z.object({ bullets: SummaryBulletsSchema });

function buildPrompt(result: CalculationResult): string {
  const [winner, runnerUp] = result.plans;
  const facts = {
    winnerType: winner.planType,
    runnerUpType: runnerUp.planType,
    winnerHasHigherWorstCase: winner.worstCaseNetCost > runnerUp.worstCaseNetCost,
    winnerHasEmployerHsaMoney: winner.employerHsaContribution > 0,
    switchPointExists: result.breakevenAllowedCharges !== null,
  };
  return [
    "Rewrite a health-plan comparison as exactly 3 short plain-English bullets for a US employee.",
    "Bullet 1: which plan wins and by how much. Bullet 2: the main trade-off or risk. Bullet 3: why it wins or when the other plan would win.",
    `Use ONLY these placeholders for plan names and money, written in curly braces: ${SUMMARY_TOKENS.map((t) => `{${t}}`).join(" ")}.`,
    "Never write a digit, a dollar sign or any number yourself. Each bullet is at most 40 words. No advice to buy specific insurance products.",
    `Facts: ${JSON.stringify(facts)}`,
    'Reply with JSON only, in this shape: {"bullets":["...","...","..."]}',
  ].join("\n");
}

/** Returns validated bullets with engine numbers injected, or null if anything is off. */
export function acceptModelText(text: string, result: CalculationResult): string[] | null {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
  const out = ModelOutputSchema.safeParse(parsed);
  if (!out.success) return null;

  const allowed = new Set<string>(SUMMARY_TOKENS);
  for (const bullet of out.data.bullets) {
    if (/[0-9$]/.test(bullet)) return null;
    for (const match of bullet.matchAll(/\{(\w+)\}/g)) {
      if (!allowed.has(match[1])) return null;
    }
  }
  const values = summaryValues(result);
  const filled = out.data.bullets.map((b) => fillTokens(b, values));
  return SummaryBulletsSchema.safeParse(filled).success ? filled : null;
}

async function askModel(result: CalculationResult, apiKey: string): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: "user", content: buildPrompt(result) }],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text;
    return text ? acceptModelText(text, result) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Never throws: any failure returns the deterministic template. */
export async function summarize(result: CalculationResult): Promise<SummaryResponse> {
  const fallback: SummaryResponse = { source: "template", bullets: templateSummary(result) };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;
  const bullets = await askModel(result, apiKey);
  return bullets ? { source: "llm", bullets } : fallback;
}
