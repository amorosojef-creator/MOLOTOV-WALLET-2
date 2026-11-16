import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { ApiError } from './errors.js';
import { withTx } from './db.js';
import { makeAuth } from './auth.js';
import { parseAmount, formatCents } from './money.js';
import { sandboxSend, sandboxCredit, listTransfers, getTransferFor, ledgerHealth } from './ledger.js';
import { inspectQr } from './qr/emv.js';
import { getProvider } from './providers/index.js';

const handleSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Handle must be 3-24 letters, numbers or _');
const pinSchema = z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits');
const schemas = {
  register: z.object({
    email: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email'),
    password: z.string().min(10, 'Password must be at least 10 characters').max(128),
    handle: handleSchema,
    displayName: z.string().trim().min(1).max(40).optional(),
    pin: pinSchema,
  }),
  login: z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(128) }),
  refresh: z.object({ refreshToken: z.string().min(20).max(200) }),
  changePassword: z.object({ currentPassword: z.string().max(128), newPassword: z.string().min(10, 'Password must be at least 10 characters').max(128) }),
  changePin: z.object({ currentPassword: z.string().max(128), newPin: pinSchema }),
  credit: z.object({ amount: z.union([z.string(), z.number()]) }),
  send: z.object({ to: z.string().trim().max(1024), amount: z.union([z.string(), z.number()]), note: z.string().trim().max(140).optional(), pin: z.string().max(12) }),
  inspect: z.object({ payload: z.string().max(1024) }),
};
const parse = (schema, data) => {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw new ApiError(400, 'VALIDATION', r.error.issues[0]?.message || 'Invalid request');
  return r.data;
};
const idemKey = (req, required) => {
  const k = req.headers['idempotency-key'];
  if (!k) { if (required) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required'); return null; }
  if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(k)) throw new ApiError(400, 'IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key must be 8-100 URL-safe characters');
  return k;
};
const audit = (db, actorId, action, detail = {}, ip) => db.query('INSERT INTO audit_log(actor_id, action, detail, ip) VALUES ($1,$2,$3,$4)', [actorId, action, JSON.stringify(detail), ip ?? null]);

