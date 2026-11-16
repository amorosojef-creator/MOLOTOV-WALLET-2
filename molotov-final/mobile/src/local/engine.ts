// On-device Molotov SANDBOX engine. Mirrors the server API (same routes/shapes) so the app runs with NO backend.
// All data lives on this phone. Test money only. Never connects to any bank or payment network.
import { inspectQr } from './emv.ts';

export type Deps = {
  load: () => Promise<string | null>;
  save: (s: string) => Promise<void>;
  hash: (salt: string, secret: string) => Promise<string>;
  random: (bytes: number) => string; // hex
};
type U = { id: string; email: string; handle: string; displayName: string; passSalt: string; passHash: string; pinSalt: string; pinHash: string; createdAt: string; balanceCents: number; failedLogins: number; lockedUntil: number; failedPins: number; pinLockedUntil: number };
type T = { id: string; reference: string; kind: 'sandbox_credit' | 'sandbox_transfer'; status: 'completed'; senderId: string | null; receiverId: string; amountCents: number; note: string | null; createdAt: string; key: string | null; fp: string | null };
type DB = { users: Record<string, U>; transfers: T[]; sessions: Record<string, string>; audit: { userId: string | null; event: string; at: string }[] };
type Out = { status: number; data: any };

const LIM = { creditMax: 1_000_000, walletMax: 5_000_000, sendMax: 5_000_000, dailySendMax: 10_000_000 };
const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;
class E extends Error { status: number; code: string; constructor(status: number, code: string, msg: string) { super(msg); this.status = status; this.code = code; } }
const peso = (c: number) => (c / 100).toFixed(2);
const toCents = (v: unknown): number | null => {
  const s = String(v ?? '').trim();
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ''] = s.split('.'); const n = Number(w) * 100 + Number(f.padEnd(2, '0'));
  return n > 0 && Number.isSafeInteger(n) ? n : null;
};
const HANDLE = /^[a-z0-9_]{3,24}$/;

