"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usd } from "@/lib/format";
import type { CalculationResult } from "@/lib/schema";

/** Bar chart of expected net annual cost per plan. The winner is green. */
export function CostChart({ result }: { result: CalculationResult }) {
  const [mounted, setMounted] = useState(false);
  // Recharts needs a measured container, so render the chart only after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const data = result.plans.map((p) => ({
    name: p.planName,
    cost: p.netAnnualCost,
    winner: p.planId === result.recommendedPlanId,
  }));

  return (
    <div className="h-52 w-full" role="img" aria-label="Net annual cost by plan">
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }}>
            <XAxis type="number" hide domain={[(min: number) => Math.min(0, min), "auto"]} />
            <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 12, fill: "#334155" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [usd(Number(v)), "Net annual cost"]} cursor={{ fill: "#f1f5f9" }} />
            <Bar dataKey="cost" radius={4} barSize={28} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.winner ? "#047857" : "#94a3b8"} />
              ))}
              <LabelList dataKey="cost" position="right" formatter={(v) => usd(Number(v))} style={{ fontSize: 12, fill: "#0f172a", fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
