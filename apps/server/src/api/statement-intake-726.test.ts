import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import type { StatementIntakeView } from '@budget/domain';
import { sql } from 'drizzle-orm';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

type ApiJson = {
  receipt: { sha256: string };
  intake: StatementIntakeView;
  account: { id: string };
  receipts: { id: string }[];
};

const origin = 'http://localhost:3000',
  token = 'synthetic-statement-session';
const headers = { origin, cookie: `budget_session=${token}` };
let opened: OpenedDatabase, dir: string, app: ReturnType<typeof createApp>;
// Reconstructed generic labels and every number are synthetic; no private PDF is read.
const rows = [
  [{ x: 40, text: 'Kartenabrechnung' }],
  [{ x: 40, text: 'Rechnungsnummer: DEMO-01' }],
  [{ x: 40, text: 'Rechnungtdaium: 01.10.2026' }],
  [{ x: 40, text: 'Abrechnungszeitraum: 01.09.2026 - 30.09.2026' }],
  [
    { x: 40, text: 'Total Neto' },
    { x: 280, text: 'MwSt Betrag' },
    { x: 440, text: 'Toial Bruto in EUR' },
  ],
  [
    { x: 40, text: 'Kartensumme ****1234' },
    { x: 520, text: '70,00', right: true },
  ],
  [
    { x: 40, text: 'Kartensumme ****5678' },
    { x: 520, text: '50,00', right: true },
  ],
  [
    { x: 40, text: 'Gesamt Firmensumme' },
    { x: 250, text: '100,00', right: true },
    { x: 410, text: '20,00', right: true },
    { x: 520, text: '120,00', right: true },
  ],
  [{ x: 40, text: 'Zahlungtform: Bankeinzug / 0 Tage netto' }],
  [{ x: 40, text: 'Bank des Ausstellers / IBAN: XX00 0000 0000 0000 0000' }],
];
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  dir = mkdtempSync(join(tmpdir(), 'budget-statement-726-'));
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
});
afterEach(() => {
  vi.restoreAllMocks();
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});
const financialState = () =>
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
async function upload(
  bytes: Buffer,
  filename = 'synthetic-statement.pdf',
  accountId = 'giro',
  auth = headers,
) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], filename, { type: 'application/pdf' }));
  form.set('accountId', accountId);
  return app.request('/api/statement-intake/upload', { method: 'POST', headers: auth, body: form });
}
async function jsonCall(method: string, path: string, data?: unknown) {
  return app.request('/api/statement-intake' + path, {
    method,
    headers: { ...headers, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}

it('proves the real authenticated receipt/PDF fixture and leaves the six financial tables unchanged', async () => {
  const bytes = await syntheticColumnarPayslipPdf(rows, ''),
    before = financialState();
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], 'synthetic.pdf'));
  const result = await app.request('/api/receipts', { method: 'POST', headers, body: form });
  expect(result.status).toBe(201);
  const { receipt } = (await result.json()) as ApiJson;
  expect(receipt).toMatchObject({
    sha256: digest(bytes),
    mime: 'application/pdf',
    sizeBytes: bytes.length,
  });
  expect(readFileSync(join(dir, 'receipts', receipt.sha256))).toEqual(bytes);
  expect(financialState()).toBe(before);
});

it('retains the original and selects company gross12000, not net10000/VAT2000/card7000/5000; absent debit date stays null', async () => {
  const bytes = await syntheticColumnarPayslipPdf(rows, ''),
    before = financialState();
  const result = await upload(bytes);
  expect(result.status).toBe(201);
  const { intake } = (await result.json()) as ApiJson;
  expect(intake).toMatchObject({
    accountId: 'giro',
    sha256: digest(bytes),
    status: 'pending',
    reviewed: null,
  });
  expect(intake.proposal.fields.payableCents).toMatchObject({
    value: 12000,
    origin: 'printed',
    evidence: { page: null },
  });
  expect(intake.proposal.fields.issueDate.value).toBe('2026-10-01');
  expect(intake.proposal.fields.debitDate.value).toBeNull();
  const download = await app.request(`/api/receipts/${intake.receiptId}/download`, { headers });
  expect(download.status).toBe(200);
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  expect(financialState()).toBe(before);
});

