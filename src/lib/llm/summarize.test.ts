import { describe, expect, it } from "vitest";
import { comparePlans } from "@/lib/engine/calculator";
import { templateSummary } from "@/lib/llm/fallback";
import { acceptModelText } from "@/lib/llm/summarize";
import { SAMPLE_PERSONAS } from "@/lib/personas";

const maya = comparePlans(SAMPLE_PERSONAS[0].input);

describe("template summary", () => {
  it("returns three bullets whose numbers come from the engine", () => {
    const bullets = templateSummary(maya);
    expect(bullets).toHaveLength(3);
    expect(bullets[0]).toContain("$2,236"); // savingsVsNextBest 2235.63 rounded to whole dollars
    expect(bullets.join(" ")).not.toMatch(/\{\w+\}/);
  });
});

describe("LLM output guard", () => {
  const good = JSON.stringify({
    bullets: ["Pick {winner}, about {savings} cheaper than {runnerUp}.", "Risk: see {winnerWorst}.", "Why: {taxSavings} in tax savings."],
  });

  it("injects engine numbers into placeholders", () => {
    const out = acceptModelText(good, maya);
    expect(out?.[0]).toBe("Pick Saver HDHP + HSA, about $2,236 cheaper than Choice PPO.");
  });

  it("rejects output where the model wrote its own number", () => {
    const bad = JSON.stringify({ bullets: ["Save $500 a year.", "{winner}", "{runnerUp}"] });
    expect(acceptModelText(bad, maya)).toBeNull();
  });

  it("rejects unknown placeholders, wrong shape and non-JSON", () => {
    expect(acceptModelText(JSON.stringify({ bullets: ["{nope}", "a", "b"] }), maya)).toBeNull();
    expect(acceptModelText(JSON.stringify({ bullets: ["a", "b"] }), maya)).toBeNull();
    expect(acceptModelText("sorry, I can't", maya)).toBeNull();
  });
});
