import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-web-'));
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

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});
