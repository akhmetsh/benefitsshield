"use client";

import { useState } from "react";

interface Chip {
  id: string;
  label: string;
  eligible: boolean;
  note: string;
}

/** Plain-English summary of IRS Publication 502 (Medical and Dental Expenses). */
const CHIPS: Chip[] = [
  { id: "cost-share", label: "Copays & deductibles", eligible: true, note: "Your share of covered medical bills qualifies." },
  { id: "rx", label: "Prescriptions", eligible: true, note: "Prescription drugs and insulin qualify." },
  { id: "dental", label: "Dental & braces", eligible: true, note: "Dental treatment, including orthodontia, qualifies." },
  { id: "vision", label: "Glasses & contacts", eligible: true, note: "Eye exams, glasses and contact lenses qualify." },
  { id: "hearing", label: "Hearing aids", eligible: true, note: "Hearing aids and their batteries qualify." },
  { id: "gym", label: "Gym membership", eligible: false, note: "Gym fees for general health don't qualify." },
  { id: "cosmetic", label: "Cosmetic procedures", eligible: false, note: "Cosmetic procedures such as teeth whitening don't qualify." },
  { id: "vitamins", label: "General-health vitamins", eligible: false, note: "Vitamins taken for general health don't qualify." },
  { id: "premiums", label: "Insurance premiums", eligible: false, note: "Health insurance premiums can't be paid from a health FSA." },
];

export function FsaChips() {
  const [selected, setSelected] = useState<Chip | null>(null);
  return (
    <div>
      <p className="text-xs font-medium text-slate-700">What counts? (IRS Pub. 502) <span className="font-normal text-slate-500">Tap a chip.</span></p>
      <div className="mt-2 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={selected?.id === c.id}
            onClick={() => setSelected(selected?.id === c.id ? null : c)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${c.eligible ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"} ${selected?.id === c.id ? "ring-2 ring-slate-900" : ""}`}
          >
            {c.eligible ? "✓" : "✕"} {c.label}
          </button>
        ))}
      </div>
      <p className="mt-2 min-h-5 text-xs text-slate-600" aria-live="polite">
        {selected ? `${selected.eligible ? "Eligible" : "Not eligible"}: ${selected.note}` : ""}
      </p>
    </div>
  );
}
