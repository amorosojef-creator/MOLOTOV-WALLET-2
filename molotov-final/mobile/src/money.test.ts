import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCents, formatPeso, sanitizeAmountInput } from './money.ts';
import { classifyScan } from './qr.ts';

test('parseCents', () => {
  assert.equal(parseCents('100'), 10000);
  assert.equal(parseCents('1,250.5'), 125050);
  assert.equal(parseCents('0.01'), 1);
  for (const bad of ['', '0', '0.00', '-1', '1.234', 'abc', '1e3', '01', '.5']) assert.equal(parseCents(bad), null, bad);
});
test('formatPeso', () => {
  assert.equal(formatPeso('2450'), '₱2,450.00');
  assert.equal(formatPeso(1234567.5), '₱1,234,567.50');
  assert.equal(formatPeso('x'), '₱0.00');
});
test('sanitizeAmountInput', () => {
  assert.equal(sanitizeAmountInput('12a.345.6'), '12.34');
  assert.equal(sanitizeAmountInput('007'), '7');
  assert.equal(sanitizeAmountInput('.'), '.');
});
test('classifyScan: sandbox qr, qrph crc, unknown', () => {
  assert.deepEqual(classifyScan('molotov-sandbox://pay/Bob_1'), { kind: 'molotov', handle: 'bob_1' });
  assert.equal(classifyScan('molotov-sandbox://pay/b').kind, 'unknown');
  assert.equal(classifyScan('https://example.com').kind, 'unknown');
  // payload with known-good CRC (same builder logic as backend test helper)
  const body = '000201010211' + '26270015ph.example.test01040000' + '52045999' + '5303608' + '5802PH5913TEST MERCHANT6006MANILA' + '6304';
  const crcFn = (s: string) => { let c = 0xffff; for (const ch of s) { c ^= ch.charCodeAt(0) << 8; for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, '0'); };
  const good = body + crcFn(body);
  const r = classifyScan(good);
  assert.equal(r.kind, 'qrph'); if (r.kind === 'qrph') { assert.equal(r.crcOk, true); assert.equal(r.merchant, 'TEST MERCHANT'); }
  const bad = classifyScan(good.replace('TEST', 'FAKE'));
  assert.equal(bad.kind, 'qrph'); if (bad.kind === 'qrph') assert.equal(bad.crcOk, false);
});
