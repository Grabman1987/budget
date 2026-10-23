import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  accounts,
  createEntity,
  createTestDatabase,
  getBooking,
  getPayslipIntake,
  replaceParsedPayslip,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import type { PayslipAutomationOutcome } from '@budget/domain';
import { createApp } from '../app';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { sha256Hex } from '../auth/crypto';
import { syntheticPayslipPdf, syntheticWageRows } from '../payslips/testing';
import * as receiptFiles from '../receipts/files';

const ACCOUNT = '74100000-0000-4000-8000-000000000601';
const EMPLOYER = '74100000-0000-4000-8000-000000000602';
const origin = 'http://localhost:3000',
  token = 'synthetic-payroll-automation-session';
const headers = { origin, cookie: `budget_session=${token}` };
let opened: OpenedDatabase, dir: string, app: ReturnType<typeof createApp>;
type Upload = { id: string; duplicate: boolean; automation?: PayslipAutomationOutcome };
beforeEach(() => {
  vi.stubEnv('DROPBOX_PAYSLIP_ROOT', '');
  vi.stubEnv('DROPBOX_PAYSLIP_WRITE', '0');
  vi.stubEnv('PAYSLIP_PDF_PASSWORD', '');
  opened = createTestDatabase();
  const ctx = { actor: 'synthetic-payroll-api-fixture' };
  accounts.create(
    opened.db,
    {
      id: ACCOUNT,
      name: 'Synthetic payroll account',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2025-01-01',
      openingBalanceCents: 50000,
    },
    ctx,
  );
  createEntity(opened.db, schema.payee, { id: EMPLOYER, name: 'Synthetic payroll sender' }, ctx);
  dir = mkdtempSync(join(tmpdir(), 'synthetic-payroll-api-741-'));
  const now = new Date('2026-10-03T12:00:00Z'),
    store = new AuthStore(opened.db);
  store.createSession({
    id: sha256Hex(token),
    passkeyId: null,
    now,
    expiresAt: new Date('2026-11-01T12:00:00Z'),
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
      pepper: Buffer.from('synthetic-payroll-pepper-0123456789abcdef'),
    },
  });
  app = createApp({
    webDir: join(dir, 'web'),
    auth,
    ledger: { db: opened.db, receiptsDir: join(dir, 'receipts'), today: () => '2026-10-03' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});
const json = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { ...headers, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function configure() {
  const response = await json('PUT', '/api/payslip-intake/config', {
    salaryAccountId: ACCOUNT,
    automation: { payeeId: EMPLOYER },
    wageTypes: {},
  });
  expect(response.status).toBe(200);
}
async function upload(bytes: Buffer, automatic = true, requestHeaders = headers) {
  const form = new FormData();
  form.set(
    'file',
    new File([new Uint8Array(bytes)], 'synthetic-payroll-741.pdf', { type: 'application/pdf' }),
  );
  if (automatic) form.set('automation', 'eligible');
  return app.request('/api/payslip-intake/upload', {
    method: 'POST',
    headers: requestHeaders,
    body: form,
  });
}
const snapshot = () =>
  JSON.stringify(
    (
      opened.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'auth_%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map(({ name }) => [
      name,
      opened.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    ]),
  );

it.each(['identical', 'different'] as const)(
  'does not duplicate a payout when concurrent uploads have %s source bytes',
  async (variant) => {
    await configure();
    const pdf = await syntheticPayslipPdf(syntheticWageRows, '');
    const originals = [
      pdf,
      variant === 'identical' ? pdf : Buffer.concat([pdf, Buffer.from('\n% synthetic variant\n')]),
    ];
    const store = receiptFiles.storeReceipt;
    let arrivals = 0;
    let release!: () => void;
    const bothStored = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Both actual PDF workers and immutable file writes finish before either request stages.
    vi.spyOn(receiptFiles, 'storeReceipt').mockImplementation(async (...args) => {
      const stored = await store(...args);
      if (++arrivals === 2) release();
      await bothStored;
      return stored;
    });
    const responses = await Promise.all(originals.map((bytes) => upload(bytes)));
    expect(arrivals).toBe(2);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const results = await Promise.all(
      responses.map((response) => response.json() as Promise<Upload>),
    );
    const booked = results.filter((result) => result.automation?.status === 'booked');
    expect(booked).toHaveLength(1);
    expect(results.filter((result) => result.automation?.groupId)).toHaveLength(1);
    expect(new Set(results.map((result) => result.id)).size).toBe(variant === 'identical' ? 1 : 2);
    expect(
      results.find((result) => result.automation?.status !== 'booked')!.automation,
    ).toMatchObject(
      variant === 'identical'
        ? { status: 'unchanged', reason: 'duplicate_source', groupId: null }
        : { status: 'pruefen', reason: 'payroll_already_exists', groupId: null },
    );
    const payout = getBooking(opened.db, booked[0]!.automation!.bookingId!)!;
    expect(opened.sqlite.prepare('SELECT id FROM booking WHERE deleted_at IS NULL').all()).toEqual([
      { id: payout.id },
    ]);
    expect(
      opened.sqlite.prepare('SELECT id FROM payslip WHERE deleted_at IS NULL').all(),
    ).toHaveLength(1);
    expect(payout).toMatchObject({
      accountId: ACCOUNT,
      payeeId: EMPLOYER,
      date: '2026-09-30',
      amountCents: 297500,
      status: 'pending',
    });
    expect(payout.splits).toMatchObject([
      { amountCents: 287500, incomeTypeId: 'income-salary' },
      { amountCents: 10000, incomeTypeId: 'income-refund' },
    ]);
    for (const [index, result] of results.entries()) {
      const source = getPayslipIntake(opened.db, result.id);
      const download = await app.request(`/api/receipts/${source.receiptId}/download`, { headers });
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer()).equals(originals[index]!)).toBe(true);
    }
  },
);

