import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { createApp } from './app.js';

const cfg = loadConfig();
const pool = createPool(cfg);
const applied = await migrate(pool, (m) => console.log('[migrate]', m));
const app = createApp({ pool, cfg });
const server = app.listen(cfg.port, () => console.log(`Molotov SANDBOX API listening on :${cfg.port} (migrations applied: ${applied.length}; real money: DISABLED)`));
const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGTERM', stop); process.on('SIGINT', stop);
