import { createTestDatabase, schema } from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { AuthConfig } from './config';
import { RateLimiter } from './rate-limit';
import { createAuth } from './routes';
import { AuthStore } from './store';
import { SoftAuthenticator } from './testing/authenticator';

const ORIGIN = 'http://localhost:3000';
const SETUP_TOKEN = 'setup-token-for-tests-only';
const webDir = mkdtempSync(join(tmpdir(), 'budget-web-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');

const config: AuthConfig = {
  rpID: 'localhost',
  rpName: 'Budget',
  origin: ORIGIN,
  cookieSecure: false,
  setupToken: SETUP_TOKEN,
  pepper: Buffer.from('pepper-for-tests-only-0123456789abcdef'),
  trustProxy: false,
  sessionDays: 30,
  sessionMaxDays: 90,
  stepUpMinutes: 5,
};

let now = new Date('2026-09-29T10:00:00Z');
const advance = (ms: number) => {
  now = new Date(now.getTime() + ms);
};
const MINUTE = 60_000;
const DAY = 86_400_000;

function setup(
  overrides: Partial<AuthConfig> = {},
  limits = { attempts: 10, setup: 5, general: 500 },
) {
  const { db } = createTestDatabase();
  const store = new AuthStore(db);
  const cfg = { ...config, ...overrides };
  const auth = createAuth({
    store,
    config: cfg,
    clock: () => now,
    limiters: {
      attempts: new RateLimiter(limits.attempts, 15 * MINUTE),
      setup: new RateLimiter(limits.setup, 15 * MINUTE),
      general: new RateLimiter(limits.general, 15 * MINUTE),
    },
  });
  const app = createApp({ webDir, auth, database: db, ledger: { db } });
  const device = () => new SoftAuthenticator({ rpID: cfg.rpID, origin: cfg.origin });

  async function call(
    method: string,
    path: string,
    body?: unknown,
    cookie?: string,
    headers: Record<string, string> = {},
  ) {
    const res = await app.request(path, {
      method,
      headers: {
        ...(method !== 'GET' ? { origin: ORIGIN, 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const setCookie = res.headers.get('set-cookie');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper returns loosely typed JSON
    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    return { status: res.status, data, setCookie, cookie: setCookie?.split(';')[0] };
  }

  /** First device: setup token, registration, returns the session cookie and recovery codes. */
  async function bootstrap(authenticator = device()) {
    const opts = await call('POST', '/api/auth/register/options', { setupToken: SETUP_TOKEN });
    expect(opts.status).toBe(200);
    const verify = await call('POST', '/api/auth/register/verify', {
      response: authenticator.register(opts.data['options']),
      deviceName: 'Testgerät',
    });
    expect(verify.status).toBe(200);
    return {
      authenticator,
      cookie: verify.cookie as string,
      codes: verify.data['recoveryCodes'] as string[],
      passkeyId: verify.data['passkeyId'] as string,
    };
  }

  async function login(authenticator: SoftAuthenticator, overrides = {}) {
    const opts = await call('POST', '/api/auth/login/options', {});
    return call('POST', '/api/auth/login/verify', {
      response: authenticator.authenticate(opts.data['options'], overrides),
    });
  }

  return { db, store, auth, app, call, device, bootstrap, login, cfg };
}

beforeEach(() => {
  now = new Date('2026-09-29T10:00:00Z');
});

describe('bootstrap with the setup token', () => {
  it('starts with setup required and nobody logged in', async () => {
    const { call } = setup();
    expect((await call('GET', '/api/auth/status')).data).toEqual({
      setupRequired: true,
      authenticated: false,
      stepUpValidUntil: null,
      viaRecovery: false,
    });
  });

  it('refuses registration without or with a wrong token', async () => {
    const { call } = setup();
    expect((await call('POST', '/api/auth/register/options', {})).status).toBe(401);
    const wrong = await call('POST', '/api/auth/register/options', { setupToken: 'nope' });
    expect(wrong.status).toBe(401);
    expect(wrong.data['error']).toBe('setup_token_invalid');
  });

  it('is disabled when no setup token is configured (no open sign-up)', async () => {
    const { call } = setup({ setupToken: undefined });
    const res = await call('POST', '/api/auth/register/options', { setupToken: 'anything' });
    expect(res.status).toBe(403);
    expect(res.data['error']).toBe('setup_disabled');
  });

  it('registers the first passkey, starts a session and returns ten recovery codes once', async () => {
    const { bootstrap, call, db } = setup();
    const { cookie, codes } = await bootstrap();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((c) => /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(c))).toBe(true);
    expect((await call('GET', '/api/auth/status', undefined, cookie)).data).toMatchObject({
      setupRequired: false,
      authenticated: true,
    });
    // Only hashes are stored.
    const stored = db.select().from(schema.recoveryCode).all();
    expect(stored).toHaveLength(10);
    for (const code of codes)
      expect(stored.some((r) => r.codeHash.includes(code.replaceAll('-', '')))).toBe(false);
  });

  it('the setup token is useless once a passkey exists', async () => {
    const { bootstrap, call } = setup();
    const { cookie } = await bootstrap();
    const again = await call('POST', '/api/auth/register/options', { setupToken: SETUP_TOKEN });
    expect(again.status).toBe(401);
    expect(again.data['error']).toBe('unauthorized');
    // Even with the session, a new passkey needs a fresh step-up (a fresh login is one).
    expect((await call('POST', '/api/auth/register/options', {}, cookie)).status).toBe(200);
  });

  it('a registration response with the wrong origin or a replayed challenge is rejected', async () => {
    const { call, device } = setup();
    const opts = await call('POST', '/api/auth/register/options', { setupToken: SETUP_TOKEN });
    const a = device();
    const wrong = await call('POST', '/api/auth/register/verify', {
      response: a.register(opts.data['options'], { origin: 'https://evil.example' }),
      deviceName: 'x',
    });
    expect(wrong.status).toBe(400);
    // The challenge was consumed by the failed attempt: it cannot be replayed.
    const replay = await call('POST', '/api/auth/register/verify', {
      response: a.register(opts.data['options']),
      deviceName: 'x',
    });
    expect(replay.status).toBe(400);
    expect(replay.data['error']).toBe('challenge_invalid');
  });

  it('cookie flags: HttpOnly, SameSite=Strict, 30 days, Secure when the origin is https', async () => {
    const plain = setup();
    const first = await plain.call('POST', '/api/auth/register/options', {
      setupToken: SETUP_TOKEN,
    });
    const res = await plain.app.request('/api/auth/register/verify', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({
        response: plain.device().register(first.data['options']),
        deviceName: 'x',
      }),
    });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).not.toMatch(/Secure/i);

    const secure = setup({
      origin: 'https://budget-fg.fly.dev',
      rpID: 'budget-fg.fly.dev',
      cookieSecure: true,
    });
    const o = await secure.call(
      'POST',
      '/api/auth/register/options',
      { setupToken: SETUP_TOKEN },
      undefined,
      { origin: 'https://budget-fg.fly.dev' },
    );
    const dev = new SoftAuthenticator({
      rpID: 'budget-fg.fly.dev',
      origin: 'https://budget-fg.fly.dev',
    });
    const r = await secure.app.request('/api/auth/register/verify', {
      method: 'POST',
      headers: { origin: 'https://budget-fg.fly.dev', 'content-type': 'application/json' },
      body: JSON.stringify({ response: dev.register(o.data['options']), deviceName: 'x' }),
    });
    expect(r.status).toBe(200);
    const sc = r.headers.get('set-cookie') ?? '';
    expect(sc).toMatch(/^__Host-budget_session=/);
    expect(sc).toMatch(/Secure/i);
  });
});

describe('protected API and CSRF', () => {
  it('everything under /api except /api/auth needs a session', async () => {
    const { bootstrap, call } = setup();
    expect((await call('GET', '/api/debug/summary')).status).toBe(401);
    expect((await call('GET', '/api/whatever')).status).toBe(401);
    // The ledger API sits behind the same session guard.
    for (const path of ['/api/accounts', '/api/bookings', '/api/payees', '/api/lookups'])
      expect((await call('GET', path)).status, path).toBe(401);
    expect((await call('POST', '/api/undo', { groupId: 'x' })).status).toBe(401);
    const { cookie } = await bootstrap();
    expect((await call('GET', '/api/debug/summary', undefined, cookie)).status).toBe(200);
    expect((await call('GET', '/api/whatever', undefined, cookie)).status).toBe(404);
  });

  it('/health and the web app stay public', async () => {
    const { app } = setup();
    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/')).status).toBe(200);
  });

  it('state-changing requests need the app origin (CSRF)', async () => {
    const { bootstrap, call, app } = setup();
    const { cookie } = await bootstrap();
    const foreign = await call('POST', '/api/auth/logout', {}, cookie, {
      origin: 'https://evil.example',
    });
    expect(foreign.status).toBe(403);
    expect(foreign.data['error']).toBe('origin_rejected');
    const missing = await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } });
    expect(missing.status).toBe(403);
    // A browser marks same-origin requests without Origin (rare) with Sec-Fetch-Site.
    const sameSite = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { cookie, 'sec-fetch-site': 'same-origin' },
    });
    expect(sameSite.status).toBe(200);
  });
});

