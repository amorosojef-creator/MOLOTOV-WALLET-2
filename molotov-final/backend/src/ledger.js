import crypto from 'node:crypto';
import { withTx } from './db.js';
import { ApiError } from './errors.js';
import { formatCents } from './money.js';

const newReference = () => 'MLT-' + crypto.randomBytes(5).toString('hex').toUpperCase();
const fingerprint = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');

const TRANSFER_SELECT = `
  SELECT t.id, t.reference, t.kind, t.status, t.amount_cents, t.fee_cents, t.note, t.created_at, t.environment,
         t.sender_id, t.receiver_id, s.handle AS sender_handle, s.display_name AS sender_name,
         r.handle AS receiver_handle, r.display_name AS receiver_name
  FROM transfers t
  LEFT JOIN users s ON s.id = t.sender_id
  JOIN users r ON r.id = t.receiver_id`;

export function presentTransfer(row, viewerId) {
  const incoming = row.receiver_id === viewerId;
  const sender = row.sender_handle ? { handle: row.sender_handle, name: row.sender_name } : null; // null for sandbox test-fund credits
  const receiver = { handle: row.receiver_handle, name: row.receiver_name };
  return {
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    status: row.status,
    direction: incoming ? 'in' : 'out',
    currency: 'PHP',
    amount: formatCents(row.amount_cents),
    fee: formatCents(row.fee_cents),
    total: formatCents(Number(row.amount_cents) + Number(row.fee_cents)),
    note: row.note,
    sender,
    receiver,
    counterparty: row.kind === 'sandbox_credit' ? null : incoming ? sender : receiver,
    createdAt: row.created_at,
    // Sandbox transfers settle inside the same database transaction that creates them.
    completedAt: row.status === 'completed' ? row.created_at : null,
    sandbox: row.environment === 'sandbox',
  };
}

