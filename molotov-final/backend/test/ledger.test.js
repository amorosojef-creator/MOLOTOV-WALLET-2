import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';
import { ledgerHealth } from '../src/ledger.js';

let t;
before(async () => { t = await startTestServer(); });
after(async () => { await t.close(); });
const healthy = async () => {
  const h = await ledgerHealth(t.pool);
  assert.deepEqual({ a: h.cachedBalanceMismatches, b: h.unbalancedTransfers, c: h.journalNetCents }, { a: 0, b: 0, c: 0 }, 'journal must balance and match cached balances');
  return h;
};

test('two-account sandbox transfer end-to-end', async () => {
  const alice = await t.register('alice'), bob = await t.register('bob');
  assert.equal(await t.balance(alice), '0.00');
  const c = await t.credit(alice, '500.00');
  assert.equal(c.status, 201);
  assert.equal(c.body.balance, '500.00');

  const s = await t.send(alice, 'bob', '120.50', { body: { note: 'Dinner' } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal(s.body.transfer.status, 'completed');
  assert.equal(s.body.transfer.fee, '0.00');
  assert.equal(s.body.transfer.total, '120.50');
  assert.equal(s.body.transfer.sandbox, true);
  assert.match(s.body.transfer.reference, /^MLT-[0-9A-F]{10}$/);
  assert.equal(await t.balance(alice), '379.50');
  assert.equal(await t.balance(bob), '120.50');

  const ha = await t.api('GET', '/api/transactions', { token: alice.token });
  const hb = await t.api('GET', '/api/transactions', { token: bob.token });
  assert.equal(ha.body.items[0].direction, 'out');
  assert.equal(ha.body.items[0].counterparty.handle, 'bob');
  assert.equal(hb.body.items[0].direction, 'in');
  assert.equal(hb.body.items[0].counterparty.handle, 'alice');
  assert.equal(hb.body.items[0].note, 'Dinner');

  const rcpt = await t.api('GET', `/api/transactions/${s.body.transfer.id}`, { token: bob.token });
  assert.equal(rcpt.status, 200);
  const carol = await t.register('carol');
  assert.equal((await t.api('GET', `/api/transactions/${s.body.transfer.id}`, { token: carol.token })).status, 404, 'non-participants cannot read receipts');
  await healthy();
});

test('QR address and @handle both resolve; search and filters work', async () => {
  const dan = await t.register('dan'), erin = await t.register('erin');
  await t.credit(dan, '300');
  assert.equal((await t.send(dan, 'molotov-sandbox://pay/erin', '10.00')).status, 201);
  assert.equal((await t.send(dan, '@erin', '5.25', { body: { note: 'coffee beans' } })).status, 201);
  const q = await t.api('GET', '/api/transactions?q=beans', { token: erin.token });
  assert.equal(q.body.items.length, 1);
  const out = await t.api('GET', '/api/transactions?direction=out', { token: dan.token });
  assert.equal(out.body.items.length, 2);
  const page1 = await t.api('GET', '/api/transactions?limit=1', { token: dan.token });
  assert.equal(page1.body.items.length, 1);
  assert.ok(page1.body.nextCursor);
  const page2 = await t.api('GET', `/api/transactions?limit=5&before=${encodeURIComponent(page1.body.nextCursor)}`, { token: dan.token });
  assert.ok(page2.body.items.every((x) => x.id !== page1.body.items[0].id));
});

test('rejections: insufficient funds, bad PIN, self, unknown, invalid amounts, QR Ph, no auth', async () => {
  const u = await t.register('frank'); await t.register('gina');
  await t.credit(u, '50');
  let r = await t.send(u, 'gina', '50.01'); assert.equal(r.status, 400); assert.equal(r.body.code, 'INSUFFICIENT_FUNDS');
  r = await t.send(u, 'gina', '1', { body: { pin: '000000' } }); assert.equal(r.body.code, 'PIN_INVALID');
  r = await t.send(u, 'frank', '1'); assert.equal(r.body.code, 'SELF_TRANSFER');
  r = await t.send(u, 'nobody_here', '1'); assert.equal(r.status, 404);
  for (const bad of ['0', '-5', 'abc', '0.001', '1e3', '', '100000000000']) {
    r = await t.send(u, 'gina', bad); assert.equal(r.status, 400, `amount ${bad}`); assert.equal(r.body.code, 'INVALID_AMOUNT');
  }
  const qrph = '00020101021226280012ph.ppmi.p2m0108ABCD1234520459995303608540510.005802PH5910TEST STORE6006MANILA6304ABCD';
  r = await t.send(u, qrph, '1'); assert.equal(r.status, 501); assert.equal(r.body.code, 'LIVE_DISABLED');
  r = await t.api('POST', '/api/sandbox/send', { body: { to: 'gina', amount: '1', pin: '123456' }, key: 'abcdefgh1' }); assert.equal(r.status, 401);
  r = await t.api('POST', '/api/sandbox/send', { token: u.token, body: { to: 'gina', amount: '1', pin: '123456' } }); assert.equal(r.body.code, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(await t.balance(u), '50.00', 'no failed attempt may move money');
  await healthy();
});

test('idempotent retry: same key replays once; different body is rejected', async () => {
  const a = await t.register('hank'), b = await t.register('ivy');
  await t.credit(a, '100');
  const key = 'retry-key-0001';
  const first = await t.send(a, 'ivy', '30', { key });
  const second = await t.send(a, 'ivy', '30', { key });
  assert.equal(first.status, 201); assert.equal(second.status, 200);
  assert.equal(second.body.replayed, true);
  assert.equal(second.body.transfer.id, first.body.transfer.id);
  assert.equal(await t.balance(a), '70.00'); assert.equal(await t.balance(b), '30.00');
  const clash = await t.send(a, 'ivy', '31', { key });
  assert.equal(clash.status, 422); assert.equal(clash.body.code, 'IDEMPOTENCY_MISMATCH');
  assert.equal(await t.balance(a), '70.00');
  // credit idempotency too
  const ck = 'credit-key-0001';
  const c1 = await t.api('POST', '/api/sandbox/credit', { token: a.token, body: { amount: '5' }, key: ck });
  const c2 = await t.api('POST', '/api/sandbox/credit', { token: a.token, body: { amount: '5' }, key: ck });
  assert.equal(c1.body.transfer.id, c2.body.transfer.id); assert.equal(await t.balance(a), '75.00');
  await healthy();
});

test('concurrency: 25 parallel sends from a 100.00 wallet -> exactly 10 succeed, never overspends', async () => {
  const a = await t.register('jack'), b = await t.register('kate');
  await t.credit(a, '100');
  const results = await Promise.all(Array.from({ length: 25 }, () => t.send(a, 'kate', '10.00')));
  const ok = results.filter((r) => r.status === 201).length;
  const insufficient = results.filter((r) => r.body.code === 'INSUFFICIENT_FUNDS').length;
  assert.equal(ok, 10); assert.equal(insufficient, 15);
  assert.equal(await t.balance(a), '0.00'); assert.equal(await t.balance(b), '100.00');
  await healthy();
});

test('concurrency: 12 parallel retries with ONE key create ONE transfer', async () => {
  const a = await t.register('liam'), b = await t.register('mona');
  await t.credit(a, '100');
  const key = 'same-key-parallel-1';
  const results = await Promise.all(Array.from({ length: 12 }, () => t.send(a, 'mona', '20.00', { key })));
  assert.ok(results.every((r) => r.status === 201 || r.status === 200), JSON.stringify(results.map((r) => r.status)));
  assert.equal(new Set(results.map((r) => r.body.transfer.id)).size, 1);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(await t.balance(a), '80.00'); assert.equal(await t.balance(b), '20.00');
  const n = (await t.pool.query(`SELECT COUNT(*)::int n FROM transfers WHERE idempotency_key = $1`, [key])).rows[0].n;
  assert.equal(n, 1);
  await healthy();
});

test('concurrency: crossing transfers A<->B (deadlock check) conserve money', async () => {
  const a = await t.register('nick'), b = await t.register('olga');
  await t.credit(a, '1000'); await t.credit(b, '1000');
  const jobs = [];
  for (let i = 0; i < 30; i++) { jobs.push(t.send(a, 'olga', '7.00')); jobs.push(t.send(b, 'nick', '3.00')); }
  const res = await Promise.all(jobs);
  assert.ok(res.every((r) => r.status === 201), 'no deadlock / failure: ' + JSON.stringify(res.filter((r) => r.status !== 201).map((r) => r.body)));
  assert.equal(await t.balance(a), (1000 - 30 * 7 + 30 * 3).toFixed(2));
  assert.equal(await t.balance(b), (1000 + 30 * 7 - 30 * 3).toFixed(2));
  await healthy();
});

test('sandbox limits are enforced', async () => {
  const a = await t.register('pete'); await t.register('quin');
  let r = await t.credit(a, '10000.01'); assert.equal(r.status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await t.credit(a, '10000')).status, 201);
  r = await t.credit(a, '1'); assert.equal(r.status, 422, 'wallet cap 50,000');
  r = await t.send(a, 'quin', '50000.01'); assert.equal(r.status, 400);
  assert.equal((await t.send(a, 'quin', '50000')).status, 201);
});

test('database enforces the ledger even against buggy application code', async () => {
  const a = await t.register('rick');
  const acct = (await t.pool.query('SELECT id FROM ledger_accounts WHERE user_id = $1', [a.id])).rows[0].id;
  const mk = async (c) => (await c.query(`INSERT INTO transfers(reference,kind,actor_id,receiver_id,amount_cents,status) VALUES ('MLT-TEST'||floor(random()*1e9)::text,'sandbox_credit',$1,$1,100,'completed') RETURNING id`, [a.id])).rows[0].id;

  // 1. unbalanced journal is rejected at COMMIT
  let c = await t.pool.connect();
  try {
    await c.query('BEGIN'); const id = await mk(c);
    await c.query('INSERT INTO journal_lines(transfer_id,account_id,delta_cents) VALUES ($1,$2,100)', [id, acct]);
    await assert.rejects(c.query('COMMIT'), /Unbalanced journal/);
  } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }

  // 2. overdraft rejected
  c = await t.pool.connect();
  try {
    await c.query('BEGIN'); const id = await mk(c);
    const issuer = (await c.query(`SELECT id FROM ledger_accounts WHERE kind='sandbox_issuer'`)).rows[0].id;
    await assert.rejects(c.query('INSERT INTO journal_lines(transfer_id,account_id,delta_cents) VALUES ($1,$2,-100),($1,$3,100)', [id, acct, issuer]), /no_overdraft/);
  } finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }

  // 3. append-only journal and audit log
  const any = (await t.pool.query('SELECT id FROM journal_lines LIMIT 1')).rows[0];
  if (any) {
    await assert.rejects(t.pool.query('UPDATE journal_lines SET delta_cents = 1 WHERE id = $1', [any.id]), /append-only/);
    await assert.rejects(t.pool.query('DELETE FROM journal_lines WHERE id = $1', [any.id]), /append-only/);
  }
  await assert.rejects(t.pool.query('DELETE FROM audit_log'), /append-only/);

  // 4. this build cannot write non-sandbox rows
  await assert.rejects(t.pool.query(`INSERT INTO transfers(reference,environment,kind,actor_id,receiver_id,amount_cents,status) VALUES ('MLT-LIVE','live','sandbox_credit',$1,$1,1,'completed')`, [a.id]), /environment/);
  await healthy();
});