describe('login', () => {
  it('logs in with a registered passkey and rejects unknown ones', async () => {
    const { bootstrap, login, call, device } = setup();
    const { authenticator } = await bootstrap();
    const ok = await login(authenticator);
    expect(ok.status).toBe(200);
    expect(
      (await call('GET', '/api/auth/status', undefined, ok.cookie)).data['authenticated'],
    ).toBe(true);
    const stranger = await login(device());
    expect(stranger.status).toBe(401);
    expect(stranger.data['error']).toBe('login_failed');
  });

  it('a challenge can be used once', async () => {
    const { bootstrap, call } = setup();
    const { authenticator } = await bootstrap();
    const opts = await call('POST', '/api/auth/login/options', {});
    const response = authenticator.authenticate(opts.data['options']);
    expect((await call('POST', '/api/auth/login/verify', { response })).status).toBe(200);
    expect((await call('POST', '/api/auth/login/verify', { response })).status).toBe(401);
  });

  it('rejects a wrong origin, a missing user verification and a counter that goes backwards', async () => {
    const { bootstrap, login } = setup();
    const { authenticator } = await bootstrap();
    expect((await login(authenticator, { origin: 'https://evil.example' })).status).toBe(401);
    expect((await login(authenticator, { userVerified: false })).status).toBe(401);
    expect((await login(authenticator, { signCount: 10 })).status).toBe(200);
    expect((await login(authenticator, { signCount: 4 })).status).toBe(401);
    expect((await login(authenticator, { signCount: 11 })).status).toBe(200);
  });

  it('sessions last 30 days and slide while in use, but never beyond 90 days', async () => {
    const { bootstrap, login, call } = setup();
    const { authenticator } = await bootstrap();
    const { cookie } = await login(authenticator);
    advance(29 * DAY);
    expect((await call('GET', '/api/auth/status', undefined, cookie)).data['authenticated']).toBe(
      true,
    );
    advance(29 * DAY); // 58 days after login: the use above extended the session
    expect((await call('GET', '/api/auth/status', undefined, cookie)).data['authenticated']).toBe(
      true,
    );
    advance(29 * DAY); // 87 days
    expect((await call('GET', '/api/auth/status', undefined, cookie)).data['authenticated']).toBe(
      true,
    );
    advance(4 * DAY); // 91 days: past the absolute limit
    expect((await call('GET', '/api/auth/status', undefined, cookie)).data['authenticated']).toBe(
      false,
    );
  });

  it('an unused session expires after 30 days', async () => {
    const { bootstrap, login, call } = setup();
    const { authenticator } = await bootstrap();
    const { cookie } = await login(authenticator);
    advance(31 * DAY);
    expect((await call('GET', '/api/auth/status', undefined, cookie)).data['authenticated']).toBe(
      false,
    );
  });

  it('logout revokes the session on the server', async () => {
    const { bootstrap, call } = setup();
    const { cookie } = await bootstrap();
    expect((await call('POST', '/api/auth/logout', {}, cookie)).status).toBe(200);
    expect((await call('GET', '/api/auth/status', undefined, cookie)).data['authenticated']).toBe(
      false,
    );
  });
});

