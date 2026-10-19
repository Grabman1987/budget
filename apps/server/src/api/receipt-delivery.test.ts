import {
  accountSummaries,
  createBooking,
  createTestDatabase,
  getReceipt,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createApp } from '../app';
import { sha256Hex } from '../auth/crypto';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { PDF, PNG } from '../receipts/testing';

const ORIGIN = 'http://localhost:3000';
const TOKEN = 'synthetic-upload-delivery-session';
const KEY = 'synthetic-physical-upload-0001';
const PNG_HASH = '3fd24bcfdb17a6027c5f3ed896d17a020d6ff9d9e4d06362461a9b44b6ac1b52';
let opened: OpenedDatabase;
let folder: string;
let app: ReturnType<typeof createApp>;
let bookingId: string;
interface UploadReply {
  receipt: { id: string; sha256: string; sizeBytes: number; deletedAt: string | null };
  groupId: string;
}
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  folder = mkdtempSync(join(tmpdir(), 'budget-upload-delivery-'));
  bookingId = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-19',
      amountCents: -1375,
      splits: [
        { amountCents: -1000, categoryId: 'essen' },
        { amountCents: -375, categoryId: 'miete' },
      ],
    },
    { actor: 'synthetic-owner' },
  );
  const now = new Date('2026-10-19T09:00:00Z');
  const store = new AuthStore(opened.db);
  // Real cookie/session/origin middleware with a disposable known session. No new WebAuthn claim.
  store.createSession({
    id: sha256Hex(TOKEN),
    passkeyId: null,
    now,
    expiresAt: new Date('2026-11-19T09:00:00Z'),
    stepUp: false,
    viaRecovery: true,
  });
  const auth = createAuth({
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
    webDir: join(folder, 'web'),
    auth,
    ledger: { db: opened.db, receiptsDir: join(folder, 'receipts'), today: () => '2026-10-19' },
  });
});
afterEach(() => {
  opened.close();
  rmSync(folder, { recursive: true, force: true });
});
const headers = { origin: ORIGIN, cookie: `budget_session=${TOKEN}` };
interface UploadOptions {
  key?: string | null;
  bytes?: Buffer;
  name?: string;
  target?: string | null;
  marker?: string | File;
  duplicateMarker?: boolean;
  requestHeaders?: Record<string, string>;
}
async function upload(options: UploadOptions = {}) {
  const { key = KEY, bytes = PNG, name = 'synthetic.png', target = bookingId } = options;
  const body = new FormData();
  body.set('file', new File([new Uint8Array(bytes)], name, { type: 'text/html' }));
  if (target !== null) body.set('bookingId', target);
  if (options.marker !== undefined) body.set('uploadIntent', options.marker);
  if (options.duplicateMarker) body.append('uploadIntent', KEY);
  const response = await app.request('/api/receipts', {
    method: 'POST',
    headers: {
      ...headers,
      ...(key !== null ? { 'Idempotency-Key': key } : {}),
      ...options.requestHeaders,
    },
    body,
  });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  return { status: response.status, data: (await response.json()) as UploadReply };
}
function financialState() {
  return Object.fromEntries(
    [
      'booking',
      'booking_split',
      'payee',
      'receipt',
      'booking_receipt',
      'audit_log',
      'receipt_delivery',
    ].map((table) => [
      table,
      opened.sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),
    ]),
  );
}
async function undoGroup(groupId: string) {
  const response = await app.request('/api/undo', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { groupId: string };
}

const balance = () =>
  accountSummaries(opened.db, '2026-10-19').find((a) => a.id === 'giro')!.balanceCents;

describe('physical upload intent delivery (#698)', () => {
  it('returns one original physical receipt and link after two lost acknowledgments without another audit action', async () => {
    const first = await upload(); // The client is assumed not to receive this committed reply.
    expect(first.status).toBe(201);
    const audits = opened.db.select().from(schema.auditLog).all();
    expect(await upload()).toEqual(first); // Lose this reply as well; same intent is still uncertain.
    expect(await upload()).toEqual(first);
    expect(opened.db.select().from(schema.receipt).all()).toHaveLength(1);
    expect(opened.db.select().from(schema.bookingReceipt).all()).toHaveLength(1);
    expect(opened.db.select().from(schema.auditLog).all()).toEqual(audits);
    expect(first.data.receipt).toMatchObject({ sha256: PNG_HASH, sizeBytes: 68 });
    expect(readdirSync(join(folder, 'receipts'))).toEqual([PNG_HASH]);
    expect(readFileSync(join(folder, 'receipts', PNG_HASH))).toEqual(PNG);
    expect(getReceipt(opened.db, first.data.receipt.id).deletedAt).toBeNull();
    expect(balance()).toBe(98625);
  });

  it('deduplicates concurrent requests while two deliberate identical-byte uploads remain separate actions', async () => {
    const replies = await Promise.all([
      upload({ marker: KEY }),
      upload({ marker: KEY }),
      upload({ marker: KEY }),
    ]);
    expect(replies[0]!.status).toBe(201);
    expect(replies).toEqual([replies[0], replies[0], replies[0]]);
    const second = await upload({
      key: 'synthetic-physical-upload-0002',
      marker: 'synthetic-physical-upload-0002',
    });
    expect(second.status).toBe(201);
    expect(second.data.receipt.id).not.toBe(replies[0]!.data.receipt.id);
    expect(second.data.groupId).not.toBe(replies[0]!.data.groupId);
    expect(opened.db.select().from(schema.receipt).all()).toHaveLength(2);
    expect(opened.db.select().from(schema.bookingReceipt).all()).toHaveLength(2);
    expect(opened.db.select().from(schema.receiptDelivery).all()).toHaveLength(2);
    const audits = opened.db
      .select()
      .from(schema.auditLog)
      .all()
      .filter((a) => a.groupId === second.data.groupId);
    expect(audits.map((a) => a.entityType).sort()).toEqual(['booking_receipt', 'receipt']);
    expect(readdirSync(join(folder, 'receipts'))).toEqual([PNG_HASH]);
    expect(balance()).toBe(98625);
  });

  it('strips synthetic image metadata but binds the raw original bytes to an intent', async () => {
    // Valid PNG tEXt chunk (fixed CRC); both uploads store the same 68-byte image.
    const metadata = Buffer.from('0000000f7445587453796e746865746963006669727374eb3248ac', 'hex');
    const withMetadata = Buffer.concat([PNG.subarray(0, -12), metadata, PNG.subarray(-12)]);
    const first = await upload({ bytes: withMetadata, marker: KEY });
    expect(first.status).toBe(201);
    expect(readFileSync(join(folder, 'receipts', PNG_HASH))).toEqual(PNG);
    expect(first.data.receipt).toMatchObject({ sha256: PNG_HASH, sizeBytes: 68 });
    const before = financialState();
    expect((await upload({ marker: KEY })).status).toBe(409);
    expect(financialState()).toEqual(before);
    expect(await upload({ bytes: withMetadata, marker: KEY })).toEqual(first);
  });

  it('keeps an acknowledged intent after deletion of the booking and never recreates its booking or link', async () => {
    const first = await upload({ marker: KEY });
    const removed = await app.request(`/api/bookings/${bookingId}`, { method: 'DELETE', headers });
    expect(removed.status).toBe(200);
    const deleted = financialState();
    expect(balance()).toBe(100000);
    expect(await upload({ marker: KEY })).toEqual(first);
    expect(financialState()).toEqual(deleted);
    expect(balance()).toBe(100000);
  });

  it('validates a new target and existing magic-byte/size limits before any file or financial write', async () => {
    const before = financialState();
    expect((await upload({ target: 'missing-booking' })).status).toBe(404);
    expect((await upload({ bytes: Buffer.from('<html>synthetic</html>') })).status).toBe(400);
    expect((await upload({ bytes: Buffer.alloc(15 * 1024 * 1024 + 1) })).status).toBe(413);
    expect(financialState()).toEqual(before);
    expect(readdirSync(folder)).toEqual([]);
  });

  it('preserves independent metadata actions for legacy uploads without a key', async () => {
    const first = await upload({ key: null });
    const second = await upload({ key: null });
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.data.receipt.id).not.toBe(first.data.receipt.id);
    expect(second.data.groupId).not.toBe(first.data.groupId);
    expect(opened.db.select().from(schema.receiptDelivery).all()).toEqual([]);
    expect(opened.db.select().from(schema.receipt).all()).toHaveLength(2);
    expect(opened.db.select().from(schema.bookingReceipt).all()).toHaveLength(2);
    expect(readdirSync(join(folder, 'receipts'))).toEqual([PNG_HASH]);
  });

  it.each([
    { bytes: PDF },
    { name: 'different.pdf' },
    { target: null },
    { target: 'unknown-booking' },
  ])(
    'rejects reuse with changed raw content, sanitized filename or destination before storing new bytes: %j',
    async (changed) => {
      await upload();
      const before = financialState();
      const rejected = await upload(changed);
      expect(rejected.status).toBe(409);
      expect(rejected.data).toMatchObject({ error: 'idempotency_conflict' });
      expect(financialState()).toEqual(before);
      expect(readdirSync(join(folder, 'receipts'))).toEqual([PNG_HASH]);
      expect(balance()).toBe(98625);
    },
  );

  it('uses the sanitized filename and signature MIME in its stable intent, not browser MIME or path components', async () => {
    const first = await upload({ name: 'a/synthetic.png' });
    expect(await upload({ name: 'b/synthetic.png', marker: KEY })).toEqual(first);
    expect(first.data.receipt).toMatchObject({
      mime: 'image/png',
      originalFilename: 'synthetic.png',
    });
  });

  it.each([
    { marker: 'different-intent-0001' },
    { key: null, marker: KEY },
    { marker: KEY, duplicateMarker: true },
    { marker: new File(['synthetic'], 'intent.txt') },
    { key: 'short' },
    { key: 'a'.repeat(81) },
    { key: 'invalid/key-000000000' },
  ])(
    'rejects malformed or downgrade-unsafe intent metadata without any file/financial write: %j',
    async (options) => {
      const before = financialState();
      expect((await upload(options)).status).toBe(400);
      expect(financialState()).toEqual(before);
      expect(readdirSync(folder)).toEqual([]);
    },
  );

  it.each(['receipt_delivery', 'booking_receipt'])(
    'atomically rolls back metadata, link, audit and intent when %s insertion fails; existing booking survives retry',
    async (table) => {
      const before = financialState();
      opened.sqlite.exec(
        `CREATE TRIGGER synthetic_fail BEFORE INSERT ON "${table}" BEGIN SELECT RAISE(ABORT, 'synthetic late upload failure'); END`,
      );
      expect((await upload({ marker: KEY })).status).toBe(422);
      expect(financialState()).toEqual(before);
      expect(balance()).toBe(98625);
      // The pre-existing immutable-byte publication policy retains an orphan on DB failure.
      expect(readdirSync(join(folder, 'receipts'))).toEqual([PNG_HASH]);
      expect(readFileSync(join(folder, 'receipts', PNG_HASH))).toEqual(PNG);
      opened.sqlite.exec('DROP TRIGGER synthetic_fail');
      const retry = await upload({ marker: KEY });
      expect(retry.status).toBe(201);
      expect(opened.db.select().from(schema.receipt).all()).toHaveLength(1);
      expect(opened.db.select().from(schema.bookingReceipt).all()).toHaveLength(1);
      expect(opened.db.select().from(schema.receiptDelivery).all()).toHaveLength(1);
      expect(balance()).toBe(98625);
    },
  );

  it('acknowledges a cached upload after undo without resurrecting its physical metadata or link; redo stays explicit', async () => {
    const first = await upload({ marker: KEY });
    const reversed = await undoGroup(first.data.groupId);
    const undone = financialState();
    expect(opened.db.select().from(schema.receipt).get()!.deletedAt).not.toBeNull();
    expect(opened.db.select().from(schema.bookingReceipt).get()!.deletedAt).not.toBeNull();
    expect(await upload({ marker: KEY })).toEqual(first);
    expect(financialState()).toEqual(undone);
    await undoGroup(reversed.groupId);
    expect(getReceipt(opened.db, first.data.receipt.id).deletedAt).toBeNull();
    expect(opened.db.select().from(schema.bookingReceipt).get()!.deletedAt).toBeNull();
    expect(opened.db.select().from(schema.receiptDelivery).all()).toHaveLength(1);
    expect(readFileSync(join(folder, 'receipts', PNG_HASH))).toEqual(PNG);
    expect(balance()).toBe(98625);
  });

  it.each([{ cookie: '' }, { origin: 'https://synthetic-invalid.example' }])(
    'does not expose an existing cached reply through missing session or foreign origin: %j',
    async (requestHeaders) => {
      await upload();
      const before = financialState();
      const rejected = await upload({ requestHeaders });
      expect([401, 403]).toContain(rejected.status);
      expect(rejected.data).not.toHaveProperty('receipt');
      expect(financialState()).toEqual(before);
    },
  );
});