it('refuses reanalysis of an automatically consumed source without changing its records or history', async () => {
  await configure();
  const response = await upload(await syntheticPayslipPdf(syntheticWageRows, ''));
  expect(response.status).toBe(201);
  const result = (await response.json()) as Upload;
  expect(result.automation?.status).toBe('booked');
  const before = snapshot();
  expect((await json('POST', `/api/payslip-intake/${result.id}/retry`, {})).status).toBe(409);
  expect(snapshot()).toBe(before);
});

it('detects a real source-parse ABA across retained-file verification before financial writes', async () => {
  await configure();
  const verify = receiptFiles.verifyReceiptFile;
  let changed = false,
    afterChange = '';
  vi.spyOn(receiptFiles, 'verifyReceiptFile').mockImplementation(async (...args) => {
    const path = await verify(...args);
    if (!changed) {
      changed = true;
      const row = opened.sqlite
        .prepare('SELECT id FROM payslip_intake WHERE sha256 = ?')
        .get(args[1]) as { id: string };
      const source = getPayslipIntake(opened.db, row.id);
      replaceParsedPayslip(
        opened.db,
        row.id,
        { ...source.parsed, warnings: [...source.parsed.warnings, 'Synthetic concurrent parse'] },
        { actor: 'synthetic-reparse' },
      );
      replaceParsedPayslip(opened.db, row.id, source.parsed, { actor: 'synthetic-reparse' });
      afterChange = snapshot();
    }
    return path;
  });
  const response = await upload(await syntheticPayslipPdf(syntheticWageRows, ''));
  expect(changed).toBe(true);
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    automation: { status: 'pruefen', reason: 'source_changed', groupId: null },
  });
  expect(snapshot()).toBe(afterChange);
  expect(opened.sqlite.prepare('SELECT id FROM booking').all()).toEqual([]);
});

