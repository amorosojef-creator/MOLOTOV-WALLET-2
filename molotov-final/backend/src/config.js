import 'dotenv/config';
import { providerNames } from './providers/index.js';

const truthy = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export function loadConfig(env = process.env) {
  const cfg = {
    nodeEnv: env.NODE_ENV || 'development',
    port: int(env.PORT, 4000),
    databaseUrl: env.DATABASE_URL,
    pgssl: env.PGSSL || (env.NODE_ENV === 'production' ? 'verify' : 'disable'), // verify | no-verify | disable
    jwtSecret: env.JWT_SECRET,
    accessTtl: env.ACCESS_TOKEN_TTL || '15m',
    refreshDays: int(env.REFRESH_TOKEN_DAYS, 30),
    bcryptCost: int(env.BCRYPT_COST, 12),
    corsOrigins: (env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: truthy(env.TRUST_PROXY, false),
    sandboxMode: truthy(env.SANDBOX_MODE, true),
    paymentProvider: env.PAYMENT_PROVIDER || 'disabled',
    // Sandbox guard rails (centavos)
    limits: {
      creditMax: int(env.SANDBOX_CREDIT_MAX_CENTS, 1_000_000), // PHP 10,000 per credit
      walletMax: int(env.SANDBOX_WALLET_MAX_CENTS, 5_000_000), // PHP 50,000 test balance cap
      sendMax: int(env.SANDBOX_SEND_MAX_CENTS, 5_000_000), // PHP 50,000 per transfer
      dailySendMax: int(env.SANDBOX_DAILY_SEND_MAX_CENTS, 10_000_000), // PHP 100,000 / 24h
    },
    authRateLimitPerMin: int(env.AUTH_RATE_LIMIT_PER_MIN, 20),
    moneyRateLimitPerMin: int(env.MONEY_RATE_LIMIT_PER_MIN, 30),
    apiRateLimitPerMin: int(env.API_RATE_LIMIT_PER_MIN, 240),
  };

  const problems = [];
  if (!cfg.databaseUrl) problems.push('DATABASE_URL is required.');
  if (!cfg.jwtSecret || cfg.jwtSecret.length < 32) problems.push('JWT_SECRET must be set to a random string of 32+ characters.');
  if (cfg.nodeEnv === 'production' && /replace-with|change-?me|example/i.test(cfg.jwtSecret || ''))
    problems.push('JWT_SECRET still looks like the example placeholder.');
  if (!providerNames().includes(cfg.paymentProvider)) problems.push(`PAYMENT_PROVIDER "${cfg.paymentProvider}" is not an installed adapter (installed: ${providerNames().join(', ')}).`);
  // Honesty guard: live mode cannot be switched on without a real, licensed provider adapter.
  if (!cfg.sandboxMode && cfg.paymentProvider === 'disabled')
    problems.push('SANDBOX_MODE=false requires a licensed payment provider adapter. None is installed, so this server refuses to start in a "live" configuration.');
  if (!cfg.sandboxMode) problems.push('Live mode is not implemented in this build (sandbox ledger only).');
  if (!['verify', 'no-verify', 'disable'].includes(cfg.pgssl)) problems.push('PGSSL must be verify, no-verify or disable.');
  if (problems.length) {
    const err = new Error('Invalid configuration:\n - ' + problems.join('\n - '));
    err.code = 'BAD_CONFIG';
    throw err;
  }
  return cfg;
}
