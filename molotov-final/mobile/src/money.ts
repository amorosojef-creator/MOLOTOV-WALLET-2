/** Parse user-typed PHP amount to integer centavos; null if invalid. Mirrors backend rules (max 2dp, > 0). */
export function parseCents(input: string): number | null {
  const s = input.trim().replace(/,/g, '');
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  const n = Number(w) * 100 + Number(f.padEnd(2, '0'));
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

export function formatPeso(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '₱0.00';
  const neg = n < 0;
  const [w, f] = Math.abs(n).toFixed(2).split('.');
  return `${neg ? '-' : ''}₱${w.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${f}`;
}

/** Keep only digits and one decimal point, max 2 decimals (for amount inputs). */
export function sanitizeAmountInput(raw: string): string {
  let s = raw.replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 2);
  return s.replace(/^0+(?=\d)/, '').slice(0, 13);
}
