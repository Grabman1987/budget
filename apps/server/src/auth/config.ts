export interface AuthConfig {
  /** Relying party id: the registrable domain the passkeys are bound to. */
  rpID: string;
  rpName: string;
  /** Exact origin of the app, e.g. https://budget-fg.fly.dev. Used for WebAuthn and the CSRF origin check. */
  origin: string;
  cookieSecure: boolean;
  /** One-time token that allows the very first passkey. Unset = bootstrap disabled. */
  setupToken: string | undefined;
  /** Trust the `Fly-Client-IP` header (only behind the Fly proxy). */
  trustProxy: boolean;
  sessionDays: number;
  /** Absolute lifetime cap of a session, however often it is used. */
  sessionMaxDays: number;
  stepUpMinutes: number;
}

/**
 * Read the auth configuration from the environment. In production `BUDGET_ORIGIN` is required:
 * a wrong origin would silently break passkeys and the CSRF check.
 */
export function authConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = env['NODE_ENV'] === 'production';
  const origin =
    env['BUDGET_ORIGIN'] ?? (production ? undefined : `http://localhost:${env['PORT'] ?? 3000}`);
  if (!origin)
    throw new Error('BUDGET_ORIGIN is required in production (e.g. https://budget-fg.fly.dev)');
  const url = new URL(origin);
  const setupToken = env['BUDGET_SETUP_TOKEN']?.trim();
  return {
    rpID: env['BUDGET_RP_ID'] ?? url.hostname,
    rpName: 'Budget',
    origin: url.origin,
    cookieSecure: url.protocol === 'https:',
    setupToken: setupToken ? setupToken : undefined,
    trustProxy: env['BUDGET_TRUST_PROXY'] === '1',
    sessionDays: 30,
    sessionMaxDays: 90,
    stepUpMinutes: 5,
  };
}
