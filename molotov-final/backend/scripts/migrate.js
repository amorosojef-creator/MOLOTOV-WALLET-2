import { loadConfig } from '../src/config.js';
import { createPool, migrate } from '../src/db.js';
const pool = createPool(loadConfig());
console.log('applied:', await migrate(pool, console.log));
await pool.end();
