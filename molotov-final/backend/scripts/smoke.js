// End-to-end smoke test over real HTTP against a RUNNING server.  Usage: node scripts/smoke.js [baseUrl]
// Registers two fresh users, funds A with SANDBOX credit, sends A -> B, and checks every guarantee.
const base = process.argv[2] || process.env.API_URL || 'http://localhost:4000';
const tag = Math.random().toString(36).slice(2, 8);
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const api = async (method, path, { token, body, key } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(key ? { 'idempotency-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const reg = async (h) => { const r = await api('POST', '/api/auth/register', { body: { email: `${h}@smoke.dev`, password: 'correct-horse-battery', handle: h, pin: '123456' } }); return { h, token: r.body.accessToken, status: r.status }; };

const health = await api('GET', '/health');
check('health says SANDBOX and realMoneyEnabled=false', health.body.environment === 'SANDBOX' && health.body.realMoneyEnabled === false);
const A = await reg('alice' + tag), B = await reg('bob' + tag);
check('two accounts registered', A.status === 201 && B.status === 201);
check('money endpoints reject unauthenticated calls', (await api('POST', '/api/sandbox/send', { body: {}, key: 'x' })).status === 401);
const c = await api('POST', '/api/sandbox/credit', { token: A.token, body: { amount: '1000.00' }, key: 'c-' + tag });
check('A funded with simulated 1000.00', c.status === 201 && c.body.balance === '1000.00', c.body.balance);
const key = 's-' + tag;
const s1 = await api('POST', '/api/sandbox/send', { token: A.token, body: { to: B.h, amount: '250.50', pin: '123456', note: 'dinner' }, key });
check('A -> B 250.50 completed', s1.status === 201 && s1.body.transfer?.status === 'completed', JSON.stringify(s1.body).slice(0, 120));
const s2 = await api('POST', '/api/sandbox/send', { token: A.token, body: { to: B.h, amount: '250.50', pin: '123456', note: 'dinner' }, key });
check('retry with same Idempotency-Key replays, does not double-send', s2.status === 200 && s2.body.replayed === true);
const meA = (await api('GET', '/api/me', { token: A.token })).body, meB = (await api('GET', '/api/me', { token: B.token })).body;
check('balances A=749.50 B=250.50', meA.balance === '749.50' && meB.balance === '250.50', `${meA.balance}/${meB.balance}`);
check('wrong PIN rejected', (await api('POST', '/api/sandbox/send', { token: A.token, body: { to: B.h, amount: '1', pin: '000000' }, key: 'wrongpin-' + tag })).status >= 400);
const big = await api('POST', '/api/sandbox/send', { token: B.token, body: { to: A.h, amount: '999.00', pin: '123456' }, key: 'insuff-' + tag });
check('insufficient funds rejected', big.body.code === 'INSUFFICIENT_FUNDS' || /INSUFFICIENT/.test(big.body.code ?? ''), `${big.status} ${big.body.code}`);
const hA = (await api('GET', '/api/transactions', { token: A.token })).body, hB = (await api('GET', '/api/transactions', { token: B.token })).body;
check('both sides see the transfer in history', JSON.stringify(hA).includes(B.h) && JSON.stringify(hB).includes(A.h));
const qrph = '000201010211' ;
const insp = await api('POST', '/api/qr/inspect', { token: A.token, body: { payload: qrph } });
check('foreign QR is never executable', insp.body.executable === false);
const live = await api('POST', '/api/transfers/live', { token: A.token, key: 'live-req-' + tag, body: {} });
check('live transfers refused (501)', live.status === 501, live.body.code);
console.log(failed ? `\n${failed} FAILED` : '\nALL SMOKE CHECKS PASSED');
process.exit(failed ? 1 : 0);
