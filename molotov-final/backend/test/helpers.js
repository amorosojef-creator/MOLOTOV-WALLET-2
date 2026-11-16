import { loadConfig } from '../src/config.js';
import { createPool, migrate } from '../src/db.js';
import { createApp } from '../src/app.js';

export const TEST_DB = process.env.TEST_DATABASE_URL || 'postgresql://molotov:molotov_dev_password@localhost:5432/molotov_test';

export async function startTestServer(overrides = {}) {
  const cfg = loadConfig({
    DATABASE_URL: TEST_DB, JWT_SECRET: 'test-secret-test-secret-test-secret-123', BCRYPT_COST: '4',
    AUTH_RATE_LIMIT_PER_MIN: '100000', API_RATE_LIMIT_PER_MIN: '100000', MONEY_RATE_LIMIT_PER_MIN: '100000', NODE_ENV: 'test', ...overrides,
  });
  const pool = createPool(cfg);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  const app = createApp({ pool, cfg });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let n = 0;
  const api = async (method, path, { token, body, key, headers } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(key ? { 'idempotency-key': key } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  };
  const register = async (handle, pin = '123456') => {
    const r = await api('POST', '/api/auth/register', { body: { email: `${handle}@test.dev`, password: 'correct-horse-battery', handle, pin } });
    if (r.status !== 201) throw new Error('register failed ' + JSON.stringify(r));
    return { handle, token: r.body.accessToken, refresh: r.body.refreshToken, id: r.body.profile.id, pin };
  };
  const credit = (u, amount) => api('POST', '/api/sandbox/credit', { token: u.token, body: { amount }, key: `credit-${u.handle}-${++n}-${Math.random().toString(36).slice(2)}` });
  const send = (u, to, amount, opts = {}) => api('POST', '/api/sandbox/send', { token: u.token, body: { to, amount, pin: u.pin, ...opts.body }, key: opts.key ?? `send-${u.handle}-${++n}-${Math.random().toString(36).slice(2)}` });
  const balance = async (u) => (await api('GET', '/api/me', { token: u.token })).body.balance;
  const close = async () => { await new Promise((r) => server.close(r)); await pool.end(); };
  return { cfg, pool, api, register, credit, send, balance, close, base };
}