async function lockAccounts(db, userIds) {
  const r = await db.query('SELECT id, user_id, balance_cents FROM ledger_accounts WHERE user_id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [userIds]);
  return Object.fromEntries(r.rows.map((x) => [x.user_id, x]));
}

async function findReplay(db, actorId, key, fp) {
  if (!key) return null;
  const r = await db.query('SELECT id, request_fingerprint FROM transfers WHERE actor_id = $1 AND idempotency_key = $2', [actorId, key]);
  if (!r.rows[0]) return null;
  if (r.rows[0].request_fingerprint !== fp)
    throw new ApiError(422, 'IDEMPOTENCY_MISMATCH', 'This Idempotency-Key was already used for a different request.');
  return r.rows[0].id;
}

async function loadTransfer(db, id, viewerId) {
  const r = await db.query(`${TRANSFER_SELECT} WHERE t.id = $1`, [id]);
  return presentTransfer(r.rows[0], viewerId);
}

async function audit(db, actorId, action, detail, ip) {
  await db.query('INSERT INTO audit_log(actor_id, action, detail, ip) VALUES ($1,$2,$3,$4)', [actorId, action, JSON.stringify(detail), ip ?? null]);
}

/** Move sandbox value between two Molotov test wallets, atomically and idempotently. */
export async function sandboxSend(pool, { senderId, handle, amountCents, note, key, limits, ip }) {
  const fp = fingerprint({ k: 'send', handle, amountCents, note: note ?? null });
  return withTx(pool, async (db) => {
    const rec = await db.query('SELECT id FROM users WHERE handle = $1', [handle]);
    if (!rec.rows[0]) throw new ApiError(404, 'RECIPIENT_NOT_FOUND', 'Recipient not found');
    const receiverId = rec.rows[0].id;
    if (receiverId === senderId) throw new ApiError(400, 'SELF_TRANSFER', 'You cannot send to yourself');

    // Lock both wallets in a fixed order (no deadlocks), THEN check the idempotency key.
    // Holding the sender lock serialises concurrent retries of the same request.
    const acct = await lockAccounts(db, [senderId, receiverId]);
    const replayId = await findReplay(db, senderId, key, fp);
    if (replayId) return { replayed: true, transfer: await loadTransfer(db, replayId, senderId) };

    if (amountCents > limits.sendMax) throw new ApiError(422, 'LIMIT_EXCEEDED', `Sandbox limit per transfer is PHP ${formatCents(limits.sendMax)}`);
    if (acct[senderId].balance_cents < amountCents) throw new ApiError(400, 'INSUFFICIENT_FUNDS', 'Insufficient sandbox balance');
    if (acct[receiverId].balance_cents + amountCents > limits.walletMax) throw new ApiError(422, 'RECIPIENT_LIMIT', 'Recipient sandbox wallet would exceed its test limit');
    const day = await db.query(`SELECT COALESCE(SUM(amount_cents),0) AS s FROM transfers WHERE sender_id = $1 AND kind = 'sandbox_transfer' AND created_at > now() - interval '24 hours'`, [senderId]);
    if (Number(day.rows[0].s) + amountCents > limits.dailySendMax) throw new ApiError(422, 'LIMIT_EXCEEDED', `Sandbox 24-hour sending limit is PHP ${formatCents(limits.dailySendMax)}`);

    const ins = await db.query(
      `INSERT INTO transfers (reference, kind, actor_id, sender_id, receiver_id, amount_cents, status, note, idempotency_key, request_fingerprint)
       VALUES ($1,'sandbox_transfer',$2,$2,$3,$4,'completed',$5,$6,$7) RETURNING id`,
      [newReference(), senderId, receiverId, amountCents, note ?? null, key ?? null, key ? fp : null]);
    const id = ins.rows[0].id;
    await db.query('INSERT INTO journal_lines (transfer_id, account_id, delta_cents) VALUES ($1,$2,$3), ($1,$4,$5)',
      [id, acct[senderId].id, -amountCents, acct[receiverId].id, amountCents]);
    await audit(db, senderId, 'transfer.sandbox', { id, amountCents, to: handle }, ip);
    return { replayed: false, transfer: await loadTransfer(db, id, senderId) };
  });
}

/** Mint sandbox test money from the issuer account into the user's own wallet. */
export async function sandboxCredit(pool, { userId, amountCents, key, limits, ip }) {
  const fp = fingerprint({ k: 'credit', amountCents });
  return withTx(pool, async (db) => {
    const issuer = (await db.query(`SELECT id FROM ledger_accounts WHERE kind = 'sandbox_issuer' FOR UPDATE`)).rows[0];
    const acct = await lockAccounts(db, [userId]);
    const replayId = await findReplay(db, userId, key, fp);
    if (replayId) return { replayed: true, transfer: await loadTransfer(db, replayId, userId) };
    if (amountCents > limits.creditMax) throw new ApiError(422, 'LIMIT_EXCEEDED', `Sandbox credit limit is PHP ${formatCents(limits.creditMax)} per request`);
    if (acct[userId].balance_cents + amountCents > limits.walletMax) throw new ApiError(422, 'LIMIT_EXCEEDED', `Sandbox wallet cap is PHP ${formatCents(limits.walletMax)}`);
    const ins = await db.query(
      `INSERT INTO transfers (reference, kind, actor_id, sender_id, receiver_id, amount_cents, status, idempotency_key, request_fingerprint)
       VALUES ($1,'sandbox_credit',$2,NULL,$2,$3,'completed',$4,$5) RETURNING id`,
      [newReference(), userId, amountCents, key ?? null, key ? fp : null]);
    const id = ins.rows[0].id;
    await db.query('INSERT INTO journal_lines (transfer_id, account_id, delta_cents) VALUES ($1,$2,$3), ($1,$4,$5)',
      [id, issuer.id, -amountCents, acct[userId].id, amountCents]);
    await audit(db, userId, 'credit.sandbox', { id, amountCents }, ip);
    return { replayed: false, transfer: await loadTransfer(db, id, userId) };
  });
}

export async function listTransfers(pool, userId, { limit = 20, before, q, direction }) {
  const params = [userId];
  const where = ['(t.sender_id = $1 OR t.receiver_id = $1)'];
  if (before) { params.push(before); where.push(`t.created_at < $${params.length}`); }
  if (direction === 'in') where.push('t.receiver_id = $1');
  if (direction === 'out') where.push('t.sender_id = $1');
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    const p = `$${params.length}`;
    where.push(`(t.reference ILIKE ${p} OR COALESCE(t.note,'') ILIKE ${p} OR s.handle ILIKE ${p} OR r.handle ILIKE ${p} OR s.display_name ILIKE ${p} OR r.display_name ILIKE ${p})`);
  }
  params.push(limit + 1);
  const r = await pool.query(`${TRANSFER_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC, t.id DESC LIMIT $${params.length}`, params);
  const rows = r.rows.slice(0, limit);
  return { items: rows.map((x) => presentTransfer(x, userId)), nextCursor: r.rows.length > limit ? rows[rows.length - 1].created_at : null };
}

export async function getTransferFor(pool, userId, id) {
  const r = await pool.query(`${TRANSFER_SELECT} WHERE t.id = $1 AND (t.sender_id = $2 OR t.receiver_id = $2)`, [id, userId]);
  return r.rows[0] ? presentTransfer(r.rows[0], userId) : null;
}

/** Ledger health checks used by tests and the admin overview. */
export async function ledgerHealth(pool) {
  const [mismatch, unbalanced, total] = await Promise.all([
    pool.query('SELECT * FROM v_ledger_mismatch'),
    pool.query('SELECT transfer_id, SUM(delta_cents) s FROM journal_lines GROUP BY transfer_id HAVING SUM(delta_cents) <> 0'),
    pool.query('SELECT COALESCE(SUM(delta_cents),0) s, COUNT(*) n FROM journal_lines'),
  ]);
  return { cachedBalanceMismatches: mismatch.rows.length, unbalancedTransfers: unbalanced.rows.length, journalNetCents: Number(total.rows[0].s), journalLines: Number(total.rows[0].n) };
}
