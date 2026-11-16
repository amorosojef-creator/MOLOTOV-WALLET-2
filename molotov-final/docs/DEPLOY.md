# Deploy the API online (HTTPS + PostgreSQL)

**Nothing has been deployed.** I have no cloud account or credentials, so no public URL exists. `render.yaml` and `backend/Dockerfile` are provided but the container build and the Render blueprint are **UNVERIFIED** (no Docker daemon in my environment). What *was* verified: the same files/steps as the Dockerfile (`npm ci --omit=dev`, `NODE_ENV=production`) start the server and pass the smoke test against PostgreSQL 16.

## Option A — Render (blueprint included)
1. Push this folder to your own GitHub repo.
2. Render → New → Blueprint → select the repo (`render.yaml`). Review plan/region/price first.
3. It creates the API (Docker) + PostgreSQL 16, generates `JWT_SECRET`, wires `DATABASE_URL`. If your database host needs it, set `PGSSL=no-verify` (default in production is strict `verify`).
4. Open `https://<your-service>.onrender.com/health` → expect `"environment":"SANDBOX","realMoneyEnabled":false`.
5. Put that URL into `mobile/eas.json` (`EXPO_PUBLIC_API_URL`) and rebuild the app.

## Option B — any container host (Fly.io, Railway, Cloud Run, ECS…)
Build `backend/Dockerfile`; provide the env vars below; attach managed PostgreSQL 16; terminate HTTPS at the host. Migrations run automatically at start-up.

## Environment variables
| Var | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | from your Postgres host |
| `JWT_SECRET` | yes | 32+ random chars (`openssl rand -base64 48`, or `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `NODE_ENV` | yes | `production` |
| `SANDBOX_MODE` | yes | `true` (server refuses anything else) |
| `PAYMENT_PROVIDER` | no | `disabled` |
| `TRUST_PROXY` | behind a proxy | `true` / `1` |
| `PGSSL` | no | `verify` (default prod) / `no-verify` / `disable` |
| `CORS_ORIGIN` | web only | comma-separated origins; native apps ignore CORS |
| `SANDBOX_*_MAX_CENTS` | no | limits |

## Hardening before anyone outside your team uses it
Backups + restore test, secret manager, WAF/DDoS, log shipping, uptime alerts, dependency scanning. Sandbox is **not** a production financial system.
