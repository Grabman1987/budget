import { randomBytes } from 'node:crypto';

export interface AuthConfig {
  /** Relying party id: the registrable domain the passkeys are bound to. */
  rpID: string;
  rpName: string;
  /** Exact origin of the app, e.g. https://budget-fg.fly.dev. Used for WebAuthn and the CSRF origin check. */
  origin: string;
  cookieSecure: boolean;
  /** One-time token that allows the very first passkey. Unset = bootstrap disabled. */
  setupToken: string | undefined;
  /** Server secret for recovery-code hashes and client-address hashes (HMAC key). */
  pepper: Buffer;
  /** Trust the `Fly-Client-IP` header (only behind the Fly proxy). */
  trustProxy: boolean;
  sessionDays: number;
  /** Absolute lifetime cap of a session, however often it is used. */
  sessionMaxDays: number;
  stepUpMinutes: number;
}

/** Shortest accepted `BUDGET_PEPPER` (characters); 32 random bytes in base64 are 44. */
export const MIN_PEPPER_LENGTH = 32;

/**
 * Read the auth configuration from the environment. In production `BUDGET_ORIGIN` and
 * `BUDGET_PEPPER` are required: a wrong origin would silently break passkeys and the CSRF check,
 * and a pepper generated per run would invalidate every recovery code at each restart.
 */
export function authConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = env['NODE_ENV'] === 'production';
  const origin =
    env['BUDGET_ORIGIN'] ?? (production ? undefined : `http://localhost:${env['PORT'] ?? 3000}`);
  if (!origin)
    throw new Error('BUDGET_ORIGIN is required in production (e.g. https://budget-fg.fly.dev)');
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('BUDGET_ORIGIN must be a valid HTTP(S) origin');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('BUDGET_ORIGIN must be an HTTP(S) origin without credentials, path or query');
  if (production && url.protocol !== 'https:')
    throw new Error('BUDGET_ORIGIN must use HTTPS in production');
  const setupToken = env['BUDGET_SETUP_TOKEN']?.trim();
  return {
    rpID: env['BUDGET_RP_ID'] ?? url.hostname,
    rpName: 'Budget',
    origin: url.origin,
    cookieSecure: url.protocol === 'https:',
    setupToken: setupToken ? setupToken : undefined,
    pepper: pepperFromEnv(env, production),
    trustProxy: env['BUDGET_TRUST_PROXY'] === '1',
    sessionDays: 30,
    sessionMaxDays: 90,
    stepUpMinutes: 5,
  };
}

function pepperFromEnv(env: NodeJS.ProcessEnv, production: boolean): Buffer {
  const value = env['BUDGET_PEPPER']?.trim();
  if (value) {
    if (value.length < MIN_PEPPER_LENGTH)
      throw new Error(`BUDGET_PEPPER must be at least ${MIN_PEPPER_LENGTH} characters long`);
    return Buffer.from(value, 'utf8');
  }
  if (production)
    throw new Error('BUDGET_PEPPER is required in production (32 random bytes, see docs/ops.md)');
  // Development and tests: a fresh pepper per run. Recovery codes do not survive a restart then.
  return randomBytes(32);
}
