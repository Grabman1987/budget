import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase } from '@budget/db';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, type AuthGate } from './app';

let app: ReturnType<typeof createApp>;
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'budget-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Budget</title>');
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1);');
  app = createApp({ webDir: dir });
});

describe('server', () => {
  it('answers /health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('reports only a valid full build revision on /health', async () => {
    const revision = 'a'.repeat(40);
    const revisionApp = createApp({ webDir: dir, buildRevision: revision });
    const res = await revisionApp.request('/health');
    expect(await res.json()).toEqual({ status: 'ok', revision });
  });

  it.each([
    'A'.repeat(40),
    'a'.repeat(39),
    'a'.repeat(40) + 'b',
    'a'.repeat(40) + '\n',
    'not-a-revision',
  ])('omits an invalid build revision from /health', async (buildRevision) => {
    const revisionApp = createApp({ webDir: dir, buildRevision });
    const res = await revisionApp.request('/health');
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('sends a strict CSP without unsafe-inline or unsafe-eval', async () => {
    const csp = (await app.request('/health')).headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-(inline|eval)/);
  });

  it('sends HSTS and other security headers', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=\d+/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('switches off camera, microphone, geolocation, payment and USB (Permissions-Policy)', async () => {
    const policy = (await app.request('/health')).headers.get('permissions-policy');
    expect(policy).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  });

  it('serves the web app and falls back to index.html for client routes', async () => {
    const root = await app.request('/');
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('<title>Budget</title>');
    const deep = await app.request('/dev/diagramme');
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain('<title>Budget</title>');
    expect(deep.headers.get('cache-control')).toBe('no-cache');
  });

  it('caches hashed assets immutably', async () => {
    const res = await app.request('/assets/app-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('refuses to mount the ledger API without auth', () => {
    const { db, close } = createTestDatabase();
    // @ts-expect-error -- a ledger without auth does not type-check either
    expect(() => createApp({ webDir: dir, ledger: { db } })).toThrow(/needs auth/);
    close();
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('prevents caching early body-limit, origin and session rejections', async () => {
    const auth: AuthGate = {
      routes: new Hono(),
      requireStepUp: async (_c, next) => next(),
      originGuard: async (c, next) =>
        c.req.method === 'POST' ? c.json({ error: 'origin_rejected' }, 403) : next(),
      requireSession: async (c) => c.json({ error: 'unauthorized' }, 401),
    };
    const guarded = createApp({ webDir: dir, auth });
    for (const [request, status] of [
      [guarded.request('/api/accounts'), 401],
      [guarded.request('/api/accounts', { method: 'POST' }), 403],
      [guarded.request('/api/accounts', { method: 'POST', body: 'x'.repeat(65537) }), 413],
    ] as const) {
      const response = await request;
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect((await guarded.request('/health')).headers.get('cache-control')).toBeNull();
  });

  it('redacts unexpected auth failures from the response and server log', async () => {
    const routes: AuthGate['routes'] = new Hono();
    routes.get('/status', () => {
      throw new Error('synthetic-private-database-path-and-value');
    });
    const auth: AuthGate = {
      routes,
      originGuard: async (_c, next) => next(),
      requireSession: async (_c, next) => next(),
      requireStepUp: async (_c, next) => next(),
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await createApp({ webDir: dir, auth }).request('/api/auth/status');
      expect(response.status).toBe(500);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        error: 'server_error',
        message: 'Something went wrong',
      });
      expect(log.mock.calls).toEqual([['Unhandled server error']]);
    } finally {
      log.mockRestore();
    }
  });
});