describe('step-up for sensitive actions', () => {
  it('adding a passkey needs a fresh step-up; a step-up ceremony renews it', async () => {
    const { bootstrap, call, device } = setup();
    const { authenticator, cookie } = await bootstrap();
    advance(6 * MINUTE);
    const stale = await call('POST', '/api/auth/register/options', {}, cookie);
    expect(stale.status).toBe(403);
    expect(stale.data['error']).toBe('step_up_required');
    expect(
      (await call('GET', '/api/auth/status', undefined, cookie)).data['stepUpValidUntil'],
    ).toBeNull();

    const opts = await call('POST', '/api/auth/step-up/options', {}, cookie);
    const done = await call(
      'POST',
      '/api/auth/step-up/verify',
      { response: authenticator.authenticate(opts.data['options']) },
      cookie,
    );
    expect(done.status).toBe(200);
    expect(done.data['stepUpValidUntil']).toBe(new Date(now.getTime() + 5 * MINUTE).toISOString());

    const reg = await call('POST', '/api/auth/register/options', {}, cookie);
    expect(reg.status).toBe(200);
    const second = device();
    const verify = await call(
      'POST',
      '/api/auth/register/verify',
      { response: second.register(reg.data['options']), deviceName: 'Zweites Gerät' },
      cookie,
    );
    expect(verify.status).toBe(200);
    expect(verify.data['recoveryCodes']).toBeUndefined();
    const list = await call('GET', '/api/auth/passkeys', undefined, cookie);
    expect(list.data['passkeys']).toHaveLength(2);
    expect(list.data['passkeys'].filter((p: { current: boolean }) => p.current)).toHaveLength(1);
  });

  it('a step-up challenge is bound to its session and the passkey list needs a session', async () => {
    const { bootstrap, login, call } = setup();
    const { authenticator, cookie } = await bootstrap();
    const other = (await login(authenticator)).cookie;
    const opts = await call('POST', '/api/auth/step-up/options', {}, cookie);
    const stolen = await call(
      'POST',
      '/api/auth/step-up/verify',
      { response: authenticator.authenticate(opts.data['options']) },
      other,
    );
    expect(stolen.status).toBe(401);
    expect((await call('GET', '/api/auth/passkeys')).status).toBe(401);
  });
});

