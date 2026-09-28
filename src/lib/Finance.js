// Shared helpers for the Ledger, Balance Sheet, and Income Statement pages.

export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Amounts are stored in cents.
export function formatPeso(cents = 0) {
  return (toNumber(cents) / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });
}

// YYYY-MM-DD in the user's local timezone. Do not use toISOString() for
// this: it converts to UTC, which shifts the date back a day in the
// Philippines between 12:00 AM and 8:00 AM.
export function localDateKey(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function firstOfMonthKey(date = new Date()) {
  return localDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}