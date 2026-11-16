import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startTestServer } from './helpers.js';
import { loadConfig } from '../src/config.js';

let t;
before(async () => { t = await startTestServer(); });
after(async () => { await t.close(); });
const reg = (o = {}) => t.api('POST', '/api/auth/register', { body: { email: 'x@test.dev', password: 'correct-horse-battery', handle: 'xx_user', pin: '123456', ...o } });

test('registration validation and duplicates', async () => {
  assert.equal((await reg({ password: 'short' })).status, 400);
  assert.equal((await reg({ pin: '12ab56' })).status, 400);
  assert.equal((await reg({ handle: 'a b' })).status, 400);
  assert.equal((await reg({ email: 'nope' })).status, 400);
  assert.equal((await reg()).status, 201);
  assert.equal((await reg({ handle: 'other_one' })).body.code, 'ALREADY_REGISTERED', 'duplicate email');
  assert.equal((await reg({ email: 'y@test.dev' })).body.code, 'ALREADY_REGISTERED', 'duplicate handle');
  assert.equal((await reg({ email: 'X@Test.dev', handle: 'case_dup' })).status, 409, 'email is case-insensitive');
});

test('login, wrong password, lockout after 5 failures', async () => {
  await reg({ email: 'lock@test.dev', handle: 'lock_user' });
  const login = (password) => t.api('POST', '/api/auth/login', { body: { email: 'lock@test.dev', password } });
  assert.equal((await login('correct-horse-battery')).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await login('wrong-wrong-wrong')).status, 401);
  const locked = await login('correct-horse-battery');
  assert.equal(locked.status, 429); assert.equal(locked.body.code, 'ACCOUNT_LOCKED');
  assert.equal((await t.api('POST', '/api/auth/login', { body: { email: 'ghost@test.dev', password: 'whatever-whatever' } })).status, 401);
});

test('access tokens: rejected when forged, wrong audience, expired, or after logout-all', async () => {
  const u = await t.register('tok_user');
  assert.equal((await t.api('GET', '/api/me', { token: u.token })).status, 200);
  assert.equal((await t.api('GET', '/api/me', { token: 'garbage' })).status, 401);
  const forged = jwt.sign({ sub: u.id, ver: 0 }, 'x'.repeat(40), { algorithm: 'HS256', issuer: 'molotov-sandbox-api', audience: 'molotov-app' });
  assert.equal((await t.api('GET', '/api/me', { token: forged })).status, 401);
  const noAud = jwt.sign({ sub: u.id, ver: 0 }, t.cfg.jwtSecret);
  assert.equal((await t.api('GET', '/api/me', { token: noAud })).status, 401);
  const expired = jwt.sign({ sub: u.id, ver: 0 }, t.cfg.jwtSecret, { issuer: 'molotov-sandbox-api', audience: 'molotov-app', expiresIn: -10 });
  assert.equal((await t.api('GET', '/api/me', { token: expired })).status, 401);
  assert.equal((await t.api('POST', '/api/auth/logout-all', { token: u.token })).status, 200);
  assert.equal((await t.api('GET', '/api/me', { token: u.token })).status, 401, 'old access token dies after logout-all');
  assert.equal((await t.api('POST', '/api/auth/refresh', { body: { refreshToken: u.refresh } })).status, 401, 'refresh tokens revoked too');
});

test('refresh rotation; reusing an old refresh token revokes the whole family', async () => {
  const u = await t.register('rot_user');
  const r1 = await t.api('POST', '/api/auth/refresh', { body: { refreshToken: u.refresh } });
  assert.equal(r1.status, 200);
  assert.equal((await t.api('GET', '/api/me', { token: r1.body.accessToken })).status, 200);
  const replay = await t.api('POST', '/api/auth/refresh', { body: { refreshToken: u.refresh } });
  assert.equal(replay.status, 401);
  const after = await t.api('POST', '/api/auth/refresh', { body: { refreshToken: r1.body.refreshToken } });
  assert.equal(after.status, 401, 'successor token is revoked after reuse detection');
});

test('logout revokes the refresh token', async () => {
  const u = await t.register('out_user');
  await t.api('POST', '/api/auth/logout', { body: { refreshToken: u.refresh } });
  assert.equal((await t.api('POST', '/api/auth/refresh', { body: { refreshToken: u.refresh } })).status, 401);
});

test('transaction PIN locks after 5 wrong attempts, even for the right PIN', async () => {
  const a = await t.register('pin_a'); await t.register('pin_b'); await t.credit(a, '100');
  for (let i = 0; i < 5; i++) assert.equal((await t.send(a, 'pin_b', '1', { body: { pin: '999999' } })).body.code, 'PIN_INVALID');
  const r = await t.send(a, 'pin_b', '1'); assert.equal(r.status, 429); assert.equal(r.body.code, 'PIN_LOCKED');
  assert.equal(await t.balance(a), '100.00');
});

test('PIN change requires the account password', async () => {
  const u = await t.register('pin_chg');
  assert.equal((await t.api('POST', '/api/me/pin', { token: u.token, body: { currentPassword: 'wrong-password-x', newPin: '654321' } })).status, 401);
  assert.equal((await t.api('POST', '/api/me/pin', { token: u.token, body: { currentPassword: 'correct-horse-battery', newPin: '654321' } })).status, 200);
  await t.register('pin_dest'); await t.credit(u, '10');
  assert.equal((await t.send(u, 'pin_dest', '1')).body.code, 'PIN_INVALID', 'old PIN no longer works');
  assert.equal((await t.send({ ...u, pin: '654321' }, 'pin_dest', '1')).status, 201);
});