export function createApp({ pool, cfg }) {
  const app = express();
  const auth = makeAuth({ pool, cfg });
  const provider = getProvider(cfg.paymentProvider, cfg);

  app.disable('x-powered-by');
  if (cfg.trustProxy) app.set('trust proxy', 1);
  app.use(helmet());
  if (cfg.corsOrigins.length) app.use(cors({ origin: cfg.corsOrigins.includes('*') ? '*' : cfg.corsOrigins }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', environment: 'SANDBOX', sandbox: cfg.sandboxMode, realMoneyEnabled: false, provider: provider.name, version: '1.0.0' }));
  app.get('/ready', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ ready: true }); } catch { res.status(503).json({ ready: false }); } });

  // Webhooks need the RAW body for signature checks, so they are mounted before express.json().
  app.post('/api/webhooks/:provider', express.raw({ type: '*/*', limit: '256kb' }), (req, res) => {
    if (provider.name === 'disabled' || req.params.provider !== provider.name) throw new ApiError(501, 'PROVIDER_NOT_CONFIGURED', 'No payment provider is connected; webhooks are not accepted.');
    if (!provider.verifyWebhook(req.headers, req.body)) throw new ApiError(401, 'BAD_SIGNATURE', 'Webhook signature invalid');
    throw new ApiError(501, 'NOT_IMPLEMENTED', 'Webhook processing must be implemented by the provider adapter.');
  });

  app.use(express.json({ limit: '16kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: cfg.apiRateLimitPerMin, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests', code: 'RATE_LIMITED' } }));
  const authLimiter = rateLimit({ windowMs: 60_000, limit: cfg.authRateLimitPerMin, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts, slow down', code: 'RATE_LIMITED' } });
  const moneyLimiter = rateLimit({ windowMs: 60_000, limit: cfg.moneyRateLimitPerMin, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: (req) => req.user?.id ?? 'anon', validate: { keyGeneratorIpFallback: false }, message: { error: 'Too many payment requests', code: 'RATE_LIMITED' } });

  const me = (u, balanceCents) => ({
    id: u.id, handle: u.handle, displayName: u.display_name, email: u.email, role: u.role, createdAt: u.created_at,
    balance: formatCents(balanceCents), currency: 'PHP', sandbox: true, hasPin: !!u.pin_hash,
    qr: `molotov-sandbox://pay/${u.handle}`,
  });
  const balanceOf = async (id) => Number((await pool.query('SELECT balance_cents FROM ledger_accounts WHERE user_id = $1', [id])).rows[0]?.balance_cents ?? 0);

  // ---- auth
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const b = parse(schemas.register, req.body);
    const [passHash, pinHash] = await Promise.all([auth.hashSecret(b.password), auth.hashSecret(b.pin)]);
    try {
      const out = await withTx(pool, async (db) => {
        const u = (await db.query('INSERT INTO users (email, handle, display_name, password_hash, pin_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *', [b.email, b.handle, b.displayName || b.handle, passHash, pinHash])).rows[0];
        await db.query('INSERT INTO ledger_accounts (kind, user_id) VALUES (\'user_wallet\', $1)', [u.id]);
        await audit(db, u.id, 'auth.register', {}, req.ip);
        return { user: u, session: await auth.issueSession(db, u, req.get('user-agent')) };
      });
      res.status(201).json({ ...out.session, profile: me(out.user, 0) });
    } catch (e) {
      if (e.code === '23505') throw new ApiError(409, 'ALREADY_REGISTERED', 'Email or handle is already registered');
      throw e;
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const b = parse(schemas.login, req.body);
    let u;
    try { u = await auth.verifyLogin(b.email, b.password); }
    catch (e) { await audit(pool, e.userId ?? null, 'auth.login_failed', { code: e.code }, req.ip); throw e; }
    const session = await withTx(pool, async (db) => { await audit(db, u.id, 'auth.login', {}, req.ip); return auth.issueSession(db, u, req.get('user-agent')); });
    res.json({ ...session, profile: me(u, await balanceOf(u.id)) });
  });

  app.post('/api/auth/refresh', authLimiter, async (req, res) => {
    const b = parse(schemas.refresh, req.body);
    res.json(await auth.rotate(b.refreshToken, req.get('user-agent')));
  });

  app.post('/api/auth/logout', authLimiter, async (req, res) => {
    const b = parse(schemas.refresh, req.body);
    await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [auth.sha256(b.refreshToken)]);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout-all', auth.requireUser, async (req, res) => {
    await withTx(pool, async (db) => {
      await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user.id]);
      await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
      await audit(db, req.user.id, 'auth.logout_all', {}, req.ip);
    });
    res.json({ ok: true });
  });

  // ---- profile
  app.get('/api/me', auth.requireUser, async (req, res) => res.json(me(req.user, await balanceOf(req.user.id))));

  app.post('/api/me/pin', authLimiter, auth.requireUser, async (req, res) => {
    const b = parse(schemas.changePin, req.body);
    const row = (await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])).rows[0];
    if (!(await bcrypt.compare(b.currentPassword, row.password_hash))) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
    await pool.query('UPDATE users SET pin_hash = $2, failed_pins = 0, pin_locked_until = NULL WHERE id = $1', [req.user.id, await auth.hashSecret(b.newPin)]);
    await audit(pool, req.user.id, 'auth.pin_changed', {}, req.ip);
    res.json({ ok: true });
  });

  app.post('/api/me/password', authLimiter, auth.requireUser, async (req, res) => {
    const b = parse(schemas.changePassword, req.body);
    const row = (await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])).rows[0];
    if (!(await bcrypt.compare(b.currentPassword, row.password_hash))) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    const hash = await auth.hashSecret(b.newPassword);
    const session = await withTx(pool, async (db) => {
      const u = (await db.query('UPDATE users SET password_hash = $2, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = $1 RETURNING *', [req.user.id, hash])).rows[0];
      await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
      await audit(db, req.user.id, 'auth.password_changed', {}, req.ip);
      return auth.issueSession(db, u, req.get('user-agent'));
    });
    res.json({ ...session, notice: 'Password updated. All other devices were signed out.' });
  });

  const EVENT_NAMES = { 'auth.register': 'account_created', 'auth.login': 'login', 'auth.login_failed': 'failed_login', 'auth.logout_all': 'signed_out_everywhere', 'auth.pin_changed': 'pin_changed', 'auth.password_changed': 'password_changed', 'transfer.sandbox': 'sandbox_transfer_sent', 'credit.sandbox': 'test_funds_added' };
  app.get('/api/me/activity-log', auth.requireUser, async (req, res) => {
    const r = await pool.query('SELECT action, ip, at FROM audit_log WHERE actor_id = $1 ORDER BY id DESC LIMIT 20', [req.user.id]);
    res.json({ events: r.rows.map((x) => ({ event: EVENT_NAMES[x.action] ?? x.action, ip: x.ip, created_at: x.at })) });
  });

  app.get('/api/users/:handle', auth.requireUser, async (req, res) => {
    const handle = handleSchema.safeParse(req.params.handle);
    if (!handle.success) throw new ApiError(404, 'RECIPIENT_NOT_FOUND', 'Recipient not found');
    const r = await pool.query('SELECT handle, display_name FROM users WHERE handle = $1', [handle.data]);
    if (!r.rows[0]) throw new ApiError(404, 'RECIPIENT_NOT_FOUND', 'Recipient not found');
    // Deliberately no "verified" flag: there is no KYC in the sandbox.
    res.json({ handle: r.rows[0].handle, displayName: r.rows[0].display_name, sandboxTestAccount: true, kycVerified: false });
  });

  // ---- history
  app.get('/api/transactions', auth.requireUser, async (req, res) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), before: z.string().datetime().optional(), q: z.string().trim().max(60).optional(), direction: z.enum(['in', 'out']).optional() }).safeParse(req.query);
    if (!q.success) throw new ApiError(400, 'VALIDATION', 'Invalid query');
    res.json(await listTransfers(pool, req.user.id, q.data));
  });
  app.get('/api/transactions/:id', auth.requireUser, async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found');
    const t = await getTransferFor(pool, req.user.id, req.params.id);
    if (!t) throw new ApiError(404, 'NOT_FOUND', 'Transaction not found');
    res.json(t);
  });

  // ---- sandbox money (the ONLY money endpoints that work)
  const sandboxOnly = (_req, _res, next) => (cfg.sandboxMode ? next() : next(new ApiError(403, 'SANDBOX_DISABLED', 'Sandbox endpoints are disabled')));
  app.post('/api/sandbox/credit', auth.requireUser, sandboxOnly, moneyLimiter, async (req, res) => {
    const b = parse(schemas.credit, req.body);
    const amountCents = parseAmount(b.amount, { max: cfg.limits.creditMax });
    if (!amountCents) throw new ApiError(400, 'INVALID_AMOUNT', `Enter an amount between 0.01 and ${formatCents(cfg.limits.creditMax)}`);
    const r = await sandboxCredit(pool, { userId: req.user.id, amountCents, key: idemKey(req, false), limits: cfg.limits, ip: req.ip });
    res.status(r.replayed ? 200 : 201).json({ ...r, balance: formatCents(await balanceOf(req.user.id)), notice: 'SIMULATED FUNDS ONLY - not real money' });
  });

  app.post('/api/sandbox/send', auth.requireUser, sandboxOnly, moneyLimiter, async (req, res) => {
    const b = parse(schemas.send, req.body);
    const key = idemKey(req, true);
    const amountCents = parseAmount(b.amount, { max: cfg.limits.sendMax });
    if (!amountCents) throw new ApiError(400, 'INVALID_AMOUNT', `Enter an amount between 0.01 and ${formatCents(cfg.limits.sendMax)}`);
    const qr = inspectQr(b.to);
    const handle = qr.type === 'molotov_sandbox' ? qr.handle : handleSchema.safeParse(b.to.replace(/^@/, '')).data;
    if (!handle) {
      if (qr.type === 'emvco_mpm') throw new ApiError(501, 'LIVE_DISABLED', qr.blockedReason || 'Only Molotov sandbox recipients are supported');
      throw new ApiError(400, 'INVALID_RECIPIENT', 'Enter a Molotov handle or scan a Molotov sandbox QR');
    }
    await auth.verifyPin(req.user.id, b.pin);
    const r = await sandboxSend(pool, { senderId: req.user.id, handle, amountCents, note: b.note || null, key, limits: cfg.limits, ip: req.ip });
    res.status(r.replayed ? 200 : 201).json({ ...r, balance: formatCents(await balanceOf(req.user.id)), notice: 'SANDBOX TRANSFER - no real money moved' });
  });

  // ---- QR inspection (never executes anything)
  app.post('/api/qr/inspect', auth.requireUser, async (req, res) => {
    const r = inspectQr(parse(schemas.inspect, req.body).payload);
    if (r.type === 'molotov_sandbox') {
      const u = (await pool.query('SELECT handle, display_name FROM users WHERE handle = $1', [r.handle])).rows[0];
      const recipient = u ? { handle: u.handle, displayName: u.display_name } : null;
      return res.json({ type: 'molotov-sandbox', executable: !!recipient, sandbox: true, recipient });
    }
    if (r.type === 'emvco_mpm') return res.json({ type: 'emvco-qr', executable: false, blockedReason: r.blockedReason, inspection: { valid: r.crcValid && !r.reason, ...r } });
    res.json({ type: r.type === 'invalid' ? 'invalid' : 'unknown', executable: false, blockedReason: r.blockedReason ?? r.reason });
  });

  // ---- real-money surface: wired to the provider interface, which is disabled
  app.post('/api/transfers/live', auth.requireUser, async (req) => {
    await provider.initiateFundedTransfer(req.user, null, 0, idemKey(req, false)); // throws PROVIDER_NOT_CONFIGURED (501)
  });
  const rails = (_req, res) => res.json({
    realMoneyEnabled: false, provider: provider.name,
    notice: 'Real-money transfers are not enabled. They require a BSP-authorised EMI/partner programme, a licensed payment provider agreement and credentials.',
    rails: [{ id: 'gcash', label: 'GCash' }, { id: 'maya', label: 'Maya' }, { id: 'gotyme', label: 'GoTyme' }, { id: 'qrph', label: 'QR Ph (personal)' }].map((r) => ({ ...r, status: r.id === 'qrph' ? 'inspect_only' : 'not_enabled' })),
    methods: { gcash: 'not_enabled', maya: 'not_enabled', gotyme: 'not_enabled', qrph: 'inspect_only' },
  });
  app.get('/api/rails', rails);
  app.get('/api/live/status', auth.requireUser, rails);

  // ---- back-office (read-only)
  app.get('/api/admin/overview', auth.requireUser, auth.requireAdmin, async (req, res) => {
    const [users, transfers, balances, health, recent] = await Promise.all([
      pool.query('SELECT COUNT(*)::int n FROM users'),
      pool.query(`SELECT COUNT(*)::int n, COALESCE(SUM(amount_cents) FILTER (WHERE kind='sandbox_transfer'),0)::bigint volume FROM transfers`),
      pool.query(`SELECT kind, balance_cents FROM ledger_accounts WHERE kind = 'sandbox_issuer' UNION ALL SELECT 'user_wallets_total', COALESCE(SUM(balance_cents),0) FROM ledger_accounts WHERE kind = 'user_wallet'`),
      ledgerHealth(pool),
      pool.query('SELECT id, at, actor_id, action, detail FROM audit_log ORDER BY id DESC LIMIT 25'),
    ]);
    await audit(pool, req.user.id, 'admin.view_overview', {}, req.ip);
    const b = Object.fromEntries(balances.rows.map((r) => [r.kind, Number(r.balance_cents)]));
    res.json({
      environment: 'SANDBOX', realMoneyEnabled: false, provider: provider.name,
      users: users.rows[0].n, transfers: transfers.rows[0].n, sandboxVolume: formatCents(transfers.rows[0].volume),
      sandboxIssuerBalance: formatCents(b.sandbox_issuer), userWalletsTotal: formatCents(b.user_wallets_total),
      ledgerHealth: health, ledgerBalanced: health.cachedBalanceMismatches === 0 && health.unbalancedTransfers === 0 && health.journalNetCents === 0,
      limits: Object.fromEntries(Object.entries(cfg.limits).map(([k, v]) => [k, formatCents(v)])),
      recentAudit: recent.rows,
    });
  });
  app.get('/api/admin/transfers', auth.requireUser, auth.requireAdmin, async (req, res) => {
    const r = await pool.query(`SELECT t.id, t.reference, t.kind, t.status, t.amount_cents, t.created_at, s.handle sender, r.handle receiver FROM transfers t LEFT JOIN users s ON s.id=t.sender_id JOIN users r ON r.id=t.receiver_id ORDER BY t.created_at DESC LIMIT 50`);
    res.json({ items: r.rows.map((x) => ({ id: x.id, reference: x.reference, kind: x.kind, status: x.status, amount: formatCents(x.amount_cents), sender: x.sender, receiver: x.receiver, createdAt: x.created_at })) });
  });

  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'Invalid request body', code: 'BAD_BODY' });
    if (err.code === '23514' && /no_overdraft/.test(err.constraint || err.message)) return res.status(400).json({ error: 'Insufficient sandbox balance', code: 'INSUFFICIENT_FUNDS' });
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
  });
  return app;
}
