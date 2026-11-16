export type QrKind =
  | { kind: 'molotov'; handle: string }
  | { kind: 'qrph'; crcOk: boolean; merchant: string | null; amount: string | null }
  | { kind: 'unknown' };

const crc16 = (str: string) => {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

/** Local, instant classification used by the scanner. The server re-checks everything; this never authorises payment. */
export function classifyScan(data: string): QrKind {
  const p = (data ?? '').trim();
  const m = /^molotov-sandbox:\/\/pay\/([a-z0-9_]{3,24})$/i.exec(p);
  if (m) return { kind: 'molotov', handle: m[1].toLowerCase() };
  if (/^000201/.test(p) && p.length >= 20 && p.length <= 1024) {
    const tail = p.slice(-8);
    const crcOk = tail.startsWith('6304') && crc16(p.slice(0, -4)) === tail.slice(4).toUpperCase();
    const tlv = (tag: string) => {
      let i = 0;
      while (i + 4 <= p.length) {
        const t = p.slice(i, i + 2), len = Number(p.slice(i + 2, i + 4));
        if (Number.isNaN(len)) return null;
        if (t === tag) return p.slice(i + 4, i + 4 + len);
        i += 4 + len;
      }
      return null;
    };
    return { kind: 'qrph', crcOk, merchant: tlv('59'), amount: tlv('54') };
  }
  return { kind: 'unknown' };
}