describe('managing passkeys', () => {
  async function twoDevices() {
    const ctx = setup();
    const first = await ctx.bootstrap();
    const opts = await ctx.call('POST', '/api/auth/register/options', {}, first.cookie);
    const second = ctx.device();
    const verify = await ctx.call(
      'POST',
      '/api/auth/register/verify',
      { response: second.register(opts.data['options']), deviceName: 'Zweit' },
      first.cookie,
    );
    return { ...ctx, first, second, secondId: verify.data['passkeyId'] as string };
  }

  it('the last passkey cannot be revoked', async () => {
    const { bootstrap, call } = setup();
    const { cookie, passkeyId } = await bootstrap();
    const res = await call('DELETE', `/api/auth/passkeys/${passkeyId}`, undefined, cookie);
    expect(res.status).toBe(409);
    expect(res.data['error']).toBe('last_passkey');
  });

  it('revoking needs a step-up, ends the sessions of that device and blocks its login', async () => {
    const { call, login, first, second, secondId } = await twoDevices();
    const secondSession = (await login(second)).cookie as string;
    advance(6 * MINUTE);
    expect(
      (await call('DELETE', `/api/auth/passkeys/${secondId}`, undefined, first.cookie)).data[
        'error'
      ],
    ).toBe('step_up_required');
    const relogin = (await login(first.authenticator)).cookie as string;
    expect(
      (await call('DELETE', `/api/auth/passkeys/${secondId}`, undefined, relogin)).status,
    ).toBe(200);
    expect(
      (await call('GET', '/api/auth/status', undefined, secondSession)).data['authenticated'],
    ).toBe(false);
    expect((await login(second)).status).toBe(401);
    expect(
      (await call('GET', '/api/auth/passkeys', undefined, relogin)).data['passkeys'],
    ).toHaveLength(1);
  });
});

