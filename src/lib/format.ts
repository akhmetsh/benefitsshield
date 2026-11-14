const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole dollars: $1,234 */
export function usd(value: number): string {
  return usd0.format(value);
}

/** Dollars and cents: $1,234.56 (headline figures) */
export function usdCents(value: number): string {
  return usd2.format(value);
}

export function percent(rate: number, digits = 0): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
