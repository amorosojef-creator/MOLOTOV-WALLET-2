/**
 * Pure reconciliation helper: compares internal transfer rows with provider settlement rows
 * ({reference, amountCents}). Used by future adapters' reconcileSettlement().
 */
export function reconcile(internal, provider) {
  const p = new Map(provider.map((r) => [r.reference, r]));
  const i = new Map(internal.map((r) => [r.reference, r]));
  const missingAtProvider = [], missingInternally = [], amountMismatch = [];
  let matched = 0;
  for (const [ref, row] of i) {
    const other = p.get(ref);
    if (!other) missingAtProvider.push(ref);
    else if (other.amountCents !== row.amountCents) amountMismatch.push({ reference: ref, internal: row.amountCents, provider: other.amountCents });
    else matched++;
  }
  for (const ref of p.keys()) if (!i.has(ref)) missingInternally.push(ref);
  return { matched, missingAtProvider, missingInternally, amountMismatch, clean: !missingAtProvider.length && !missingInternally.length && !amountMismatch.length };
}
