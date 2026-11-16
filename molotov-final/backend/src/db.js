import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Return BIGINT as JS number: sandbox amounts stay far below 2^53 centavos.
pg.types.setTypeParser(20, (v) => Number(v));

export function createPool(cfg, extra = {}) {
  const ssl = cfg.pgssl === 'verify' ? { rejectUnauthorized: true } : cfg.pgssl === 'no-verify' ? { rejectUnauthorized: false } : undefined;
  return new pg.Pool({ connectionString: cfg.databaseUrl, ssl, max: 20, idleTimeoutMillis: 30_000, ...extra });
}

export async function withTx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw e;
  } finally {
    client.release();
  }
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(pool, log = () => {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const applied = [];
    for (const f of files) {
      if (done.has(f)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        applied.push(f);
        log(`applied ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        e.message = `Migration ${f} failed: ${e.message}`;
        throw e;
      }
    }
    return applied;
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(727001)'); } catch { /* ignore */ }
    client.release();
  }
}