it('reuses renamed duplicate bytes and rejects silently rebinding them to another real account', async () => {
  const bytes = await syntheticColumnarPayslipPdf(rows, '');
  const first = await upload(bytes);
  expect(first.status).toBe(201);
  const saved = (await first.json()) as ApiJson;
  const duplicate = await upload(bytes, 'renamed.pdf');
  expect(duplicate.status).toBe(201);
  expect(await duplicate.json()).toMatchObject({
    duplicate: true,
    intake: { id: saved.intake.id, revision: saved.intake.revision },
  });
  const account = await app.request('/api/accounts', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Another synthetic account',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 0,
    }),
  });
  expect(account.status).toBe(201);
  const other = ((await account.json()) as ApiJson).account.id,
    before = financialState();
  expect((await upload(bytes, 'same.pdf', other)).status).toBe(409);
  expect(financialState()).toBe(before);
});

it('requires explicit account selection and never maps an issuer footer IBAN as the owner account', async () => {
  const bytes = await syntheticColumnarPayslipPdf(rows, ''),
    before = financialState();
  expect((await upload(bytes, 's.pdf', '')).status).toBe(400);
  expect(opened.db.select().from(schema.receipt).all()).toEqual([]);
  const result = await upload(bytes);
  expect(result.status).toBe(201);
  const { intake } = (await result.json()) as ApiJson;
  expect(intake.accountId).toBe('giro');
  expect(JSON.stringify(intake.proposal.fields.accountHint)).not.toContain('XX00');
  expect(intake.proposal.fields.accountHint.value).toBeNull(); // Two distinct card hints are not a unique mapping.
  expect(financialState()).toBe(before);
});

it('retains a password-blocked PDF and reparses only under its exact source/account/revision tuple', async () => {
  const bytes = await syntheticColumnarPayslipPdf(rows, 'synthetic-only-password'),
    before = financialState();
  const result = await upload(bytes);
  expect(result.status).toBe(201);
  const { intake } = (await result.json()) as ApiJson;
  expect(intake.proposal.extraction).toBe('password_required');
  expect(intake.proposal.fields.payableCents.value).toBeNull();
  const tuple = { revision: intake.revision, sha256: intake.sha256, accountId: intake.accountId };
  const retry = await jsonCall('POST', `/${intake.id}/reparse`, {
    ...tuple,
    password: 'synthetic-only-password',
  });
  expect(retry.status).toBe(200);
  const next = ((await retry.json()) as ApiJson).intake;
  expect(next.proposal.fields.payableCents.value).toBe(12000);
  expect(next.proposal.fields.debitDate.value).toBeNull();
  expect((await jsonCall('POST', `/${intake.id}/reparse`, tuple)).status).toBe(409);
  expect(financialState()).toBe(before);
});

it('saves explicitly entered debit date as owner provenance without creating any financial state', async () => {
  const before = financialState(),
    bytes = await syntheticColumnarPayslipPdf(rows, '');
  const result = await upload(bytes);
  expect(result.status).toBe(201);
  const { intake } = (await result.json()) as ApiJson;
  const body = {
    revision: intake.revision,
    sha256: intake.sha256,
    accountId: intake.accountId,
    facts: {
      reference: 'DEMO-01',
      issueDate: '2026-10-01',
      periodFrom: '2026-09-01',
      periodTo: '2026-09-30',
      payableCents: 12000,
      currency: 'EUR',
      debitDate: '2026-10-10',
      accountHint: null,
    },
  };
  const saved = await jsonCall('PUT', `/${intake.id}/review`, body);
  expect(saved.status).toBe(200);
  const next = ((await saved.json()) as ApiJson).intake;
  expect(next.status).toBe('reviewed');
  expect(next.reviewed).not.toBeNull();
  expect(next.reviewed!.fields.debitDate).toMatchObject({ value: '2026-10-10', origin: 'owner' });
  expect(next.reviewed!.fields.payableCents).toMatchObject({ value: 12000, origin: 'printed' });
  expect(
    (
      await jsonCall('PUT', `/${intake.id}/review`, {
        ...body,
        facts: { ...body.facts, payableCents: 13000 },
      })
    ).status,
  ).toBe(409);
  expect(financialState()).toBe(before);
});

it('keeps pending statement receipts out of generic unlinked removal', async () => {
  const result = await upload(await syntheticColumnarPayslipPdf(rows, ''));
  expect(result.status).toBe(201);
  const { intake } = (await result.json()) as ApiJson;
  const unlinked = await app.request('/api/receipts', { headers });
  expect(unlinked.status).toBe(200);
  expect(
    ((await unlinked.json()) as ApiJson).receipts.map((r: { id: string }) => r.id),
  ).not.toContain(intake.receiptId);
  expect(
    (await app.request(`/api/receipts/${intake.receiptId}`, { method: 'DELETE', headers })).status,
  ).toBe(409);
});