test('admin endpoints: forbidden for users, read-only overview for admins', async () => {
  const u = await t.register('adm_user'), boss = await t.register('boss_user');
  assert.equal((await t.api('GET', '/api/admin/overview', { token: u.token })).status, 403);
  assert.equal((await t.api('GET', '/api/admin/overview')).status, 401);
  await t.pool.query(`UPDATE users SET role = 'admin' WHERE handle = 'boss_user'`);
  await t.credit(u, '100'); await t.register('adm_dest'); await t.send(u, 'adm_dest', '40');
  const o = await t.api('GET', '/api/admin/overview', { token: boss.token });
  assert.equal(o.status, 200);
  assert.equal(o.body.ledgerBalanced, true);
  assert.equal(o.body.realMoneyEnabled, false);
  assert.ok(o.body.sandboxVolume >= '40.00');
  assert.equal((await t.api('POST', '/api/admin/overview', { token: boss.token })).status, 404, 'no write verbs');
  assert.equal((await t.api('GET', '/api/admin/transfers', { token: boss.token })).status, 200);
});

test('real-money surface is provably disabled', async () => {
  const u = await t.register('live_user');
  let r = await t.api('POST', '/api/transfers/live', { token: u.token, body: { amount: '1' } });
  assert.equal(r.status, 501); assert.equal(r.body.code, 'PROVIDER_NOT_CONFIGURED');
  r = await t.api('GET', '/api/rails');
  assert.equal(r.body.realMoneyEnabled, false); assert.equal(r.body.methods.gcash, 'not_enabled');
  r = await t.api('POST', '/api/webhooks/anything', { body: { fake: 'confirmation' } });
  assert.equal(r.status, 501);
  const h = await t.api('GET', '/health'); assert.equal(h.body.realMoneyEnabled, false);
});

test('QR inspect endpoint classifies payloads and never executes', async () => {
  const u = await t.register('qr_user');
  let r = await t.api('POST', '/api/qr/inspect', { token: u.token, body: { payload: 'molotov-sandbox://pay/bob_1' } });
  assert.equal(r.body.type, 'molotov-sandbox'); assert.equal(r.body.executable, false, 'unknown handle is not executable'); assert.equal(r.body.recipient, null);
  await t.register('bob_1');
  r = await t.api('POST', '/api/qr/inspect', { token: u.token, body: { payload: 'molotov-sandbox://pay/bob_1' } });
  assert.equal(r.body.executable, true); assert.equal(r.body.recipient.handle, 'bob_1');
  r = await t.api('POST', '/api/qr/inspect', { token: u.token, body: { payload: 'https://evil.example/pay' } });
  assert.equal(r.body.type, 'unknown'); assert.equal(r.body.executable, false);
});

test('startup refuses unsafe configuration', () => {
  const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'a'.repeat(40) };
  assert.throws(() => loadConfig({ ...base, JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ ...base, SANDBOX_MODE: 'false' }), /licensed payment provider/);
  assert.throws(() => loadConfig({ ...base, PAYMENT_PROVIDER: 'gcash-direct' }), /not an installed adapter/);
  assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', JWT_SECRET: 'replace-with-long-random-secret-at-least-32-bytes' }), /placeholder/);
  assert.doesNotThrow(() => loadConfig(base));
});

test('payment endpoints are rate limited per user', async () => {
  const lim = await startTestServer({ MONEY_RATE_LIMIT_PER_MIN: '5' });
  try {
    const u = await lim.register('rl_user');
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await lim.credit(u, '1')).status);
    assert.deepEqual(codes, [201, 201, 201, 201, 201, 429, 429, 429]);
  } finally { await lim.close(); }
});

test('password change rotates the session; activity log records security events', async () => {
  const u = await t.register('pw_user');
  assert.equal((await t.api('POST', '/api/me/password', { token: u.token, body: { currentPassword: 'wrong-wrong-wrong', newPassword: 'brand-new-password-1' } })).status, 401);
  assert.equal((await t.api('POST', '/api/me/password', { token: u.token, body: { currentPassword: 'correct-horse-battery', newPassword: 'short' } })).status, 400);
  const r = await t.api('POST', '/api/me/password', { token: u.token, body: { currentPassword: 'correct-horse-battery', newPassword: 'brand-new-password-1' } });
  assert.equal(r.status, 200);
  assert.equal((await t.api('GET', '/api/me', { token: u.token })).status, 401, 'old access token revoked');
  assert.equal((await t.api('POST', '/api/auth/refresh', { body: { refreshToken: u.refresh } })).status, 401, 'old refresh revoked');
  assert.equal((await t.api('GET', '/api/me', { token: r.body.accessToken })).status, 200, 'new session works');
  assert.equal((await t.api('POST', '/api/auth/login', { body: { email: 'pw_user@test.dev', password: 'correct-horse-battery' } })).status, 401);
  await t.api('POST', '/api/auth/login', { body: { email: 'pw_user@test.dev', password: 'nope-nope-nope-nope' } });
  const log = await t.api('GET', '/api/me/activity-log', { token: r.body.accessToken });
  const names = log.body.events.map((e) => e.event);
  assert.ok(names.includes('password_changed') && names.includes('failed_login') && names.includes('account_created'), names.join());
});
