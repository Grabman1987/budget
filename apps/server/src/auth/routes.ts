import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AuthConfig } from './config';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  pepperedHex,
  randomToken,
  safeEqual,
  sha256Hex,
} from './crypto';
import { AuthEventLog } from './event-log';
import { clientKey, RateLimiter } from './rate-limit';
import type { AuthEventKind, AuthStore, ChallengePurpose, SessionRow } from './store';

const DAY = 86_400_000;
const CHALLENGE_TTL = 5 * 60_000;
/** Fixed WebAuthn user handle: there is exactly one owner. */
const USER_ID = new TextEncoder().encode('budget-owner');

export interface AuthDeps {
  store: AuthStore;
  config: AuthConfig;
  clock?: () => Date;
  /** Audit writer; defaults to one with the production limits. */
  events?: AuthEventLog;
  limiters?: {
    /** Verifying a login, recovery code or step-up (guessing). */
    attempts: RateLimiter;
    /** Requesting options and the first-passkey setup token (guessing). */
    setup: RateLimiter;
    /** Everything else on /api/auth. */
    general: RateLimiter;
  };
}

type Env = { Variables: { session: SessionRow } };

const credentialShape = z
  .object({
    id: z.string().min(1).max(2048),
    rawId: z.string().min(1).max(2048),
    type: z.literal('public-key'),
    response: z.object({ clientDataJSON: z.string().min(1).max(8192) }).passthrough(),
    clientExtensionResults: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .passthrough();

const bodies = {
  registerOptions: z.object({ setupToken: z.string().max(512).optional() }),
  registerVerify: z.object({
    response: credentialShape,
    deviceName: z.string().trim().min(1).max(60),
  }),
  loginVerify: z.object({ response: credentialShape }),
  recoveryLogin: z.object({ code: z.string().min(1).max(64) }),
};

/** The challenge the browser signed, read from the client data (used to look the challenge up). */
function challengeOf(response: { response: { clientDataJSON: string } }): string | undefined {
  try {
    const parsed = JSON.parse(
      Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'),
    ) as { challenge?: unknown };
    return typeof parsed.challenge === 'string' ? parsed.challenge : undefined;
  } catch {
    return undefined;
  }
}

export function createAuth(deps: AuthDeps) {
  const { store, config } = deps;
  const clock = deps.clock ?? (() => new Date());
  const events = deps.events ?? new AuthEventLog(store);
  // Per client (IPv6 by /64) and, as a ceiling against many addresses, across all clients.
  const limiters = deps.limiters ?? {
    attempts: new RateLimiter(10, 15 * 60_000, { globalLimit: 100 }),
    setup: new RateLimiter(5, 15 * 60_000, { globalLimit: 20 }),
    general: new RateLimiter(120, 15 * 60_000, { globalLimit: 3000 }),
  };
  const cookieName = config.cookieSecure ? '__Host-budget_session' : 'budget_session';

  const json = (c: Context, status: 200 | 400 | 401 | 403 | 404 | 409 | 429, body: unknown) =>
    c.json(body, status);
  const fail = (c: Context, status: 400 | 401 | 403 | 404 | 409 | 429, error: string) =>
    c.json({ error }, status);

  /** The client for rate limits and the audit: IPv4 address or IPv6 /64. Never stored in clear. */
  function client(c: Context): string {
    if (config.trustProxy) {
      const forwarded = c.req.header('fly-client-ip');
      if (forwarded) return clientKey(forwarded.trim());
    }
    const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
    return clientKey(env?.incoming?.socket?.remoteAddress ?? 'unknown');
  }
  /** Truncated HMAC with the pepper: linkable within the audit, useless without the server secret. */
  const ipHash = (c: Context) => pepperedHex(config.pepper, 'ip', client(c)).slice(0, 12);
  const recoveryHash = (code: string) => hashRecoveryCode(config.pepper, code);
  type Extra = { passkeyId?: string | null; detail?: string };
  const log = (c: Context, kind: AuthEventKind, extra: Extra = {}) =>
    events.write(kind, clock(), { ...extra, ipHash: ipHash(c) });
  /** Failures anyone can trigger: merged and capped so a flood cannot fill the volume (B1). */
  const reject = (c: Context, kind: AuthEventKind, extra: Extra = {}) =>
    events.reject(kind, clock(), { ...extra, ipHash: ipHash(c) });

  /** Count an attempt; answers 429 (and logs the first breach) when over the limit. */
  function throttled(c: Context, limiter: RateLimiter, name: string): Response | undefined {
    const decision = limiter.check(`${name}:${client(c)}`, clock().getTime());
    if (decision.allowed) return undefined;
    if (decision.firstBreach) reject(c, 'rate_limited', { detail: name });
    return fail(c, 429, 'rate_limited');
  }

  // ---------- sessions ----------
  const writeCookie = (c: Context, token: string, maxAgeSeconds: number) =>
    setCookie(c, cookieName, token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'Strict',
      path: '/',
      maxAge: maxAgeSeconds,
    });

  function readSession(c: Context): SessionRow | undefined {
    const token = getCookie(c, cookieName);
    if (!token) return undefined;
    const now = clock();
    const session = store.getSession(sha256Hex(token), now);
    if (!session) return undefined;
    // Sliding expiry, capped by the absolute maximum lifetime; touched at most every 10 minutes.
    // The cookie is sent again with the new lifetime, otherwise the browser drops it after 30 days
    // although the server would still accept the session.
    if (now.getTime() - Date.parse(session.lastSeenAt) > 10 * 60_000) {
      const cap = Date.parse(session.createdAt) + config.sessionMaxDays * DAY;
      const expiresAt = Math.min(now.getTime() + config.sessionDays * DAY, cap);
      store.touchSession(session.id, now, new Date(expiresAt));
      writeCookie(c, token, Math.floor((expiresAt - now.getTime()) / 1000));
    }
    return session;
  }

  function startSession(
    c: Context,
    input: { passkeyId: string | null; viaRecovery: boolean },
  ): void {
    const now = clock();
    // A new login from a browser that still holds a session replaces that session.
    const previous = getCookie(c, cookieName);
    if (previous) store.revokeSession(sha256Hex(previous), now);
    const token = randomToken();
    store.createSession({
      id: sha256Hex(token),
      passkeyId: input.passkeyId,
      now,
      expiresAt: new Date(now.getTime() + config.sessionDays * DAY),
      // A fresh login or recovery is itself a strong authentication.
      stepUp: true,
      viaRecovery: input.viaRecovery,
    });
    writeCookie(c, token, config.sessionDays * 86_400);
  }

  const stepUpFresh = (session: SessionRow): boolean =>
    session.stepUpAt !== null &&
    clock().getTime() - Date.parse(session.stepUpAt) < config.stepUpMinutes * 60_000;

  // ---------- middleware ----------
  /** CSRF: state-changing requests must come from the app's own origin (on top of SameSite=Strict). */
  const originGuard: MiddlewareHandler = async (c, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
    const origin = c.req.header('origin');
    const sameSite = c.req.header('sec-fetch-site') === 'same-origin';
    if (origin === config.origin || (origin === undefined && sameSite)) return next();
    reject(c, 'origin_rejected', { detail: origin ?? 'none' });
    return fail(c, 403, 'origin_rejected');
  };

  const requireSession: MiddlewareHandler<Env> = async (c, next) => {
    const session = readSession(c);
    if (!session) return fail(c, 401, 'unauthorized');
    c.set('session', session);
    return next();
  };

  /**
   * After `requireSession`: the session must have been opened with a passkey. A recovery-code
   * session never qualifies (it may only register a new passkey). No freshness check: the passkey
   * login when the app opens is enough for data sources and imports (owner decision 09.10.2026).
   */
  const requirePasskeySession: MiddlewareHandler<Env> = async (c, next) => {
    const session = c.get('session');
    // Defence in depth: /api/* already runs requireSession, but never let a missing session through.
    if (!session) return fail(c, 401, 'unauthorized');
    if (session.viaRecovery || session.passkeyId === null) return fail(c, 403, 'passkey_required');
    return next();
  };

  /**
   * After `requireSession`: only for security and data-exfiltration actions (full export). Needs a
   * passkey session AND a step-up of the last few minutes.
   */
  const requireStepUp: MiddlewareHandler<Env> = async (c, next) => {
    const session = c.get('session');
    if (session && (session.viaRecovery || session.passkeyId === null))
      return fail(c, 403, 'passkey_required');
    if (!session || !stepUpFresh(session)) return fail(c, 403, 'step_up_required');
    return next();
  };

  // ---------- routes ----------
  const routes = new Hono<Env>();
  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    // Reads (status, passkey list) cannot be used to guess anything and the app calls them on every
    // page load; only state-changing calls count against the general flood limit.
    if (c.req.method !== 'GET') {
      const limited = throttled(c, limiters.general, 'general');
      if (limited) return limited;
    }
    return next();
  });

  routes.get('/status', (c) => {
    const session = readSession(c);
    return c.json({
      setupRequired: store.activePasskeyCount() === 0,
      authenticated: Boolean(session),
      stepUpValidUntil:
        session && stepUpFresh(session)
          ? new Date(
              Date.parse(session.stepUpAt as string) + config.stepUpMinutes * 60_000,
            ).toISOString()
          : null,
      viaRecovery: session?.viaRecovery ?? false,
    });
  });

  // --- register (first device with the setup token, later devices with session + step-up) ---
  routes.post('/register/options', async (c) => {
    const parsed = bodies.registerOptions.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return fail(c, 400, 'bad_request');
    let purpose: ChallengePurpose;
    let sessionId: string | undefined;
    if (store.activePasskeyCount() === 0) {
      if (!config.setupToken) return fail(c, 403, 'setup_disabled');
      const limited = throttled(c, limiters.setup, 'setup');
      if (limited) return limited;
      if (!parsed.data.setupToken || !safeEqual(parsed.data.setupToken, config.setupToken)) {
        reject(c, 'login_failed', { detail: 'setup token' });
        return fail(c, 401, 'setup_token_invalid');
      }
      log(c, 'setup_started');
      purpose = 'register_setup';
    } else {
      const session = readSession(c);
      if (!session) return fail(c, 401, 'unauthorized');
      if (!stepUpFresh(session)) return fail(c, 403, 'step_up_required');
      purpose = 'register';
      sessionId = session.id;
    }
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userName: 'owner',
      userDisplayName: 'Budget',
      userID: USER_ID,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: store.listPasskeys().map((p) => ({
        id: p.credentialId,
        ...(p.transportsJson ? { transports: JSON.parse(p.transportsJson) as string[] } : {}),
      })),
    });
    store.saveChallenge(options.challenge, purpose, CHALLENGE_TTL, clock(), sessionId);
    return json(c, 200, { options });
  });

  routes.post('/register/verify', async (c) => {
    const parsed = bodies.registerVerify.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return fail(c, 400, 'bad_request');
    const response = parsed.data.response as unknown as RegistrationResponseJSON;
    const challenge = challengeOf(response);
    if (!challenge) return fail(c, 400, 'challenge_invalid');

    const bootstrap = store.activePasskeyCount() === 0;
    const session = bootstrap ? undefined : readSession(c);
    if (!bootstrap) {
      if (!session) return fail(c, 401, 'unauthorized');
      if (!stepUpFresh(session)) return fail(c, 403, 'step_up_required');
    }
    const limited = throttled(c, limiters.attempts, 'attempts');
    if (limited) return limited;
    if (
      !store.consumeChallenge(
        challenge,
        [bootstrap ? 'register_setup' : 'register'],
        clock(),
        session?.id,
      )
    ) {
      return fail(c, 400, 'challenge_invalid');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        requireUserVerification: true,
      });
    } catch {
      return fail(c, 400, 'registration_failed');
    }
    if (!verification.verified) return fail(c, 400, 'registration_failed');
    // Another registration may have finished while this one was verified.
    if (bootstrap && store.activePasskeyCount() > 0) return fail(c, 409, 'setup_already_done');

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    let passkeyId: string;
    try {
      passkeyId = store.insertPasskey({
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transportsJson: credential.transports ? JSON.stringify(credential.transports) : null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        deviceName: parsed.data.deviceName,
        createdAt: clock().toISOString(),
      });
    } catch {
      return fail(c, 409, 'passkey_exists');
    }
    log(c, 'passkey_registered', { passkeyId });

    if (!bootstrap) return json(c, 200, { passkeyId });
    const codes = generateRecoveryCodes(10);
    store.replaceRecoveryCodes(codes.map(recoveryHash), clock());
    log(c, 'recovery_codes_created');
    startSession(c, { passkeyId, viaRecovery: false });
    return json(c, 200, { passkeyId, recoveryCodes: codes });
  });

  // --- login ---
  routes.post('/login/options', async (c) => {
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      userVerification: 'required',
    });
    store.saveChallenge(options.challenge, 'login', CHALLENGE_TTL, clock());
    return json(c, 200, { options });
  });

  async function verifyAssertion(
    c: Context,
    response: AuthenticationResponseJSON,
    purpose: 'login' | 'step_up',
    sessionId?: string,
  ): Promise<{ passkeyId: string } | undefined> {
    const challenge = challengeOf(response);
    if (!challenge || !store.consumeChallenge(challenge, [purpose], clock(), sessionId))
      return undefined;
    const stored = store.findActivePasskey(response.id);
    if (!stored) return undefined;
    const credential: WebAuthnCredential = {
      id: stored.credentialId,
      publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64url')),
      counter: stored.counter,
      ...(stored.transportsJson ? { transports: JSON.parse(stored.transportsJson) } : {}),
    };
    try {
      const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        credential,
        requireUserVerification: true,
      });
      if (!result.verified) return undefined;
      store.touchPasskey(stored.id, result.authenticationInfo.newCounter, clock());
      return { passkeyId: stored.id };
    } catch {
      reject(c, purpose === 'login' ? 'login_failed' : 'step_up_failed', {
        passkeyId: stored.id,
        detail: 'verification',
      });
      return undefined;
    }
  }

  routes.post('/login/verify', async (c) => {
    const parsed = bodies.loginVerify.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return fail(c, 400, 'bad_request');
    const limited = throttled(c, limiters.attempts, 'attempts');
    if (limited) return limited;
    const result = await verifyAssertion(
      c,
      parsed.data.response as unknown as AuthenticationResponseJSON,
      'login',
    );
    if (!result) {
      reject(c, 'login_failed');
      return fail(c, 401, 'login_failed');
    }
    startSession(c, { passkeyId: result.passkeyId, viaRecovery: false });
    log(c, 'login_ok', { passkeyId: result.passkeyId });
    return json(c, 200, { ok: true });
  });

  // --- step-up ---
  routes.post('/step-up/options', requireSession, async (c) => {
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      userVerification: 'required',
    });
    store.saveChallenge(options.challenge, 'step_up', CHALLENGE_TTL, clock(), c.get('session').id);
    return json(c, 200, { options });
  });

  routes.post('/step-up/verify', requireSession, async (c) => {
    const parsed = bodies.loginVerify.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return fail(c, 400, 'bad_request');
    const limited = throttled(c, limiters.attempts, 'attempts');
    if (limited) return limited;
    const session = c.get('session');
    const result = await verifyAssertion(
      c,
      parsed.data.response as unknown as AuthenticationResponseJSON,
      'step_up',
      session.id,
    );
    if (!result) {
      reject(c, 'step_up_failed', { passkeyId: session.passkeyId });
      return fail(c, 401, 'step_up_failed');
    }
    const now = clock();
    store.setStepUp(session.id, now);
    log(c, 'step_up_ok', { passkeyId: result.passkeyId });
    return json(c, 200, {
      stepUpValidUntil: new Date(now.getTime() + config.stepUpMinutes * 60_000).toISOString(),
    });
  });

  // --- recovery codes ---
  routes.post('/recovery/login', async (c) => {
    const parsed = bodies.recoveryLogin.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return fail(c, 400, 'bad_request');
    const limited = throttled(c, limiters.attempts, 'attempts');
    if (limited) return limited;
    if (!store.consumeRecoveryCode(recoveryHash(parsed.data.code), clock())) {
      reject(c, 'recovery_login_failed');
      return fail(c, 401, 'login_failed');
    }
    startSession(c, { passkeyId: null, viaRecovery: true });
    log(c, 'recovery_login_ok');
    return json(c, 200, { ok: true });
  });

  routes.post('/recovery/regenerate', requireSession, (c) => {
    const session = c.get('session');
    if (!stepUpFresh(session)) return fail(c, 403, 'step_up_required');
    const codes = generateRecoveryCodes(10);
    store.replaceRecoveryCodes(codes.map(recoveryHash), clock());
    // Whoever logged in with one of the old codes loses that session too (except this one).
    const ended = store.revokeRecoverySessions(clock(), session.id);
    log(c, 'recovery_codes_created', {
      passkeyId: session.passkeyId,
      detail: `recovery sessions ended: ${ended}`,
    });
    return json(c, 200, { recoveryCodes: codes });
  });

  // --- sessions ---
  /** "Alle anderen Sitzungen beenden": every session except the calling one, needs a step-up. */
  routes.post('/sessions/revoke-others', requireSession, (c) => {
    const session = c.get('session');
    if (!stepUpFresh(session)) return fail(c, 403, 'step_up_required');
    const ended = store.revokeOtherSessions(session.id, clock());
    log(c, 'sessions_revoked', { passkeyId: session.passkeyId, detail: `ended: ${ended}` });
    return json(c, 200, { ended });
  });

  // --- passkey management ---
  routes.get('/passkeys', requireSession, (c) => {
    const session = c.get('session');
    return c.json({
      passkeys: store.listPasskeys().map((p) => ({
        id: p.id,
        deviceName: p.deviceName,
        createdAt: p.createdAt,
        lastUsedAt: p.lastUsedAt,
        current: p.id === session.passkeyId,
      })),
      recoveryCodesRemaining: store.recoveryCodesRemaining(),
      otherSessions: Math.max(0, store.activeSessionCount(clock()) - 1),
    });
  });

  routes.delete('/passkeys/:id', requireSession, (c) => {
    const session = c.get('session');
    if (!stepUpFresh(session)) return fail(c, 403, 'step_up_required');
    const target = store.getPasskey(c.req.param('id'));
    if (!target) return fail(c, 404, 'not_found');
    if (store.activePasskeyCount() <= 1) return fail(c, 409, 'last_passkey');
    store.revokePasskey(target.id, clock());
    // A lost device may also have been used with a recovery code: those sessions have no passkey
    // and would survive, so they end too (except the calling one).
    const ended = store.revokeRecoverySessions(clock(), session.id);
    log(c, 'passkey_revoked', {
      passkeyId: target.id,
      detail: `recovery sessions ended: ${ended}`,
    });
    if (target.id === session.passkeyId)
      deleteCookie(c, cookieName, { path: '/', secure: config.cookieSecure });
    return json(c, 200, { ok: true });
  });

  routes.post('/logout', (c) => {
    const session = readSession(c);
    if (session) {
      store.revokeSession(session.id, clock());
      log(c, 'logout', { passkeyId: session.passkeyId });
    }
    deleteCookie(c, cookieName, { path: '/', secure: config.cookieSecure });
    return json(c, 200, { ok: true });
  });

  return {
    routes,
    originGuard,
    requireSession,
    requirePasskeySession,
    requireStepUp,
    readSession,
    events,
  };
}

export type Auth = ReturnType<typeof createAuth>;