it('rejects unauthenticated and cross-origin upload without receipt or financial writes', async () => {
  const bytes = await syntheticColumnarPayslipPdf(rows, ''),
    before = financialState();
  expect((await upload(bytes, 's.pdf', 'giro', { origin, cookie: '' })).status).toBe(401);
  expect(
    (await upload(bytes, 's.pdf', 'giro', { ...headers, origin: 'https://synthetic.invalid' }))
      .status,
  ).toBe(403);
  expect(opened.db.select().from(schema.receipt).all()).toEqual([]);
  expect(financialState()).toBe(before);
});

it('concurrent renamed uploads publish one source identity and one tracked document group', async () => {
  const bytes = await syntheticColumnarPayslipPdf(rows, ''),
    before = financialState();
  const replies = await Promise.all([upload(bytes, 'first.pdf'), upload(bytes, 'renamed.pdf')]);
  expect(replies.map((r) => r.status)).toEqual([201, 201]);
  const bodies = await Promise.all(
    replies.map(async (r) => (await r.json()) as ApiJson & { duplicate?: boolean }),
  );
  expect(bodies[0]!.intake.id).toBe(bodies[1]!.intake.id);
  expect(bodies.map((b) => Boolean(b.duplicate)).sort()).toEqual([false, true]);
  expect(opened.db.select().from(schema.receipt).all()).toHaveLength(1);
  expect(opened.db.select().from(schema.statementIntake).all()).toHaveLength(1);
  expect(
    opened.db
      .select()
      .from(schema.auditLog)
      .all()
      .filter((r) => r.entityType === 'statement_intake'),
  ).toHaveLength(1);
  expect(financialState()).toBe(before);
});

it('rechecks the CAS inside the write transaction after an actual asynchronous extraction', async () => {
  const result = await upload(await syntheticColumnarPayslipPdf(rows, ''));
  expect(result.status).toBe(201);
  const current = ((await result.json()) as ApiJson).intake,
    before = financialState();
  let started!: () => void, release!: () => void;
  const began = new Promise<void>((r) => {
      started = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const real = statementService.extractStatement;
  vi.spyOn(statementService, 'extractStatement').mockImplementationOnce(async (bytes, password) => {
    started();
    await gate;
    return real(bytes, password);
  });
  const tuple = {
    revision: current.revision,
    sha256: current.sha256,
    accountId: current.accountId,
  };
  const reparsing = jsonCall('POST', `/${current.id}/reparse`, tuple);
  await began;
  const rejected = await jsonCall('POST', `/${current.id}/reject`, tuple);
  expect(rejected.status).toBe(200);
  const auditCount = opened.db.select().from(schema.auditLog).all().length;
  release();
  expect((await reparsing).status).toBe(409);
  expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(auditCount);
  expect(((await (await jsonCall('GET', `/${current.id}`)).json()) as ApiJson).intake.status).toBe(
    'rejected',
  );
  expect(financialState()).toBe(before);
});

it('does not restore document metadata when its retained original is physically corrupt', async () => {
  const result = await upload(await syntheticColumnarPayslipPdf(rows, ''));
  expect(result.status).toBe(201);
  const current = ((await result.json()) as ApiJson).intake,
    before = financialState();
  const removed = await jsonCall('DELETE', `/${current.id}`, current);
  expect(removed.status).toBe(400);
  const tuple = {
    revision: current.revision,
    sha256: current.sha256,
    accountId: current.accountId,
  };
  const deleted = await jsonCall('DELETE', `/${current.id}`, tuple);
  expect(deleted.status).toBe(200);
  const next = ((await deleted.json()) as ApiJson).intake;
  writeFileSync(join(dir, 'receipts', next.sha256), 'synthetic corruption');
  const count = opened.db.select().from(schema.auditLog).all().length;
  expect(
    (
      await jsonCall('POST', `/${next.id}/restore`, {
        revision: next.revision,
        sha256: next.sha256,
        accountId: next.accountId,
      })
    ).status,
  ).toBe(409);
  expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(count);
  expect(
    ((await (await jsonCall('GET', `/${next.id}`)).json()) as ApiJson).intake.deletedAt,
  ).not.toBeNull();
  expect(financialState()).toBe(before);
});
