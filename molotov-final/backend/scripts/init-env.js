// Creates backend/.env with a random JWT secret on first run (never overwrites).
import fs from 'node:fs'; import crypto from 'node:crypto';
if (!fs.existsSync('.env')) {
  fs.writeFileSync('.env', `PORT=4000\nDATABASE_URL=postgresql://molotov:molotov_dev_password@localhost:5432/molotov\nJWT_SECRET=${crypto.randomBytes(48).toString('base64url')}\nNODE_ENV=development\nSANDBOX_MODE=true\nCORS_ORIGIN=http://localhost:8081\n`);
  console.log('Created backend/.env');
}
