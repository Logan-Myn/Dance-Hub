// Shared formatters for the platform admin tables and dashboard.
// Uses en-US Intl with EUR currency to match the rest of the app.

const EUR_BIG = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const EUR_SMALL = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

// Drop the cents on amounts >= €1,000 so dense KPI tiles stay legible.
export function formatEur(amount: number): string {
  return amount >= 1000 ? EUR_BIG.format(amount) : EUR_SMALL.format(amount);
}
