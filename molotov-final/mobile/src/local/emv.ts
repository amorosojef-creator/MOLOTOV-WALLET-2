// EMVCo Merchant-Presented-Mode QR inspector (used by QR Ph). INSPECTION ONLY:
// parsing a QR is never payment authorisation.

export function crc16ccitt(str: string) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) & 0xff) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function parseTlv(s: string) {
  const out: { tag: string; value: string }[] = [];
  let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) throw new Error('Truncated TLV header');
    const tag = s.slice(i, i + 2), lenStr = s.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) throw new Error('Non-numeric tag or length');
    const len = Number(lenStr), value = s.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new Error(`Tag ${tag} length overruns payload`);
    out.push({ tag, value });
    i += 4 + len;
  }
  return out;
}

const BLOCKED = 'Real payments are disabled: no licensed payment provider is connected. This QR can only be inspected.';

export function inspectQr(input: unknown): any {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > 1024) return { type: 'invalid', executable: false, reason: 'Empty or oversized QR payload' };

  if (raw.startsWith('molotov-sandbox://')) {
    const m = /^molotov-sandbox:\/\/pay\/([A-Za-z0-9_]{3,24})\/?$/.exec(raw);
    if (!m) return { type: 'invalid', executable: false, reason: 'Malformed Molotov sandbox QR' };
    return { type: 'molotov_sandbox', handle: m[1].toLowerCase(), executable: true, sandbox: true };
  }

  if (!raw.startsWith('000201')) return { type: 'unknown', executable: false, reason: 'Not a Molotov or EMVCo payment QR', blockedReason: BLOCKED };

  let tlv: { tag: string; value: string }[];
  try { tlv = parseTlv(raw); } catch (e: any) { return { type: 'emvco_mpm', crcValid: false, executable: false, reason: 'Malformed EMVCo payload: ' + e.message, blockedReason: BLOCKED }; }

  const tags = new Map<string, string>();
  for (const { tag, value } of tlv) {
    if (tags.has(tag)) return { type: 'emvco_mpm', crcValid: false, executable: false, reason: `Duplicate tag ${tag}`, blockedReason: BLOCKED };
    tags.set(tag, value);
  }
  const last = tlv[tlv.length - 1];
  const crcOk = last?.tag === '63' && last.value.length === 4 && crc16ccitt(raw.slice(0, -4)) === last.value.toUpperCase();

  const accounts: any[] = [];
  for (const { tag, value } of tlv) {
    const n = Number(tag);
    if (n >= 2 && n <= 51) {
      let sub: { tag: string; value: string }[] = [];
      try { sub = parseTlv(value); } catch { /* keep raw only */ }
      accounts.push({ tag, guid: sub.find((x) => x.tag === '00')?.value ?? null, fields: Object.fromEntries(sub.map((x) => [x.tag, x.value])) });
    }
  }
  let additional: any = null;
  if (tags.has('62')) { try { additional = Object.fromEntries(parseTlv(tags.get('62') as string).map((x) => [x.tag, x.value])); } catch { additional = null; } }

  const currency = tags.get('53') ?? null, country = tags.get('58') ?? null;
  return {
    type: 'emvco_mpm',
    formatIndicator: tags.get('00'),
    initiation: tags.get('01') === '11' ? 'static' : tags.get('01') === '12' ? 'dynamic' : (tags.get('01') ?? null),
    crcValid: crcOk,
    accounts,
    merchantCategoryCode: tags.get('52') ?? null,
    currency, currencyIsPHP: currency === '608',
    amount: tags.get('54') ?? null,
    country, merchantName: tags.get('59') ?? null, merchantCity: tags.get('60') ?? null,
    additional,
    // Structural plausibility only. This does NOT prove the payee is genuine or reachable.
    looksLikeQrPh: crcOk && country === 'PH' && currency === '608',
    executable: false,
    blockedReason: BLOCKED,
  };
}
