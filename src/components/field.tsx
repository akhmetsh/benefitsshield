"use client";

import { useId } from "react";

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** Shown inside the numeric box: "$" or "%". */
  unit?: "$" | "%" | "";
  hint?: string;
  /** Slider travel can be narrower than what the numeric box accepts. */
  sliderMax?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A slider and a numeric box bound to the same value. */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit = "",
  hint,
  sliderMax,
}: SliderFieldProps) {
  const id = useId();
  const shown = Math.round(value * 10_000) / 10_000;
  const commit = (raw: string) => {
    const n = raw === "" ? min : Number(raw);
    if (Number.isFinite(n)) onChange(clamp(n, min, max));
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        <div className="flex items-center rounded-lg border border-slate-300 bg-white px-2 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
          {unit === "$" && <span className="text-sm text-slate-500">$</span>}
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={shown}
            onChange={(e) => commit(e.target.value)}
            className="tabular w-24 bg-transparent py-1.5 text-right text-sm text-slate-900 outline-none"
          />
          {unit === "%" && <span className="text-sm text-slate-500">%</span>}
        </div>
      </div>
      <input
        type="range"
        aria-label={`${label} slider`}
        min={min}
        max={Math.min(max, sliderMax ?? max)}
        step={step}
        value={Math.min(shown, sliderMax ?? max)}
        onChange={(e) => commit(e.target.value)}
        className="h-2 w-full cursor-pointer"
      />
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

export function SelectField<T extends string>({ label, value, onChange, options }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
