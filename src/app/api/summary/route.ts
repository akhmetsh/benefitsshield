import { summarize } from "@/lib/llm/summarize";
import { CalculationResultSchema, SummaryResponseSchema } from "@/lib/schema";

/** POST an engine result, get 3 bullets back. Falls back to the template on any failure. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CalculationResultSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid calculation result" }, { status: 400 });
  }
  const summary = SummaryResponseSchema.parse(await summarize(parsed.data));
  return Response.json(summary, { headers: { "cache-control": "no-store" } });
}
