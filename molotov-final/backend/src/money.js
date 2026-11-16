// Amounts travel as decimal strings ("100.00") and are stored as integer centavos.
export function parseAmount(value, { max = 10_000_000_000 } = {}) {
  const s = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= max ? cents : null;
}
export const formatCents = (c) => (Number(c) / 100).toFixed(2);
