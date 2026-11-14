"use client";

import { SelectField, SliderField } from "@/components/field";
import { IRS_2027, getTierTerms } from "@/lib/engine/calculator";
import type { Copays, HealthPlan, TierTerms, UserInput } from "@/lib/schema";

interface Props {
  input: UserInput;
  onChange: (next: UserInput) => void;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function InputsPanel({ input, onChange }: Props) {
  const tierKey = input.coverageTier === "SELF_ONLY" ? "selfOnly" : "family";
  const set = (patch: Partial<UserInput>) => onChange({ ...input, ...patch });
  const setUsage = (patch: Partial<UserInput["usage"]>) => set({ usage: { ...input.usage, ...patch } });

  const setPlan = (index: number, plan: HealthPlan) => {
    set({ plans: input.plans.map((p, i) => (i === index ? plan : p)) });
  };

  /** Edits one tier field and keeps deductible <= out-of-pocket max so inputs stay valid. */
  const setTerm = (index: number, field: keyof TierTerms, value: number) => {
    const plan = input.plans[index];
    const terms: TierTerms = { ...plan[tierKey], [field]: value };
    if (field === "deductible" && terms.oopMax < value) terms.oopMax = value;
    if (field === "oopMax" && terms.deductible > value) terms.deductible = value;
    setPlan(index, { ...plan, [tierKey]: terms });
  };

  const setCopay = (index: number, key: keyof Copays, value: number) => {
    const plan = input.plans[index];
    setPlan(index, { ...plan, copays: { ...plan.copays, [key]: value } });
  };

  return (
    <div className="space-y-4">
      <Card title="About you">
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Coverage"
            value={input.coverageTier}
            onChange={(coverageTier) => set({ coverageTier })}
            options={[
              { value: "SELF_ONLY", label: "Self only" },
              { value: "FAMILY", label: "Family" },
            ]}
          />
          <SelectField
            label="Filing status"
            value={input.filingStatus}
            onChange={(filingStatus) => set({ filingStatus })}
            options={[
              { value: "SINGLE", label: "Single" },
              { value: "MARRIED_FILING_JOINTLY", label: "Married, joint" },
              { value: "HEAD_OF_HOUSEHOLD", label: "Head of household" },
            ]}
          />
          <SelectField
            label="State"
            value={input.state}
            onChange={(state) => set({ state })}
            options={US_STATES.map((s) => ({ value: s, label: s }))}
          />
        </div>
        <SliderField label="Age" value={input.age} onChange={(age) => set({ age: Math.round(age) })} min={18} max={100} sliderMax={70} step={1} />
        <SliderField label="Annual salary" value={input.annualIncome} onChange={(annualIncome) => set({ annualIncome })} min={0} max={10_000_000} sliderMax={400_000} step={1_000} unit="$" hint={`Social Security tax applies up to $${IRS_2027.socialSecurityWageBase.toLocaleString("en-US")}.`} />
      </Card>

      <Card title="Tax rates" note="Marginal rates: the tax you save on each pre-tax payroll dollar.">
        <SliderField label="Federal marginal rate" value={input.marginalFederalRate * 100} onChange={(v) => set({ marginalFederalRate: v / 100 })} min={0} max={37} step={1} unit="%" />
        <SliderField label="State marginal rate" value={input.marginalStateRate * 100} onChange={(v) => set({ marginalStateRate: v / 100 })} min={0} max={15} step={0.25} unit="%" hint="Use 0% for states with no income tax, such as TX, WA or FL." />
      </Card>

      <Card title="Expected care this year">
        <SliderField label="Primary care visits" value={input.usage.primaryCareVisits} onChange={(v) => setUsage({ primaryCareVisits: Math.round(v) })} min={0} max={100} sliderMax={30} step={1} />
        <SliderField label="Specialist visits" value={input.usage.specialistVisits} onChange={(v) => setUsage({ specialistVisits: Math.round(v) })} min={0} max={100} sliderMax={30} step={1} />
        <SliderField label="Prescription fills" value={input.usage.rxFills} onChange={(v) => setUsage({ rxFills: Math.round(v) })} min={0} max={200} sliderMax={60} step={1} />
        <SliderField label="Other medical charges" value={input.usage.otherAllowedCharges} onChange={(v) => setUsage({ otherAllowedCharges: v })} min={0} max={2_000_000} sliderMax={60_000} step={100} unit="$" hint="Labs, imaging, ER, surgery, childbirth." />
      </Card>

      {input.plans.map((plan, index) => {
        const terms = getTierTerms(plan, input.coverageTier);
        return (
          <Card
            key={plan.id}
            title={plan.name}
            note={plan.type === "HDHP_HSA" ? "High-deductible plan with a Health Savings Account" : "Traditional PPO"}
          >
            <SliderField label="Your monthly premium" value={terms.monthlyPremium} onChange={(v) => setTerm(index, "monthlyPremium", v)} min={0} max={5_000} sliderMax={1_200} step={5} unit="$" />
            <SliderField label="Deductible" value={terms.deductible} onChange={(v) => setTerm(index, "deductible", v)} min={0} max={30_000} sliderMax={15_000} step={50} unit="$" />
            <SliderField label="Coinsurance (your share after deductible)" value={plan.coinsuranceRate * 100} onChange={(v) => setPlan(index, { ...plan, coinsuranceRate: v / 100 })} min={0} max={100} step={5} unit="%" />
            <SliderField label="Out-of-pocket maximum" value={terms.oopMax} onChange={(v) => setTerm(index, "oopMax", v)} min={0} max={40_000} sliderMax={20_000} step={50} unit="$" />
            {plan.type === "HDHP_HSA" && (
              <SliderField label="Employer HSA seed" value={terms.employerHsaContribution} onChange={(v) => setTerm(index, "employerHsaContribution", v)} min={0} max={9_000} step={50} unit="$" hint="Counts toward the IRS limit." />
            )}
            {plan.copays && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">Copays (paid before the deductible)</p>
                <SliderField label="Primary care visit" value={plan.copays.primaryCare ?? 0} onChange={(v) => setCopay(index, "primaryCare", v)} min={0} max={500} sliderMax={100} step={5} unit="$" />
                <SliderField label="Specialist visit" value={plan.copays.specialist ?? 0} onChange={(v) => setCopay(index, "specialist", v)} min={0} max={500} sliderMax={150} step={5} unit="$" />
                <SliderField label="Prescription fill" value={plan.copays.rx ?? 0} onChange={(v) => setCopay(index, "rx", v)} min={0} max={500} sliderMax={100} step={5} unit="$" />
              </div>
            )}
          </Card>
        );
      })}

      <Card title="Your accounts" note="Pre-tax payroll contributions for 2027.">
        <SliderField label="Planned HSA contribution (you)" value={input.plannedHsaContribution} onChange={(v) => set({ plannedHsaContribution: v })} min={0} max={20_000} sliderMax={10_000} step={50} unit="$" hint={`2027 IRS limit: $${IRS_2027.hsaLimit.SELF_ONLY.toLocaleString("en-US")} self-only, $${IRS_2027.hsaLimit.FAMILY.toLocaleString("en-US")} family, employer money included.`} />
        <SliderField label="Planned health FSA contribution" value={input.plannedFsaContribution} onChange={(v) => set({ plannedFsaContribution: v })} min={0} max={20_000} sliderMax={5_000} step={50} unit="$" hint={`Counted on plans without an HSA. 2027 limit: $${IRS_2027.healthFsaLimit.toLocaleString("en-US")}.`} />
      </Card>
    </div>
  );
}
