export function formatEUR(value: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

export function parseMoneyDE(input: string): number {
  // Accepts "1.234,56" or "1234,56" or "1234.56" (best-effort).
  const s = (input ?? '').trim();
  if (!s) return NaN;

  // Remove spaces
  const x = s.replace(/\s/g, '');

  // If it contains a comma, treat comma as decimal separator and strip thousand dots
  if (x.includes(',')) {
    const normalized = x.replace(/\./g, '').replace(',', '.');
    return Number(normalized);
  }

  // Otherwise let Number handle it (e.g. "1234.56", "-20.00")
  return Number(x);
}
