import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ApiError } from './errors.js';
import { withTx } from './db.js';

const ISS = 'molotov-sandbox-api', AUD = 'molotov-app';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;

export function makeAuth({ pool, cfg }) {
  // A real hash to compare against when the account does not exist (evens out timing).
  const dummyHash = bcrypt.hashSync('not-a-real-password', cfg.bcryptCost);

  const signAccess = (user) => jwt.sign({ sub: user.id, ver: user.token_version }, cfg.jwtSecret, { algorithm: 'HS256', expiresIn: cfg.accessTtl, issuer: ISS, audience: AUD });

  async function issueSession(db, user, userAgent, familyId = crypto.randomUUID()) {
    const refresh = crypto.randomBytes(32).toString('base64url');
    await db.query('INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent) VALUES ($1,$2,$3, now() + ($4 || \' days\')::interval,$5)',
      [user.id, familyId, sha256(refresh), String(cfg.refreshDays), (userAgent || '').slice(0, 200)]);
    return { accessToken: signAccess(user), refreshToken: refresh, expiresIn: cfg.accessTtl };
  }

  const hashSecret = (s) => bcrypt.hash(s, cfg.bcryptCost);

  async function requireUser(req, _res, next) {
    try {
      const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
      if (!token) throw new Error('missing');
      const claims = jwt.verify(token, cfg.jwtSecret, { algorithms: ['HS256'], issuer: ISS, audience: AUD });
      const r = await pool.query('SELECT id, handle, display_name, email, role, token_version, pin_hash FROM users WHERE id = $1', [claims.sub]);
      const u = r.rows[0];
      if (!u || u.token_version !== claims.ver) throw new Error('revoked');
      req.user = u;
      next();
    } catch (e) {
      if (e instanceof ApiError) return next(e);
      next(new ApiError(401, 'UNAUTHENTICATED', 'Login required'));
    }
  }
  const requireAdmin = (req, _res, next) => (req.user?.role === 'admin' ? next() : next(new ApiError(403, 'FORBIDDEN', 'Administrator access required')));

  async function verifyLogin(email, password) {
    const r = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
    const u = r.rows[0];
    if (u?.locked_until && new Date(u.locked_until) > new Date()) {
      await bcrypt.compare(password, dummyHash);
      const e = new ApiError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in 15 minutes.'); e.userId = u.id; throw e;
    }
    const ok = await bcrypt.compare(password, u?.password_hash ?? dummyHash);
    if (!u || !ok) {
      if (u) await pool.query(`UPDATE users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + ($3 || ' milliseconds')::interval ELSE locked_until END WHERE id = $1`, [u.id, MAX_FAILS, String(LOCK_MS)]);
      const e = new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'); e.userId = u?.id ?? null; throw e;
    }
    await pool.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
    return u;
  }

  async function verifyPin(userId, pin) {
    const r = await pool.query('SELECT pin_hash, pin_locked_until FROM users WHERE id = $1', [userId]);
    const u = r.rows[0];
    if (!u?.pin_hash) throw new ApiError(403, 'PIN_NOT_SET', 'Set a transaction PIN first');
    if (u.pin_locked_until && new Date(u.pin_locked_until) > new Date()) throw new ApiError(429, 'PIN_LOCKED', 'PIN locked after too many attempts. Try again later.');
    if (!/^\d{6}$/.test(String(pin ?? '')) || !(await bcrypt.compare(String(pin), u.pin_hash))) {
      await pool.query(`UPDATE users SET failed_pins = failed_pins + 1, pin_locked_until = CASE WHEN failed_pins + 1 >= $2 THEN now() + ($3 || ' milliseconds')::interval ELSE pin_locked_until END WHERE id = $1`, [userId, MAX_FAILS, String(LOCK_MS)]);
      throw new ApiError(401, 'PIN_INVALID', 'Incorrect PIN');
    }
    await pool.query('UPDATE users SET failed_pins = 0, pin_locked_until = NULL WHERE id = $1', [userId]);
  }

  /** Rotate a refresh token. Presenting an already-used token revokes the whole family (theft signal).
   *  The revoke is committed BEFORE the error is raised, so it is never rolled back. */
  async function rotate(presented, userAgent) {
    const h = sha256(presented);
    const out = await withTx(pool, async (db) => {
      const t = (await db.query('SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE', [h])).rows[0];
      if (!t) return null;
      if (t.revoked_at || new Date(t.expires_at) < new Date()) {
        if (t.revoked_at) await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [t.family_id]);
        return null;
      }
      await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [t.id]);
      const u = (await db.query('SELECT id, token_version FROM users WHERE id = $1', [t.user_id])).rows[0];
      return issueSession(db, u, userAgent, t.family_id);
    });
    if (!out) throw new ApiError(401, 'INVALID_REFRESH', 'Session expired. Please sign in again.');
    return out;
  }

  return { signAccess, issueSession, hashSecret, requireUser, requireAdmin, verifyLogin, verifyPin, rotate, sha256 };
}