describe('recovery codes', () => {
  it('a code logs in once, ignores case and dashes, and starts a recovery session', async () => {
    const { bootstrap, call } = setup();
    const { codes } = await bootstrap();
    const typed = (codes[0] as string).toLowerCase().replaceAll('-', ' ');
    const ok = await call('POST', '/api/auth/recovery/login', { code: typed });
    expect(ok.status).toBe(200);
    expect((await call('GET', '/api/auth/status', undefined, ok.cookie)).data).toMatchObject({
      authenticated: true,
      viaRecovery: true,
    });
    expect((await call('POST', '/api/auth/recovery/login', { code: codes[0] })).status).toBe(401);
    expect(
      (await call('POST', '/api/auth/recovery/login', { code: 'AAAA-AAAA-AAAA-AAAA' })).status,
    ).toBe(401);
    expect(
      (await call('GET', '/api/auth/passkeys', undefined, ok.cookie)).data[
        'recoveryCodesRemaining'
      ],
    ).toBe(9);
  });

  it('a recovery session may add a new passkey (a lost device can be replaced)', async () => {
    const { bootstrap, call, device } = setup();
    const { codes } = await bootstrap();
    const session = (await call('POST', '/api/auth/recovery/login', { code: codes[0] }))
      .cookie as string;
    const opts = await call('POST', '/api/auth/register/options', {}, session);
    expect(opts.status).toBe(200);
    expect(
      (
        await call(
          'POST',
          '/api/auth/register/verify',
          { response: device().register(opts.data['options']), deviceName: 'Ersatz' },
          session,
        )
      ).status,
    ).toBe(200);
  });

  it('regenerating needs a fresh step-up', async () => {
    const { bootstrap, call } = setup();
    const { cookie } = await bootstrap();
    advance(6 * MINUTE);
    expect((await call('POST', '/api/auth/recovery/regenerate', {}, cookie)).status).toBe(403);
  });

  it('regenerated codes replace the old batch', async () => {
    const { bootstrap, call } = setup();
    const { cookie, codes } = await bootstrap();
    const fresh = await call('POST', '/api/auth/recovery/regenerate', {}, cookie);
    expect(fresh.status).toBe(200);
    expect(fresh.data['recoveryCodes']).toHaveLength(10);
    expect((await call('POST', '/api/auth/recovery/login', { code: codes[1] })).status).toBe(401);
    expect(
      (await call('POST', '/api/auth/recovery/login', { code: fresh.data['recoveryCodes'][1] }))
        .status,
    ).toBe(200);
  });
});

describe('rate limiting and audit', () => {
  it('blocks repeated wrong recovery codes with 429 and records it', async () => {
    const { call, bootstrap, store } = setup({}, { attempts: 3, setup: 5, general: 500 });
    await bootstrap();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++)
      statuses.push(
        (await call('POST', '/api/auth/recovery/login', { code: 'AAAA-AAAA-AAAA-AAAA' })).status,
      );
    // The registration during bootstrap already used one of the three attempts.
    expect(statuses).toEqual([401, 401, 429, 429, 429]);
    expect(store.recentEvents().filter((e) => e.kind === 'rate_limited')).toHaveLength(1);
    advance(16 * MINUTE);
    expect(
      (await call('POST', '/api/auth/recovery/login', { code: 'AAAA-AAAA-AAAA-AAAA' })).status,
    ).toBe(401);
  });

  it('guessing the setup token is throttled', async () => {
    const { call } = setup({}, { attempts: 10, setup: 2, general: 500 });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++)
      statuses.push(
        (await call('POST', '/api/auth/register/options', { setupToken: `guess-${i}` })).status,
      );
    expect(statuses).toEqual([401, 401, 429, 429]);
  });

  it('audits registrations, logins and failures without storing the client address', async () => {
    const { bootstrap, login, call, store, device } = setup();
    const { authenticator } = await bootstrap();
    await login(authenticator);
    await login(device());
    await call('POST', '/api/auth/recovery/login', { code: 'AAAA-AAAA-AAAA-AAAA' });
    const kinds = store.recentEvents().map((e) => e.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'setup_started',
        'passkey_registered',
        'recovery_codes_created',
        'login_ok',
        'login_failed',
        'recovery_login_failed',
      ]),
    );
    for (const e of store.recentEvents()) {
      expect(e.ipHash === null || /^[0-9a-f]{12}$/.test(e.ipHash)).toBe(true);
      expect(JSON.stringify(e)).not.toContain('SETUP');
    }
  });
});

