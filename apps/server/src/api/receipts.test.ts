/* eslint-disable @typescript-eslint/no-explicit-any -- inspect HTTP JSON boundaries. */
import {
  createBooking,
  createTestDatabase,
  getReceipt,
  schema,
  setAssigned,
  undo,
  type OpenedDatabase,
} from '@budget/db';
import { eq } from 'drizzle-orm';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createApp } from '../app';
import { sha256Hex } from '../auth/crypto';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { digest, RECEIPT_BODY_LIMIT, RECEIPT_LIMIT } from '../receipts/files';
import { PDF, PNG } from '../receipts/testing';

let auth: ReturnType<typeof createAuth>;
const ORIGIN = 'http://localhost:3000',
  token = 'synthetic-receipt-session';
let opened: OpenedDatabase, dir: string, bookingId: string, app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  dir = mkdtempSync(join(tmpdir(), 'budget-receipts-test-'));
  bookingId = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-17',
      amountCents: -1250,
      splits: [{ amountCents: -1250, categoryId: 'essen' }],
    },
    { actor: 'test' },
  );
  const now = new Date('2026-10-02T12:00:00Z'),
    store = new AuthStore(opened.db);
  store.createSession({
    id: sha256Hex(token),
    passkeyId: null,
    now,
    expiresAt: new Date('2026-10-20T12:00:00Z'),
    stepUp: false,
    viaRecovery: true,
  });
  auth = createAuth({
    store,
    clock: () => now,
    config: {
      rpID: 'localhost',
      rpName: 'Budget',
      origin: ORIGIN,
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
    ledger: { db: opened.db, receiptsDir: join(dir, 'receipts'), today: () => '2026-09-17' },
  });
});
afterEach(() => {
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});
const headers = { origin: ORIGIN, cookie: `budget_session=${token}` };
async function call(method: string, path: string, data?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { ...headers, 'content-type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: res.status, body: (await res.json()) as any };
}
async function upload(
  bytes = PNG,
  target: string | null = bookingId,
  name = 'synthetic.png',
  customHeaders: Record<string, string> = headers,
) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name, { type: 'text/html' }));
  if (target) form.set('bookingId', target);
  const res = await app.request('/api/receipts', {
    method: 'POST',
    headers: customHeaders,
    body: form,
  });
  return { status: res.status, body: (await res.json()) as any };
}
describe('authenticated receipts', () => {
  it('rejects a public receipt directory before mounting static hosting', () => {
    expect(() =>
      createApp({
        webDir: dir,
        auth,
        ledger: { db: opened.db, receiptsDir: join(dir, 'receipts') },
      }),
    ).toThrow(/outside the public web directory/);
  });
  it('uploads by magic bytes, safely downloads, shares immutable bytes and supports n:m linkage', async () => {
    const result = await upload(PNG, bookingId, '../../Beleg\r\n.png');
    expect(result.status).toBe(201);
    const r = result.body.receipt;
    expect(r).toMatchObject({
      mime: 'image/png',
      sha256: digest(PNG),
      originalFilename: 'Beleg__.png',
      createdBy: 'owner',
      sizeBytes: PNG.length,
    });
    expect(readFileSync(join(dir, 'receipts', r.sha256))).toEqual(PNG);
    expect(readdirSync(join(dir, 'receipts'))).toEqual([r.sha256]);
    expect((await upload()).status).toBe(201);
    expect(readdirSync(join(dir, 'receipts'))).toHaveLength(1);
    const downloaded = await app.request(`/api/receipts/${r.id}/download`, { headers });
    expect(downloaded.headers.get('content-type')).toBe('application/octet-stream');
    expect(downloaded.headers.get('content-disposition')).toContain('attachment;');
    expect(downloaded.headers.get('x-content-type-options')).toBe('nosniff');
    expect(downloaded.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(PNG);
    expect(
      (await app.request(`/api/receipts/${r.id}/preview`, { headers })).headers.get('content-type'),
    ).toBe('image/png');
    const other = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-17',
        amountCents: -500,
        splits: [{ amountCents: -500, categoryId: 'essen' }],
      },
      { actor: 'test' },
    );
    expect((await call('POST', `/receipts/${r.id}/links`, { bookingId: other })).status).toBe(200);
    expect((await call('GET', `/receipts?bookingId=${other}`)).body.receipts).toHaveLength(1);
    expect((await upload(PDF, null, 'synthetic.pdf')).status).toBe(201);
  });
  it('unlinks into the inbox, undoes/redoes and retains links across split edits and booking deletion', async () => {
    setAssigned(opened.db, 'essen', '2026-09', 1250, { actor: 'test' });
    const result = await upload(),
      id = result.body.receipt.id;
    const detached = await call('DELETE', `/receipts/${id}/links/${bookingId}`);
    expect((await call('GET', '/receipts')).body.receipts.map((r: any) => r.id)).toEqual([id]);
    expect((await call('GET', '/inbox/count')).body.count).toBe(1);
    expect((await call('GET', '/inbox')).body.count).toBe(1);
    const reversed = await call('POST', '/undo', { groupId: detached.body.groupId });
    expect((await call('GET', '/receipts')).body.receipts).toHaveLength(0);
    await call('POST', '/undo', { groupId: reversed.body.groupId });
    const linked = await call('POST', `/receipts/${id}/links`, { bookingId });
    expect(linked.status).toBe(200);
    expect(
      (
        await call('PATCH', `/bookings/${bookingId}`, {
          splits: [
            { amountCents: -600, categoryId: 'essen' },
            { amountCents: -650, categoryId: 'essen' },
          ],
        })
      ).status,
    ).toBe(200);
    expect((await call('GET', `/receipts?bookingId=${bookingId}`)).body.receipts).toHaveLength(1);
    const removed = await call('DELETE', `/bookings/${bookingId}`);
    expect((await call('GET', '/receipts')).body.receipts).toHaveLength(1);
    expect((await call('POST', '/undo', { groupId: removed.body.groupId })).status).toBe(200);
    expect((await call('GET', '/receipts')).body.receipts).toHaveLength(0);
  });
  it('keeps blobs for upload/remove undo and refuses partial/forced removal with a later live link', async () => {
    const result = await upload(PDF, null, 'synthetic.pdf'),
      id = result.body.receipt.id;
    const linked = await call('POST', `/receipts/${id}/links`, { bookingId });
    const entry = opened.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.groupId, result.body.groupId))
      .all()
      .find((e) => e.entityType === 'receipt')!;
    expect(() =>
      undo(opened.db, { auditId: entry.id }, { actor: 'test' }, { force: true }),
    ).toThrow(/still linked/);
    expect(getReceipt(opened.db, id).deletedAt).toBeNull();
    await call('POST', '/undo', { groupId: linked.body.groupId });
    const deleted = await call('DELETE', `/receipts/${id}`);
    expect(deleted.status).toBe(200);
    expect((await app.request(`/api/receipts/${id}/download`, { headers })).status).toBe(404);
    expect((await call('POST', '/undo', { groupId: deleted.body.groupId })).status).toBe(200);
    expect((await app.request(`/api/receipts/${id}/download`, { headers })).status).toBe(200);
    expect((await app.request(`/api/receipts/${id}/preview`, { headers })).status).toBe(404);
  });
  it('enforces session, origin, size, allowlist and atomic refusal before metadata/audit creation', async () => {
    expect((await upload(PNG, bookingId, 'x.png', { origin: ORIGIN })).status).toBe(401);
    expect(
      (await upload(PNG, bookingId, 'x.png', { ...headers, origin: 'https://foreign.invalid' }))
        .status,
    ).toBe(403);
    expect(
      (await upload(PNG, bookingId, 'x.png', { cookie: headers.cookie } as typeof headers)).status,
    ).toBe(403);
    expect((await upload(Buffer.from('<svg/>'))).status).toBe(400);
    expect((await upload(PNG.subarray(0, 40))).status).toBe(400);
    expect((await upload(Buffer.alloc(RECEIPT_LIMIT + 1))).status).toBe(413);
    const huge = await app.request('/api/receipts', {
      method: 'POST',
      headers,
      body: new Uint8Array(RECEIPT_BODY_LIMIT + 1),
    });
    expect(huge.status).toBe(413);
    const audits = opened.db.select().from(schema.auditLog).all().length;
    expect((await upload(PNG, 'missing')).status).toBe(404);
    expect(opened.db.select().from(schema.receipt).all()).toHaveLength(0);
    expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(audits);
    expect((await app.request('/api/receipts', { headers: {} })).status).toBe(401);
  });
  it('refuses damaged storage and traversal and does not read unknown files', async () => {
    const result = await upload(),
      r = result.body.receipt;
    writeFileSync(join(dir, 'receipts', r.sha256), Buffer.alloc(PNG.length));
    expect((await app.request(`/api/receipts/${r.id}/download`, { headers })).status).toBe(404);
    expect(
      (await call('POST', `/receipts/${r.id}/links`, { bookingId: 'missing', extra: 1 })).status,
    ).toBe(400);
    expect((await app.request('/api/receipts/not-a-uuid/download', { headers })).status).toBe(400);
  });
});
