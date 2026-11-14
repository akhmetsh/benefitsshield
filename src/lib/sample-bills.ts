/**
 * Fictional statements for the client-side bill simulator. They are inputs only:
 * the verdict always comes from auditBill(). No real bill is read or stored.
 */

export interface BillLineItem {
  description: string;
  cpt: string;
  amount: number;
}

export interface SampleBill {
  id: "hospital" | "urgent";
  facility: string;
  lineItems: BillLineItem[];
}

export const HOSPITAL_BILL: SampleBill = {
  id: "hospital",
  facility: "Lakeside Regional Hospital — Emergency Dept.",
  lineItems: [
    { description: "ER facility fee, level 4", cpt: "99284", amount: 1_850 },
    { description: "CT abdomen and pelvis with contrast", cpt: "74177", amount: 1_500 },
    { description: "Metabolic panel and blood count", cpt: "80053 / 85025", amount: 450 },
    { description: "Emergency physician professional fee", cpt: "99284-26", amount: 400 },
  ],
};

export const URGENT_BILL: SampleBill = {
  id: "urgent",
  facility: "Northside Urgent Care",
  lineItems: [
    { description: "Urgent care visit, level 4", cpt: "99214", amount: 520 },
    { description: "Ankle X-ray, 3 views", cpt: "73610", amount: 380 },
    { description: "Rapid tests and splint", cpt: "87880 / 29515", amount: 300 },
  ],
};

export function billTotal(bill: SampleBill): number {
  return bill.lineItems.reduce((sum, item) => sum + item.amount, 0);
}

/** What the clinic demands on the overcharged hospital sample. */
export const HOSPITAL_DEMAND = 2_650;