export function createEngine(deps: Deps) {
  let db: DB | null = null;
  let queue: Promise<unknown> = Promise.resolve(); // serialises every request: atomic like a DB transaction
  let lastTs = 0;
  const now = () => { lastTs = Math.max(Date.now(), lastTs + 1); return new Date(lastTs).toISOString(); };
  const uid = () => { const h = deps.random(16); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
  async function open(): Promise<DB> {
    if (db) return db;
    const raw = await deps.load();
    db = raw ? JSON.parse(raw) : { users: {}, transfers: [], sessions: {}, audit: [] };
    return db!;
  }
  const commit = (d: DB) => deps.save(JSON.stringify(d));
  const log = (d: DB, userId: string | null, event: string) => { d.audit.unshift({ userId, event, at: now() }); d.audit.length = Math.min(d.audit.length, 200); };
  const profile = (u: U) => ({ id: u.id, handle: u.handle, displayName: u.displayName, email: u.email, role: 'user' as const, createdAt: u.createdAt, balance: peso(u.balanceCents), currency: 'PHP', sandbox: true, hasPin: true, qr: `molotov-sandbox://pay/${u.handle}` });
  const party = (u: U | undefined) => (u ? { handle: u.handle, name: u.displayName } : null);
  function present(d: DB, t: T, viewer: string) {
    const incoming = t.receiverId === viewer, sender = party(t.senderId ? d.users[t.senderId] : undefined), receiver = party(d.users[t.receiverId])!;
    return { id: t.id, reference: t.reference, kind: t.kind, status: t.status, direction: incoming ? 'in' : 'out', currency: 'PHP', amount: peso(t.amountCents), fee: '0.00', total: peso(t.amountCents), note: t.note, sender, receiver, counterparty: t.kind === 'sandbox_credit' ? null : incoming ? sender : receiver, createdAt: t.createdAt, completedAt: t.createdAt, sandbox: true };
  }
  const session = (d: DB, userId: string) => { const t = 'ls_' + deps.random(24); d.sessions[t] = userId; return { accessToken: t, refreshToken: t, tokenType: 'Bearer' }; };
  const need = (d: DB, token?: string | null): U => { const id = token ? d.sessions[token] : undefined; const u = id ? d.users[id] : undefined; if (!u) throw new E(401, 'UNAUTHENTICATED', 'Please sign in again'); return u; };
  const checkPin = async (d: DB, u: U, pin: string) => {
    if (u.pinLockedUntil > Date.now()) throw new E(429, 'PIN_LOCKED', 'PIN locked after too many attempts. Try again later.');
    if ((await deps.hash(u.pinSalt, String(pin))) !== u.pinHash) {
      u.failedPins++; if (u.failedPins >= MAX_FAILS) u.pinLockedUntil = Date.now() + LOCK_MS; await commit(d);
      throw new E(401, 'PIN_INVALID', 'Incorrect PIN');
    }
    u.failedPins = 0; u.pinLockedUntil = 0;
  };

  async function route(path: string, method: string, body: any, key: string | undefined, token: string | null | undefined): Promise<Out> {
    const d = await open();
    const url = new URL(path, 'http://x'); const p = url.pathname; const b = body ?? {};
    const ok = (data: any, status = 200): Out => ({ status, data });

    if (method === 'GET' && p === '/api/rails') return ok({ realMoneyEnabled: false, provider: 'on-device-sandbox', notice: 'Real-money transfers are not enabled. They require a BSP-authorised EMI/partner programme, a licensed payment provider agreement and credentials.', rails: [{ id: 'gcash', label: 'GCash' }, { id: 'maya', label: 'Maya' }, { id: 'gotyme', label: 'GoTyme' }, { id: 'qrph', label: 'QR Ph (personal)' }] });

    if (method === 'POST' && p === '/api/auth/register') {
      const email = String(b.email ?? '').trim().toLowerCase(), handle = String(b.handle ?? '').trim().toLowerCase(), password = String(b.password ?? ''), pin = String(b.pin ?? '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new E(400, 'VALIDATION', 'Enter a valid email');
      if (password.length < 10) throw new E(400, 'VALIDATION', 'Password must be at least 10 characters');
      if (!HANDLE.test(handle)) throw new E(400, 'VALIDATION', 'Handle must be 3-24 letters, numbers or _');
      if (!/^\d{6}$/.test(pin)) throw new E(400, 'VALIDATION', 'PIN must be exactly 6 digits');
      if (Object.values(d.users).some((u) => u.email === email || u.handle === handle)) throw new E(409, 'ALREADY_REGISTERED', 'Email or handle is already registered');
      const passSalt = deps.random(16), pinSalt = deps.random(16);
      const u: U = { id: uid(), email, handle, displayName: String(b.displayName ?? '').trim().slice(0, 40) || handle, passSalt, passHash: await deps.hash(passSalt, password), pinSalt, pinHash: await deps.hash(pinSalt, pin), createdAt: now(), balanceCents: 0, failedLogins: 0, lockedUntil: 0, failedPins: 0, pinLockedUntil: 0 };
      d.users[u.id] = u; log(d, u.id, 'account_created'); const s = session(d, u.id); await commit(d);
      return ok({ ...s, profile: profile(u) }, 201);
    }
    if (method === 'POST' && p === '/api/auth/login') {
      const email = String(b.email ?? '').trim().toLowerCase(); const u = Object.values(d.users).find((x) => x.email === email);
      if (u && u.lockedUntil > Date.now()) throw new E(429, 'ACCOUNT_LOCKED', 'Too many attempts. Try again later.');
      if (!u || (await deps.hash(u.passSalt, String(b.password ?? ''))) !== u.passHash) {
        if (u) { u.failedLogins++; if (u.failedLogins >= MAX_FAILS) u.lockedUntil = Date.now() + LOCK_MS; log(d, u.id, 'failed_login'); await commit(d); }
        throw new E(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
      }
      u.failedLogins = 0; u.lockedUntil = 0; log(d, u.id, 'login'); const s = session(d, u.id); await commit(d);
      return ok({ ...s, profile: profile(u) });
    }
    if (method === 'POST' && p === '/api/auth/refresh') { const t = String(b.refreshToken ?? ''); if (!d.sessions[t]) throw new E(401, 'UNAUTHENTICATED', 'Session expired'); return ok({ accessToken: t, refreshToken: t }); }
    if (method === 'POST' && p === '/api/auth/logout') { delete d.sessions[String(b.refreshToken ?? '')]; await commit(d); return ok({ ok: true }); }

    const u = need(d, token);
    if (method === 'POST' && p === '/api/auth/logout-all') { for (const [t, id] of Object.entries(d.sessions)) if (id === u.id) delete d.sessions[t]; log(d, u.id, 'signed_out_everywhere'); await commit(d); return ok({ ok: true }); }
    if (method === 'GET' && p === '/api/me') return ok(profile(u));
    if (method === 'POST' && p === '/api/me/pin') {
      if ((await deps.hash(u.passSalt, String(b.currentPassword ?? ''))) !== u.passHash) throw new E(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
      if (!/^\d{6}$/.test(String(b.newPin ?? ''))) throw new E(400, 'VALIDATION', 'PIN must be exactly 6 digits');
      u.pinSalt = deps.random(16); u.pinHash = await deps.hash(u.pinSalt, String(b.newPin)); u.failedPins = 0; u.pinLockedUntil = 0; log(d, u.id, 'pin_changed'); await commit(d); return ok({ ok: true });
    }
    if (method === 'POST' && p === '/api/me/password') {
      if ((await deps.hash(u.passSalt, String(b.currentPassword ?? ''))) !== u.passHash) throw new E(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
      if (String(b.newPassword ?? '').length < 10) throw new E(400, 'VALIDATION', 'Password must be at least 10 characters');
      u.passSalt = deps.random(16); u.passHash = await deps.hash(u.passSalt, String(b.newPassword));
      for (const [t, id] of Object.entries(d.sessions)) if (id === u.id) delete d.sessions[t];
      log(d, u.id, 'password_changed'); const s = session(d, u.id); await commit(d); return ok({ ...s, notice: 'Password updated.' });
    }
    if (method === 'GET' && p === '/api/me/activity-log') return ok({ events: d.audit.filter((x) => x.userId === u.id).slice(0, 20).map((x) => ({ event: x.event, ip: null, created_at: x.at })) });
    let m = /^\/api\/users\/([^/]+)$/.exec(p);
    if (method === 'GET' && m) { const t = Object.values(d.users).find((x) => x.handle === decodeURIComponent(m![1]).toLowerCase()); if (!t) throw new E(404, 'RECIPIENT_NOT_FOUND', 'Recipient not found'); return ok({ handle: t.handle, displayName: t.displayName, sandboxTestAccount: true, kycVerified: false }); }

    if (method === 'GET' && p === '/api/transactions') {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20))), before = url.searchParams.get('before'), q = (url.searchParams.get('q') ?? '').trim().toLowerCase(), dir = url.searchParams.get('direction');
      const rows = d.transfers.filter((t) => t.senderId === u.id || t.receiverId === u.id).filter((t) => !before || t.createdAt < before).filter((t) => dir !== 'in' || t.receiverId === u.id).filter((t) => dir !== 'out' || t.senderId === u.id)
        .filter((t) => { if (!q) return true; const s = t.senderId ? d.users[t.senderId] : undefined, r = d.users[t.receiverId]; return [t.reference, t.note ?? '', s?.handle, s?.displayName, r?.handle, r?.displayName].some((x) => (x ?? '').toLowerCase().includes(q)); })
        .sort((a, c) => (a.createdAt < c.createdAt ? 1 : -1));
      const page = rows.slice(0, limit);
      return ok({ items: page.map((t) => present(d, t, u.id)), nextCursor: rows.length > limit ? page[page.length - 1].createdAt : null });
    }
    m = /^\/api\/transactions\/([^/]+)$/.exec(p);
    if (method === 'GET' && m) { const t = d.transfers.find((x) => x.id === m![1] && (x.senderId === u.id || x.receiverId === u.id)); if (!t) throw new E(404, 'NOT_FOUND', 'Transaction not found'); return ok(present(d, t, u.id)); }

    if (method === 'POST' && p === '/api/sandbox/credit') {
      const c = toCents(b.amount); if (!c || c > LIM.creditMax) throw new E(400, 'INVALID_AMOUNT', `Enter an amount between 0.01 and ${peso(LIM.creditMax)}`);
      const fp = `credit:${c}`; const old = key ? d.transfers.find((t) => t.senderId === null && t.receiverId === u.id && t.key === key) : undefined;
      if (old) { if (old.fp !== fp) throw new E(409, 'IDEMPOTENCY_CONFLICT', 'This key was used with a different request'); return ok({ replayed: true, transfer: present(d, old, u.id), balance: peso(u.balanceCents) }); }
      if (u.balanceCents + c > LIM.walletMax) throw new E(400, 'WALLET_LIMIT', `Sandbox wallet limit is ${peso(LIM.walletMax)}`);
      const t: T = { id: uid(), reference: 'MLT-' + deps.random(5).toUpperCase(), kind: 'sandbox_credit', status: 'completed', senderId: null, receiverId: u.id, amountCents: c, note: null, createdAt: now(), key: key ?? null, fp };
      d.transfers.push(t); u.balanceCents += c; log(d, u.id, 'test_funds_added'); await commit(d);
      return ok({ replayed: false, transfer: present(d, t, u.id), balance: peso(u.balanceCents), notice: 'SIMULATED FUNDS ONLY - not real money' }, 201);
    }
    if (method === 'POST' && p === '/api/sandbox/send') {
      if (!key || !/^[A-Za-z0-9_.:-]{8,100}$/.test(key)) throw new E(400, key ? 'IDEMPOTENCY_KEY_INVALID' : 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
      const c = toCents(b.amount); if (!c || c > LIM.sendMax) throw new E(400, 'INVALID_AMOUNT', `Enter an amount between 0.01 and ${peso(LIM.sendMax)}`);
      const qr = inspectQr(String(b.to ?? '')); const raw = qr.type === 'molotov_sandbox' ? qr.handle : String(b.to ?? '').trim().toLowerCase().replace(/^@/, '');
      if (!HANDLE.test(raw)) { if (qr.type === 'emvco_mpm') throw new E(501, 'LIVE_DISABLED', qr.blockedReason); throw new E(400, 'INVALID_RECIPIENT', 'Enter a Molotov handle or scan a Molotov sandbox QR'); }
      await checkPin(d, u, String(b.pin ?? ''));
      const note = b.note ? String(b.note).trim().slice(0, 140) : null, fp = `send:${raw}:${c}:${note ?? ''}`;
      const old = d.transfers.find((t) => t.senderId === u.id && t.key === key);
      if (old) { if (old.fp !== fp) throw new E(409, 'IDEMPOTENCY_CONFLICT', 'This key was used with a different request'); return ok({ replayed: true, transfer: present(d, old, u.id), balance: peso(u.balanceCents) }); }
      const r = Object.values(d.users).find((x) => x.handle === raw); if (!r) throw new E(404, 'RECIPIENT_NOT_FOUND', 'Recipient not found');
      if (r.id === u.id) throw new E(400, 'SELF_TRANSFER', 'You cannot send to yourself');
      if (u.balanceCents < c) throw new E(400, 'INSUFFICIENT_FUNDS', 'Insufficient sandbox balance');
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString(), sent = d.transfers.filter((t) => t.senderId === u.id && t.kind === 'sandbox_transfer' && t.createdAt > dayAgo).reduce((s, t) => s + t.amountCents, 0);
      if (sent + c > LIM.dailySendMax) throw new E(400, 'DAILY_LIMIT', `Daily sandbox send limit is ${peso(LIM.dailySendMax)}`);
      if (r.balanceCents + c > LIM.walletMax) throw new E(400, 'RECIPIENT_LIMIT', 'Recipient sandbox wallet limit reached');
      const t: T = { id: uid(), reference: 'MLT-' + deps.random(5).toUpperCase(), kind: 'sandbox_transfer', status: 'completed', senderId: u.id, receiverId: r.id, amountCents: c, note, createdAt: now(), key, fp };
      d.transfers.push(t); u.balanceCents -= c; r.balanceCents += c; log(d, u.id, 'sandbox_transfer_sent'); await commit(d);
      return ok({ replayed: false, transfer: present(d, t, u.id), balance: peso(u.balanceCents), notice: 'SANDBOX TRANSFER - no real money moved' }, 201);
    }
    if (method === 'POST' && p === '/api/qr/inspect') {
      const r = inspectQr(String(b.payload ?? ''));
      if (r.type === 'molotov_sandbox') { const t = Object.values(d.users).find((x) => x.handle === r.handle); return ok({ type: 'molotov-sandbox', executable: !!t, sandbox: true, recipient: t ? { handle: t.handle, displayName: t.displayName } : null }); }
      if (r.type === 'emvco_mpm') return ok({ type: 'emvco-qr', executable: false, blockedReason: r.blockedReason, inspection: { valid: r.crcValid && !r.reason, ...r } });
      return ok({ type: r.type === 'invalid' ? 'invalid' : 'unknown', executable: false, blockedReason: r.blockedReason ?? r.reason });
    }
    if (p === '/api/transfers/live') throw new E(501, 'PROVIDER_NOT_CONFIGURED', 'Real-money operations are disabled: no licensed payment provider is connected.');
    if (p.startsWith('/api/admin/')) throw new E(403, 'FORBIDDEN', 'Back-office is not available in standalone mode');
    throw new E(404, 'NOT_FOUND', 'Not found');
  }

  return function handle(path: string, method: string, body?: unknown, key?: string, token?: string | null): Promise<Out> {
    const run = queue.then(() => route(path, method, body, key, token)).catch((e) => {
      if (e instanceof E) return { status: e.status, data: { error: e.message, code: e.code } } as Out;
      return { status: 500, data: { error: 'Internal error', code: 'INTERNAL' } } as Out;
    });
    queue = run; return run;
  };
}