describe('P1f-2 hardening', () => {
  it('B1: 10,000 foreign-origin requests leave a bounded audit with short details', async () => {
    const { app, db, auth } = setup();
    const origin = `https://${'x'.repeat(16_000)}.example`;
    for (let i = 0; i < 10_000; i++) {
      const res = await app.request('/api/auth/logout', { method: 'POST', headers: { origin } });
      expect(res.status).toBe(403);
      advance(100);
    }
    auth.events.flush(now);
    const rows = db.select().from(schema.authEvent).all();
    // 10,000 × 100 ms = 1,000 s: two 10-minute windows of one client.
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === 'origin_rejected')).toBe(true);
    expect(rows.every((r) => (r.detail ?? '').length === 100)).toBe(true);
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(10_000);
  });

  it('B2: regenerating codes ends recovery sessions except the calling one', async () => {
    const { bootstrap, call } = setup();
    const { cookie, codes } = await bootstrap();
    const intruder = (await call('POST', '/api/auth/recovery/login', { code: codes[0] })).cookie;
    const ownRecovery = (await call('POST', '/api/auth/recovery/login', { code: codes[1] })).cookie;
    expect((await call('POST', '/api/auth/recovery/regenerate', {}, ownRecovery)).status).toBe(200);
    const status = async (c?: string) =>
      (await call('GET', '/api/auth/status', undefined, c)).data['authenticated'];
    expect(await status(intruder)).toBe(false);
    expect(await status(ownRecovery)).toBe(true);
    expect(await status(cookie)).toBe(true); // passkey sessions are not affected
  });

  it('B2: revoking a passkey also ends recovery sessions', async () => {
    const { bootstrap, call, device } = setup();
    const first = await bootstrap();
    const opts = await call('POST', '/api/auth/register/options', {}, first.cookie);
    const verify = await call(
      'POST',
      '/api/auth/register/verify',
      { response: device().register(opts.data['options']), deviceName: 'Verloren' },
      first.cookie,
    );
    const recovery = (await call('POST', '/api/auth/recovery/login', { code: first.codes[0] }))
      .cookie;
    const res = await call(
      'DELETE',
      `/api/auth/passkeys/${verify.data['passkeyId']}`,
      undefined,
      first.cookie,
    );
    expect(res.status).toBe(200);
    expect((await call('GET', '/api/auth/status', undefined, recovery)).data['authenticated']).toBe(
      false,
    );
    expect(
      (await call('GET', '/api/auth/status', undefined, first.cookie)).data['authenticated'],
    ).toBe(true);
  });

  it('B2: "Alle anderen Sitzungen beenden" needs a step-up and keeps only the calling session', async () => {
    const { bootstrap, login, call, store } = setup();
    const { authenticator, cookie, codes } = await bootstrap();
    const other = (await login(authenticator)).cookie;
    const recovery = (await call('POST', '/api/auth/recovery/login', { code: codes[0] })).cookie;
    expect((await call('GET', '/api/auth/passkeys', undefined, cookie)).data['otherSessions']).toBe(
      2,
    );

    advance(6 * MINUTE);
    const stale = await call('POST', '/api/auth/sessions/revoke-others', {}, cookie);
    expect(stale.status).toBe(403);
    expect(stale.data['error']).toBe('step_up_required');
    expect((await call('POST', '/api/auth/sessions/revoke-others', {})).status).toBe(401);

    const opts = await call('POST', '/api/auth/step-up/options', {}, cookie);
    await call(
      'POST',
      '/api/auth/step-up/verify',
      { response: authenticator.authenticate(opts.data['options']) },
      cookie,
    );
    const done = await call('POST', '/api/auth/sessions/revoke-others', {}, cookie);
    expect(done.status).toBe(200);
    expect(done.data['ended']).toBe(2);
    for (const c of [other, recovery])
      expect((await call('GET', '/api/auth/status', undefined, c)).data['authenticated']).toBe(
        false,
      );
    expect((await call('GET', '/api/auth/passkeys', undefined, cookie)).data['otherSessions']).toBe(
      0,
    );
    expect(store.recentEvents().some((e) => e.kind === 'sessions_revoked')).toBe(true);
  });

  it('B3: bodies over 64 KB are refused with 413 before the origin check and the audit', async () => {
    const { app, db } = setup();
    const res = await app.request('/api/auth/recovery/login', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'x'.repeat(70 * 1024) }),
    });
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await res.text()).toMatch(/too large/);
    expect(db.select().from(schema.authEvent).all()).toHaveLength(0);
    const small = await app.request('/api/auth/recovery/login', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'AAAA' }),
    });
    expect(small.status).toBe(401);
  });

  it('B4: recovery codes are stored as a peppered HMAC, not as a plain SHA-256', async () => {
    const { bootstrap, db } = setup();
    const { codes } = await bootstrap();
    const { createHash } = await import('node:crypto');
    const plain = createHash('sha256')
      .update(`recovery:${(codes[0] as string).replaceAll('-', '')}`)
      .digest('hex');
    const stored = db
      .select()
      .from(schema.recoveryCode)
      .all()
      .map((r) => r.codeHash);
    expect(stored).not.toContain(plain);
    expect(stored.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
  });

  it('B7: a new login from a browser with a session ends the previous session', async () => {
    const { bootstrap, call } = setup();
    const { authenticator, cookie } = await bootstrap();
    const opts = await call('POST', '/api/auth/login/options', {}, cookie);
    const again = await call(
      'POST',
      '/api/auth/login/verify',
      { response: authenticator.authenticate(opts.data['options']) },
      cookie,
    );
    expect(again.status).toBe(200);
    expect(again.cookie).not.toBe(cookie);
    expect((await call('GET', '/api/auth/status', undefined, cookie)).data['authenticated']).toBe(
      false,
    );
    expect(
      (await call('GET', '/api/auth/status', undefined, again.cookie)).data['authenticated'],
    ).toBe(true);
  });

  it('B7: the cookie is sent again with the new lifetime when the sliding expiry moves', async () => {
    const { bootstrap, call } = setup();
    const { cookie } = await bootstrap();
    advance(5 * MINUTE);
    expect((await call('GET', '/api/auth/status', undefined, cookie)).setCookie).toBeNull();
    advance(20 * DAY);
    const touched = await call('GET', '/api/auth/status', undefined, cookie);
    expect(touched.cookie).toBe(cookie);
    expect(touched.setCookie).toMatch(/Max-Age=2592000/);
    expect(touched.setCookie).toMatch(/HttpOnly/i);
    // Near the 90-day cap the cookie lifetime shrinks to what is left.
    advance(25 * DAY);
    await call('GET', '/api/auth/status', undefined, cookie);
    advance(29 * DAY); // 74 days and 5 minutes after the login
    const capped = await call('GET', '/api/auth/status', undefined, cookie);
    const maxAge = Number(/Max-Age=(\d+)/.exec(capped.setCookie ?? '')?.[1]);
    expect(maxAge).toBe(16 * 86_400 - 5 * 60);
  });

  it('B7: the audit IP hash is an HMAC with the pepper', async () => {
    const run = async (pepper: string) => {
      const ctx = setup({ pepper: Buffer.from(pepper) });
      await ctx.call('POST', '/api/auth/recovery/login', { code: 'AAAA' });
      return ctx.store.recentEvents()[0]?.ipHash;
    };
    const a = await run('pepper-a-0123456789abcdef0123456789');
    const b = await run('pepper-b-0123456789abcdef0123456789');
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
