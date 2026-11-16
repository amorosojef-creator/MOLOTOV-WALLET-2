import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc16ccitt, inspectQr, parseTlv } from '../src/qr/emv.js';
import { parseAmount, formatCents } from '../src/money.js';
import { reconcile } from '../src/providers/reconcile.js';

const tlv = (tag, v) => tag + String(v.length).padStart(2, '0') + v;
function build({ country = 'PH', currency = '608', amount, name = 'TEST STORE' } = {}) {
  const body = tlv('00', '01') + tlv('01', amount ? '12' : '11') +
    tlv('26', tlv('00', 'ph.example.p2m') + tlv('01', 'ACC12345')) +
    tlv('52', '5999') + tlv('53', currency) + (amount ? tlv('54', amount) : '') + tlv('58', country) + tlv('59', name) + tlv('60', 'MANILA') + '6304';
  return body + crc16ccitt(body);
}

test('CRC-16/CCITT-FALSE matches the published check value for "123456789"', () => {
  assert.equal(crc16ccitt('123456789'), '29B1');
});

test('valid EMVCo PH payload is parsed, CRC verified and still NOT executable', () => {
  const r = inspectQr(build({ amount: '10.00' }));
  assert.equal(r.type, 'emvco_mpm'); assert.equal(r.crcValid, true); assert.equal(r.looksLikeQrPh, true);
  assert.equal(r.amount, '10.00'); assert.equal(r.initiation, 'dynamic'); assert.equal(r.merchantName, 'TEST STORE');
  assert.equal(r.accounts[0].guid, 'ph.example.p2m');
  assert.equal(r.executable, false); assert.match(r.blockedReason, /no licensed payment provider/);
});

test('tampering, wrong country/currency, truncation, duplicates are flagged', () => {
  const good = build();
  const tampered = good.replace('TEST STORE', 'TEST STORF');
  assert.equal(inspectQr(tampered).crcValid, false); assert.equal(inspectQr(tampered).looksLikeQrPh, false);
  assert.equal(inspectQr(build({ country: 'US' })).looksLikeQrPh, false);
  assert.equal(inspectQr(build({ currency: '840' })).looksLikeQrPh, false);
  const trunc = inspectQr(good.slice(0, 40)); assert.equal(trunc.crcValid, false); assert.match(trunc.reason, /Malformed/);
  const dup = inspectQr('000201' + '000201' + '6304ABCD'); assert.match(dup.reason, /Duplicate/);
  assert.throws(() => parseTlv('00ZZ'), /Non-numeric/);
  assert.equal(inspectQr('A'.repeat(2000)).type, 'invalid');
});

test('Molotov sandbox QR and other payloads', () => {
  assert.deepEqual(inspectQr('molotov-sandbox://pay/Bob_99'), { type: 'molotov_sandbox', handle: 'bob_99', executable: true, sandbox: true });
  assert.equal(inspectQr('molotov-sandbox://pay/../etc').type, 'invalid');
  assert.equal(inspectQr('https://example.com').type, 'unknown');
  assert.equal(inspectQr('').type, 'invalid');
});

test('money parsing is exact', () => {
  assert.equal(parseAmount('0.01'), 1); assert.equal(parseAmount('100'), 10000); assert.equal(parseAmount('19.99'), 1999);
  assert.equal(parseAmount(0.1 + 0.2), null);
  for (const bad of ['', '0', '00.5', '1.234', '-1', '1,000', ' ', null, undefined, 'NaN']) assert.equal(parseAmount(bad), null, String(bad));
  assert.equal(formatCents(1999), '19.99');
});

test('reconciliation helper finds every kind of break', () => {
  const r = reconcile(
    [{ reference: 'A', amountCents: 100 }, { reference: 'B', amountCents: 200 }, { reference: 'C', amountCents: 300 }],
    [{ reference: 'A', amountCents: 100 }, { reference: 'B', amountCents: 250 }, { reference: 'D', amountCents: 50 }]);
  assert.deepEqual(r, { matched: 1, missingAtProvider: ['C'], missingInternally: ['D'], amountMismatch: [{ reference: 'B', internal: 200, provider: 250 }], clean: false });
  assert.equal(reconcile([{ reference: 'A', amountCents: 1 }], [{ reference: 'A', amountCents: 1 }]).clean, true);
});
