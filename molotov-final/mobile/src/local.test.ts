import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createEngine } from './local/engine.ts';

const mk = () => {
  let store: string | null = null;
  return createEngine({ load: async () => store, save: async (s) => { store = s; }, hash: async (a, b) => crypto.createHash('sha256').update(`${a}:${b}`).digest('hex'), random: (n) => crypto.randomBytes(n).toString('hex') });
};
const reg = async (e: ReturnType<typeof mk>, h: string) => (await e('/api/auth/register', 'POST', { email: `${h}@t.dev`, password: 'correct-horse-battery', handle: h, pin: '123456' })).data.accessToken as string;

test('standalone: two accounts, fund, send, receive, history, idempotency, insufficient funds', async () => {
  const e = mk(); const a = await reg(e, 'alex'), b = await reg(e, 'emma');
  assert.equal((await e('/api/sandbox/credit', 'POST', { amount: '1000.00' }, 'credit-0001', a)).data.balance, '1000.00');
  const s1 = await e('/api/sandbox/send', 'POST', { to: 'emma', amount: '250.50', pin: '123456', note: 'dinner' }, 'send-key-1', a);
  assert.equal(s1.status, 201); assert.equal(s1.data.transfer.status, 'completed');
  const s2 = await e('/api/sandbox/send', 'POST', { to: '@emma', amount: '250.50', pin: '123456', note: 'dinner' }, 'send-key-1', a);
  assert.equal(s2.data.replayed, true);
  assert.equal((await e('/api/me', 'GET', undefined, undefined, a)).data.balance, '749.50');
  assert.equal((await e('/api/me', 'GET', undefined, undefined, b)).data.balance, '250.50');
  const hb = (await e('/api/transactions?limit=20&q=dinner', 'GET', undefined, undefined, b)).data.items;
  assert.equal(hb.length, 1); assert.equal(hb[0].direction, 'in'); assert.equal(hb[0].counterparty.handle, 'alex');
  assert.equal((await e('/api/sandbox/send', 'POST', { to: 'alex', amount: '999', pin: '123456' }, 'send-key-2', b)).data.code, 'INSUFFICIENT_FUNDS');
  assert.equal((await e('/api/sandbox/send', 'POST', { to: 'emma', amount: '1', pin: '000000' }, 'send-key-3', a)).data.code, 'PIN_INVALID');
  assert.equal((await e('/api/sandbox/send', 'POST', { to: 'emma', amount: '999', pin: '123456' }, 'send-key-1', a)).status, 409);
});

test('standalone: 20 parallel sends from a 100.00 wallet -> exactly 10 succeed, money conserved', async () => {
  const e = mk(); const a = await reg(e, 'alex'), b = await reg(e, 'emma');
  await e('/api/sandbox/credit', 'POST', { amount: '100.00' }, 'credit-0001', a);
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => e('/api/sandbox/send', 'POST', { to: 'emma', amount: '10.00', pin: '123456' }, `par-key-${i}-xx`, a)));
  assert.equal(rs.filter((r) => r.status === 201).length, 10);
  assert.equal((await e('/api/me', 'GET', undefined, undefined, a)).data.balance, '0.00');
  assert.equal((await e('/api/me', 'GET', undefined, undefined, b)).data.balance, '100.00');
});

test('standalone: auth rules, unauthenticated access, QR Ph never executes, live disabled', async () => {
  const e = mk(); const a = await reg(e, 'alex');
  assert.equal((await e('/api/me', 'GET')).status, 401);
  assert.equal((await e('/api/auth/login', 'POST', { email: 'alex@t.dev', password: 'wrong-password-x' })).status, 401);
  assert.equal((await e('/api/auth/register', 'POST', { email: 'alex@t.dev', password: 'correct-horse-battery', handle: 'other', pin: '123456' })).status, 409);
  const q = await e('/api/qr/inspect', 'POST', { payload: '00020101021126270015ph.example.test010400005204599953036085802PH6304ABCD' }, undefined, a);
  assert.equal(q.data.executable, false);
  assert.equal((await e('/api/transfers/live', 'POST', {}, undefined, a)).status, 501);
});

test('standalone: data persists across app restarts', async () => {
  let store: string | null = null;
  const deps = { load: async () => store, save: async (s: string) => { store = s; }, hash: async (a: string, b: string) => `${a}:${b}`, random: (n: number) => crypto.randomBytes(n).toString('hex') };
  const e1 = createEngine(deps); const t = (await e1('/api/auth/register', 'POST', { email: 'a@t.dev', password: 'correct-horse-battery', handle: 'alex', pin: '123456' })).data.accessToken;
  const e2 = createEngine(deps);
  assert.equal((await e2('/api/me', 'GET', undefined, undefined, t)).data.handle, 'alex');
});