it('uses the actual authenticated PDF worker, persists the exact payout link across GET, and never rebooks after Undo', async () => {
  await configure();
  const pdf = await syntheticPayslipPdf(syntheticWageRows, ''),
    response = await upload(pdf);
  expect(response.status).toBe(201);
  const body = (await response.json()) as Upload;
  expect(body.automation).toMatchObject({ status: 'booked', reason: 'unambiguous_source' });
  const booking = getBooking(opened.db, body.automation!.bookingId!)!;
  expect(booking).toMatchObject({
    accountId: ACCOUNT,
    amountCents: 297500,
    date: '2026-09-30',
    status: 'pending',
    payeeId: EMPLOYER,
  });
  expect(booking.splits).toMatchObject([
    { amountCents: 287500, incomeTypeId: 'income-salary' },
    { amountCents: 10000, incomeTypeId: 'income-refund' },
  ]);
  const read = async () => {
    const reply = await json('GET', `/api/payslip-intake/${body.id}`);
    expect(reply.status).toBe(200);
    return reply.json() as Promise<{
      status: string;
      receiptId: string;
      payout: { payslipId: string; bookingId: string; accountId: string } | null;
    }>;
  };
  const current = await read();
  expect(current).toMatchObject({
    status: 'confirmed',
    payout: {
      payslipId: body.automation!.payslipId,
      bookingId: booking.id,
      accountId: ACCOUNT,
    },
  });
  expect((await read()).payout).toEqual(current.payout);
  expect(readFileSync(join(dir, 'receipts', receiptFiles.digest(pdf))).equals(pdf)).toBe(true);
  const source = await app.request(`/api/receipts/${current.receiptId}/download`, { headers });
  expect(source.status).toBe(200);
  expect(Buffer.from(await source.arrayBuffer()).equals(pdf)).toBe(true);
  const beforeReplay = snapshot(),
    replay = await upload(pdf);
  expect(await replay.json()).toMatchObject({
    duplicate: true,
    automation: { status: 'unchanged', groupId: null },
  });
  expect(snapshot()).toBe(beforeReplay);
  const reversed = await json('POST', '/api/undo', { groupId: body.automation!.groupId });
  expect(reversed.status).toBe(200);
  expect(await read()).toMatchObject({ status: 'pending', payout: null });
  const afterUndo = snapshot(),
    retry = await upload(pdf);
  expect(await retry.json()).toMatchObject({
    duplicate: true,
    automation: { status: 'unchanged', groupId: null },
  });
  expect(snapshot()).toBe(afterUndo);
  expect(opened.sqlite.prepare('SELECT id FROM booking WHERE deleted_at IS NULL').all()).toEqual(
    [],
  );
});

it('keeps no-intent uploads manual and missing date evidence unresolved without creating money', async () => {
  await configure();
  const pdf = await syntheticPayslipPdf(syntheticWageRows, ''),
    legacy = await upload(pdf, false);
  expect(legacy.status).toBe(201);
  const body = (await legacy.json()) as Upload;
  expect(body.automation).toBeUndefined();
  expect(opened.sqlite.prepare('SELECT id FROM booking').all()).toEqual([]);
  const noDate = await syntheticPayslipPdf(
    syntheticWageRows.filter((row) => !row.startsWith('Auszahlungsdatum:')),
    '',
  );
  const unresolved = await upload(noDate),
    result = (await unresolved.json()) as Upload;
  expect(unresolved.status).toBe(201);
  expect(result.automation).toMatchObject({
    status: 'pruefen',
    reason: 'payout_date_missing',
    groupId: null,
  });
  expect(opened.sqlite.prepare('SELECT id FROM booking').all()).toEqual([]);
  expect(await (await json('GET', `/api/payslip-intake/${result.id}`)).json()).toMatchObject({
    payout: null,
  });
});

it('rejects unauthenticated upload and untrusted financial plans before a source can be saved', async () => {
  const pdf = await syntheticPayslipPdf(syntheticWageRows, ''),
    before = snapshot();
  expect((await upload(pdf, true, { origin, cookie: '' })).status).toBe(401);
  const form = new FormData();
  form.set(
    'file',
    new File([new Uint8Array(pdf)], 'synthetic-payroll.pdf', { type: 'application/pdf' }),
  );
  form.set('automation', 'eligible');
  form.set('bookingId', 'untrusted-financial-plan');
  expect(
    (await app.request('/api/payslip-intake/upload', { method: 'POST', headers, body: form }))
      .status,
  ).toBe(400);
  expect(snapshot()).toBe(before);
});

it('rechecks the pre-worker config revision after actual PDF and retained-file verification', async () => {
  await configure();
  const verify = receiptFiles.verifyReceiptFile;
  let changed = false,
    afterChange = '';
  vi.spyOn(receiptFiles, 'verifyReceiptFile').mockImplementation(async (...args) => {
    const path = await verify(...args);
    if (!changed) {
      changed = true;
      expect(
        (
          await json('PUT', '/api/payslip-intake/config', {
            salaryAccountId: ACCOUNT,
            wageTypes: {},
          })
        ).status,
      ).toBe(200);
      afterChange = snapshot();
    }
    return path;
  });
  const pdf = await syntheticPayslipPdf(syntheticWageRows, ''),
    response = await upload(pdf);
  expect(changed).toBe(true);
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    automation: { status: 'pruefen', reason: 'source_changed', groupId: null },
  });
  expect(snapshot()).toBe(afterChange);
});
