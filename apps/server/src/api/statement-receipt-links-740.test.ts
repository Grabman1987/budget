import {
  createTestDatabase,
  createBooking,
  updateBooking,
  stageStatementIntake,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import {
  parseStatementText,
  type StatementReceiptLinksPage,
  type StatementIntakeView,
} from '@budget/domain';
import { sql } from 'drizzle-orm';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createApp } from '../app';
import { sha256Hex } from '../auth/crypto';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { syntheticColumnarPayslipPdf } from '../payslips/testing';
import { digest } from '../receipts/files';
import * as statementService from '../statements/service';

const origin = 'http://localhost:3000',
  token = 'synthetic-links-session';
const headers = { origin, cookie: `budget_session=${token}`, 'content-type': 'application/json' };
const ctx = { actor: 'synthetic-links-api-740' };
let opened: OpenedDatabase,
  dir: string,
  app: ReturnType<typeof createApp>,
  source: StatementIntakeView,
  bytes: Buffer;
let ids: string[];
beforeEach(async () => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  dir = mkdtempSync(join(tmpdir(), 'budget-links-740-'));
  const now = new Date('2026-10-20T12:00:00Z'),
    store = new AuthStore(opened.db);
  store.createSession({
    id: sha256Hex(token),
    passkeyId: null,
    now,
    expiresAt: new Date('2026-11-20T12:00:00Z'),
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
    ledger: { db: opened.db, receiptsDir: join(dir, 'receipts'), today: () => '2026-10-20' },
  });
  bytes = await syntheticColumnarPayslipPdf([[{ x: 40, text: 'Synthetic statement 740' }]], '');
  const sha256 = digest(bytes);
  mkdirSync(join(dir, 'receipts'));
  writeFileSync(join(dir, 'receipts', sha256), bytes);
  source = stageStatementIntake(
    opened.db,
    {
      accountId: 'giro',
      sha256,
      sizeBytes: bytes.length,
      filename: 'synthetic-740.pdf',
      proposal: parseStatementText(
        'Rechnungsdatum 01.10.2026\nAbrechnungsbetrag 120,00 EUR',
        sha256,
      ),
    },
    ctx,
  ).intake;
  ids = [-1251, 501].map((amountCents) =>
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-17',
        amountCents,
        memo: 'Synthetic booking',
        splits: [{ amountCents, categoryId: 'essen' }],
      },
      ctx,
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});
const path = () => `/api/statement-intake/${source.id}/booking-links`;
const snapshot = () =>
  JSON.stringify(
    [
      schema.account,
      schema.booking,
      schema.bookingSplit,
      schema.transfer,
      schema.expectedPayment,
      schema.expectedPaymentVersion,
    ].map((table) => opened.db.all(sql`SELECT * FROM ${table} ORDER BY rowid`)),
  );
const writes = () =>
  JSON.stringify(
    [schema.auditLog, schema.bookingReceipt].map((table) =>
      opened.db.all(sql`SELECT * FROM ${table} ORDER BY rowid`),
    ),
  );
const read = async () => {
  const response = await app.request(path(), { headers });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return (await response.json()) as StatementReceiptLinksPage;
};
const body = (page: StatementReceiptLinksPage) => ({
  sourceCas: {
    revision: page.source.revision,
    sha256: page.source.sha256,
    accountId: page.source.accountId,
  },
  linksRevision: page.linksRevision,
  attach: page.items.map((row) => ({
    bookingId: row.bookingId,
    bookingRevision: row.bookingRevision,
  })),
  detach: [],
});
const post = (data: unknown, auth = headers) =>
  app.request(path(), { method: 'POST', headers: auth, body: JSON.stringify(data) });

it('serves authenticated original bytes, links once, rejects replay, and supports real API group undo/redo', async () => {
  const page = await read(),
    before = snapshot();
  expect(page.items.map((row) => row.amountCents).sort((a, b) => a - b)).toEqual([-1251, 501]);
  const download = await app.request(`/api/receipts/${source.receiptId}/download`, { headers });
  expect(download.status).toBe(200);
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  const result = await post(body(page));
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('no-store');
  const saved = (await result.json()) as { groupId: string; changedCount: number };
  expect(saved.changedCount).toBe(2);
  expect((await read()).attached.map((row) => row.bookingId).sort()).toEqual([...ids].sort());
  const afterWrite = writes();
  expect((await post(body(page))).status).toBe(409);
  expect(writes()).toBe(afterWrite);
  const undo = await app.request('/api/undo', {
    method: 'POST',
    headers,
    body: JSON.stringify({ groupId: saved.groupId }),
  });
  expect(undo.status).toBe(200);
  expect((await read()).attached).toEqual([]);
  const reversed = (await undo.json()) as { groupId: string };
  expect(
    (
      await app.request('/api/undo', {
        method: 'POST',
        headers,
        body: JSON.stringify({ groupId: reversed.groupId }),
      })
    ).status,
  ).toBe(200);
  expect((await read()).attached.map((row) => row.bookingId).sort()).toEqual([...ids].sort());
  expect(snapshot()).toBe(before);
  expect(opened.db.select().from(schema.receipt).all()).toHaveLength(1);
});

it('requires a session and trusted origin without audit or financial changes', async () => {
  const request = body(await read()),
    before = writes(),
    financial = snapshot();
  expect((await app.request(path())).status).toBe(401);
  expect((await post(request, { ...headers, cookie: '' })).status).toBe(401);
  expect((await post(request, { ...headers, origin: 'https://untrusted.invalid' })).status).toBe(
    403,
  );
  expect(writes()).toBe(before);
  expect(snapshot()).toBe(financial);
});

it.each(['missing', 'same-size-corruption'] as const)(
  'rejects %s original on GET and POST',
  async (kind) => {
    const request = body(await read()),
      before = writes();
    const file = join(dir, 'receipts', source.sha256);
    if (kind === 'missing') rmSync(file);
    else {
      const corrupted = Buffer.from(bytes);
      corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 1;
      writeFileSync(file, corrupted);
    }
    expect((await app.request(path(), { headers })).status).toBe(409);
    expect((await post(request)).status).toBe(409);
    expect(writes()).toBe(before);
  },
);

it('rechecks every selected booking after asynchronous original-file verification', async () => {
  const request = body(await read()),
    original = statementService.readStatementSource;
  let afterConcurrentWrite = '';
  vi.spyOn(statementService, 'readStatementSource').mockImplementationOnce(async (...args) => {
    const content = await original(...args);
    updateBooking(opened.db, ids[1]!, { memo: 'Concurrent change during file read' }, ctx);
    afterConcurrentWrite = writes();
    return content;
  });
  expect((await post(request)).status).toBe(409);
  expect(writes()).toBe(afterConcurrentWrite);
  expect((await read()).attached).toEqual([]);
});

it('strictly validates bounded queries and request bodies before writing', async () => {
  const request = body(await read()),
    before = writes();
  for (const query of [
    'limit=101',
    'offset=-1',
    'attachedOffset=100001',
    'q=' + 'x'.repeat(201),
    'unknown=1',
  ])
    expect((await app.request(path() + '?' + query, { headers })).status).toBe(400);
  for (const data of [
    { ...request, unknown: true },
    { ...request, attach: [{ bookingId: ids[0], bookingRevision: 'invalid' }] },
    { ...request, detach: Array.from({ length: 101 }, () => request.attach[0]) },
  ])
    expect((await post(data)).status).toBe(400);
  expect(writes()).toBe(before);
});
