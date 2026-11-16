// Usage: npm run admin:grant -- someone@example.com   (read-only back-office access)
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
const email = (process.argv[2] || '').toLowerCase();
if (!email) { console.error('Usage: npm run admin:grant -- <email>'); process.exit(1); }
const pool = createPool(loadConfig());
const r = await pool.query("UPDATE users SET role='admin' WHERE lower(email)=$1 RETURNING handle", [email]);
console.log(r.rowCount ? `Granted admin (read-only) to @${r.rows[0].handle}` : 'No such user');
await pool.end();
