import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { createApp } from '../app';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { sha256Hex } from '../auth/crypto';
import { syntheticPayslipPdf } from '../payslips/testing';

let opened: OpenedDatabase, dir: string, app: ReturnType<typeof createApp>;
const origin = 'http://localhost:3000',
  token = 'synthetic-payslip-session';
const headers = { origin, cookie: `budget_session=${token}` };
beforeEach(() => {
  vi.stubEnv('PAYSLIP_PDF_PASSWORD', 'synthetic-pdf-password');
  vi.stubEnv('DROPBOX_PAYSLIP_ROOT', '');
  opened = createTestDatabase();
  dir = mkdtempSync(join(tmpdir(), 'budget-intake-api-'));
  const store = new AuthStore(opened.db),
    now = new Date('2026-10-03T12:00:00Z');
  store.createSession({
    id: sha256Hex(token),
    passkeyId: null,
    now,
    expiresAt: new Date('2026-10-20T12:00:00Z'),
    stepUp: false,
    viaRecovery: true,
  });
  const auth = createAuth({
    store,
    clock: () => now,
    config: {
      rpID: 'localhost',
      rpName: 'Budget',
      origin,
      cookieSecure: false,
      setupToken: undefined,
      trustProxy: false,
      sessionDays: 30,
      sessionMaxDays: 90,
      stepUpMinutes: 5,
      pepper: Buffer.from('synthetic-pepper-0123456789abcdef'),
    },
  });
  app = createApp({
    webDir: join(dir, 'web'),
    auth,
    ledger: { db: opened.db, receiptsDir: join(dir, 'receipts') },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});
async function upload(customHeaders = headers) {
  const form = new FormData();
  form.set(
    'file',
    new File([new Uint8Array(await syntheticPayslipPdf())], 'synthetic-202609.pdf', {
      type: 'application/pdf',
    }),
  );
  return app.request('/api/payslip-intake/upload', {
    method: 'POST',
    body: form,
    headers: customHeaders,
  });
}
describe('authenticated payslip intake HTTP boundary', () => {
  it('requires session and origin and admits PDF multipart bodies', async () => {
    expect((await upload({ origin, cookie: '' })).status).toBe(401);
    expect(
      (await upload({ origin: 'https://synthetic-other.invalid', cookie: headers.cookie })).status,
    ).toBe(403);
    const response = await upload();
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const result = (await response.json()) as { id: string };
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    expect(opened.db.select().from(schema.payslip).all()).toHaveLength(0);
    const read = await app.request(`/api/payslip-intake/${result.id}`, { headers });
    expect(read.status).toBe(200);
    const decision = await app.request(`/api/payslip-intake/${result.id}/decision`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', bookingId: null }),
    });
    expect(decision.status).toBe(200);
    expect(opened.db.select().from(schema.payslip).all()).toHaveLength(1);
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    const saved = (await decision.json()) as { groupId: string };
    const undone = await app.request('/api/undo', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ groupId: saved.groupId }),
    });
    expect(undone.status).toBe(200);
  });
  it('reports only secret presence and refuses secret/config injection', async () => {
    const response = await app.request('/api/payslip-intake/status', { headers });
    const body = await response.text();
    expect(body).toContain('"passwordSet":true');
    expect(body).not.toContain('synthetic-pdf-password');
    const bad = await app.request('/api/payslip-intake/config', {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        salaryAccountId: null,
        wageTypes: {},
        password: 'synthetic-injection',
      }),
    });
    expect(bad.status).toBe(400);
    expect(opened.db.select().from(schema.appSetting).all()).toEqual([]);
  });
  it('rejects multiple files and non-PDF content before staging', async () => {
    const body = new FormData();
    body.append('file', new File(['synthetic invalid'], 'fake.pdf'));
    const response = await app.request('/api/payslip-intake/upload', {
      method: 'POST',
      headers,
      body,
    });
    expect(response.status).toBe(400);
    expect(opened.db.select().from(schema.payslipIntake).all()).toHaveLength(0);
  });
});
