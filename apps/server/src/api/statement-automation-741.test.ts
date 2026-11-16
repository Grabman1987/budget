import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  accounts,
  categories,
  createBooking,
  createEntity,
  createTestDatabase,
  getBooking,
  history,
  saveAssignmentRule,
  schema,
  stageStatementIntake,
  undo,
  type OpenedDatabase,
} from '@budget/db';
import {
  parseStatementText,
  type StatementAutomationConfig,
  type StatementAutomationOutcome,
  type StatementIntakeView,
} from '@budget/domain';
import { createApp } from '../app';
import { sha256Hex } from '../auth/crypto';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { syntheticColumnarPayslipPdf } from '../payslips/testing';
import { digest } from '../receipts/files';
import * as extraction from '../statements/service';

const CARD = '74100000-0000-4000-8000-000000000201';
const FUND = '74100000-0000-4000-8000-000000000202';
const GROUP = '74100000-0000-4000-8000-000000000203';
const EXPENSE = '74100000-0000-4000-8000-000000000204';
const token = 'synthetic-card-741-session',
  origin = 'http://localhost:3000';
const headers = { origin, cookie: `budget_session=${token}` };
const cardToken = createHash('sha256')
  .update(JSON.stringify(['statement-card-v1', CARD, '1111']))
  .digest('hex');
let opened: OpenedDatabase, dir: string, app: ReturnType<typeof createApp>;
type Reply = {
  intake: StatementIntakeView;
  automation: StatementAutomationOutcome;
  duplicate?: boolean;
  groupId: string | null;
};
const cell = (column: number, text: string) => ({ x: 40 + column * 5, text });
// Every identifier/value is invented. Cells fit the page and pass through the real PDF worker.
const pdfRows = (previous = false) => [
  [cell(0, `Datum ${previous ? '04.12.2030' : '04.01.2031'}`)],
  [cell(0, `Datum nächste Umsatznachricht ${previous ? '04.01.2031' : '04.02.2031'}`)],
  [cell(0, `Wird eingezogen am ${previous ? '12.12.2030' : '12.01.2031'}`)],
  [cell(0, previous ? 'Saldo 100,00-' : 'Saldo 170,00-')],
  [
    cell(0, 'Karte'),
    cell(8, 'Umsatz'),
    cell(16, 'Buchung'),
    cell(24, 'Buchungstext'),
    cell(58, 'Branche'),
    cell(70, 'Betrag'),
    cell(82, 'Kurs'),
    cell(94, 'EUR Betrag'),
  ],
  [
    cell(0, '1111'),
    cell(8, previous ? '30.11.' : '30.12.'),
    cell(16, previous ? '30.11.' : '30.12.'),
    cell(24, previous ? 'Synthetic earlier merchant' : 'Synthetic current merchant'),
    cell(94, previous ? '100,00-' : '70,00-'),
  ],
];

beforeEach(() => {
  opened = createTestDatabase();
  const ctx = { actor: 'synthetic-741-fixture' };
  accounts.create(
    opened.db,
    {
      id: FUND,
      name: 'Synthetic funding',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2030-11-01',
      openingBalanceCents: 50000,
    },
    ctx,
  );
  accounts.create(
    opened.db,
    {
      id: CARD,
      name: 'Synthetic card',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingDate: '2030-11-01',
      openingBalanceCents: 0,
    },
    ctx,
  );
  createEntity(opened.db, schema.categoryGroup, { id: GROUP, name: 'Synthetic costs' }, ctx);
  categories.create(
    opened.db,
    { id: EXPENSE, name: 'Synthetic expense', groupId: GROUP, class: 'need' },
    ctx,
  );
  saveAssignmentRule(
    opened.db,
    null,
    {
      name: 'Synthetic current merchant rule',
      enabled: true,
      automatic: true,
      match: {
        mode: 'all',
        conditions: [{ type: 'counterparty', text: 'Synthetic current merchant' }],
      },
      actions: { categoryId: EXPENSE },
    },
    ctx,
  );
  dir = mkdtempSync(join(tmpdir(), 'budget-card-automation-741-'));
  const now = new Date('2031-01-10T12:00:00Z'),
    store = new AuthStore(opened.db);
  store.createSession({
    id: sha256Hex(token),
    passkeyId: null,
    now,
    expiresAt: new Date('2031-02-10T12:00:00Z'),
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
      pepper: Buffer.from('synthetic-pepper-741-0123456789abcdef'),
    },
  });
  app = createApp({
    webDir: join(dir, 'web'),
    auth,
    ledger: { db: opened.db, receiptsDir: join(dir, 'receipts'), today: () => '2031-01-10' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});

const json = (method: string, path: string, body?: unknown, requestHeaders = headers) =>
  app.request(path, {
    method,
    headers: { ...requestHeaders, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const cas = (intake: StatementIntakeView) => ({
  accountId: intake.accountId,
  sha256: intake.sha256,
  revision: intake.revision,
});
const tableRows = (names: string[]) =>
  names.map((name) => [
    name,
    opened.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
  ]);
const financial = () =>
  JSON.stringify(
    tableRows([
      'account',
      'booking',
      'booking_split',
      'transfer',
      'expected_payment',
      'expected_payment_version',
      'expected_occurrence',
      'statement_settlement',
      'statement_bonus',
      'statement_automation_run',
      'statement_automation_row',
    ]),
  );
const allState = () =>
  JSON.stringify(
    tableRows(
      (
        opened.sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'auth_%' ORDER BY name",
          )
          .all() as { name: string }[]
      ).map((r) => r.name),
    ),
  );
async function upload(
  bytes: Buffer,
  automatic = false,
  requestHeaders = headers,
  password?: string,
) {
  const form = new FormData();
  form.set(
    'file',
    new File([new Uint8Array(bytes)], 'synthetic-card-741.pdf', { type: 'application/pdf' }),
  );
  form.set('accountId', CARD);
  if (automatic) form.set('automation', 'eligible');
  if (password !== undefined) form.set('password', password);
  return app.request('/api/statement-intake/upload', {
    method: 'POST',
    headers: requestHeaders,
    body: form,
  });
}
async function configure() {
  const settlement = await json('POST', '/api/statement-settlements/actions', {
    operation: 'configure',
    key: 'synthetic-api-settlement-741',
    cardAccountId: CARD,
    fundingAccountId: FUND,
    expectedRevision: null,
    enabled: true,
  });
  expect(settlement.status).toBe(201);
  const response = await json('PUT', '/api/statement-intake/automation/config', {
    accountId: CARD,
    expectedRevision: null,
    enabled: true,
    mappedCards: [{ token: cardToken, accountId: CARD }],
    scheduledPayment: { mode: 'none' },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { config: StatementAutomationConfig }).config;
}
async function prior() {
  const bytes = await syntheticColumnarPayslipPdf(pdfRows(true), '');
  const response = await upload(bytes);
  expect(response.status).toBe(201);
  const body = (await response.json()) as Reply;
  expect(body.intake.proposal.fields.payableCents.value).toBe(10000);
  expect(body.automation).toBeUndefined();
  return body.intake;
}

it('runs authenticated real PDF upload through retained-source extraction into money, links and whole Undo without mocking a plan', async () => {
  await configure();
  const originalId = createBooking(
    opened.db,
    {
      accountId: CARD,
      date: '2030-11-30',
      amountCents: -10000,
      memo: 'Synthetic earlier merchant',
      splits: [{ categoryId: EXPENSE, amountCents: -10000 }],
    },
    { actor: 'synthetic-owner' },
  );
  const original = getBooking(opened.db, originalId),
    originalAudit = history(opened.db, 'booking', originalId);
  await prior();
  const bytes = await syntheticColumnarPayslipPdf(pdfRows(), ''),
    response = await upload(bytes, true);
  expect(response.status).toBe(201);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = (await response.json()) as Reply;
  expect(body.automation).toMatchObject({
    status: 'saved',
    created: 1,
    matched: 0,
    credits: 0,
    receiptLinks: 3,
    pending: [],
    reasons: [],
  });
  expect(body.intake).toMatchObject({ sha256: digest(bytes), status: 'pending', reviewed: null });
  expect(readFileSync(join(dir, 'receipts', digest(bytes))).equals(bytes)).toBe(true);
  const posted = body.automation.items!.map((i) => getBooking(opened.db, i.bookingId)!);
  expect(posted.map((b) => b.amountCents).sort((a, b) => a - b)).toEqual([-17000, -7000, 17000]);
  expect(posted.every((b) => b.status === 'pending' && b.source === 'import')).toBe(true);
  expect(posted.filter((b) => b.transferId).map((b) => b.date)).toEqual([
    '2031-01-12',
    '2031-01-12',
  ]);
  expect(getBooking(opened.db, originalId)).toEqual(original);
  expect(history(opened.db, 'booking', originalId)).toEqual(originalAudit);
  const entries = opened.sqlite
    .prepare('SELECT actor FROM audit_log WHERE group_id=?')
    .all(body.automation.groupId) as { actor: string }[];
  expect(entries.length).toBeGreaterThan(5);
  expect(entries.every((e) => e.actor === 'document-automation:card')).toBe(true);
  expect(JSON.stringify(body)).not.toContain('sourceProofJson');
  expect(JSON.stringify(body)).not.toContain('proofJson');
  const beforeReplay = financial(),
    replay = await upload(bytes, true);
  expect(replay.status).toBe(201);
  expect(await replay.json()).toMatchObject({
    duplicate: true,
    automation: { status: 'unchanged', groupId: null },
  });
  expect(financial()).toBe(beforeReplay);
  undo(opened.db, { groupId: body.automation.groupId! }, { actor: 'synthetic-owner' });
  const afterUndo = financial(),
    undone = await upload(bytes, true);
  expect(undone.status).toBe(201);
  expect(await undone.json()).toMatchObject({
    duplicate: true,
    automation: { status: 'undone', groupId: null, items: [] },
  });
  expect(financial()).toBe(afterUndo);
  expect(
    opened.sqlite
      .prepare('SELECT amount_cents FROM booking WHERE deleted_at IS NULL AND account_id=?')
      .all(CARD),
  ).toEqual([{ amount_cents: -10000 }]);
  expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
});

it('keeps a legacy upload manual even after automatic configuration, then permits explicit retained-source automation', async () => {
  await configure();
  await prior();
  const before = financial(),
    bytes = await syntheticColumnarPayslipPdf(pdfRows(), '');
  const response = await upload(bytes),
    body = (await response.json()) as Reply;
  expect(response.status).toBe(201);
  expect(body.automation).toBeUndefined();
  expect(financial()).toBe(before);
  const result = await json(
    'POST',
    `/api/statement-intake/${body.intake.id}/automate`,
    cas(body.intake),
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    automation: { status: 'saved', created: 1, receiptLinks: 3 },
  });
});

it('discovers only opaque/masked card hints without enabling automation or writing money', async () => {
  const bytes = await syntheticColumnarPayslipPdf(pdfRows(), ''),
    before = financial();
  const response = await upload(bytes, true),
    body = (await response.json()) as Reply;
  expect(response.status).toBe(201);
  expect(body.automation).toMatchObject({
    status: 'review',
    created: 0,
    credits: 0,
    runId: null,
    suggestedCardTokens: [cardToken],
    suggestedCardHints: [{ token: cardToken, hint: '****1111' }],
  });
  expect(body.automation.reasons).toContain('automation_not_configured');
  expect(financial()).toBe(before);
  expect(opened.sqlite.prepare('SELECT * FROM statement_automation_config').all()).toEqual([]);
});

it('rejects missing authentication and foreign-origin upload without retaining source or writing money', async () => {
  const bytes = await syntheticColumnarPayslipPdf(pdfRows(), ''),
    before = financial();
  expect((await upload(bytes, true, { origin, cookie: '' })).status).toBe(401);
  expect(
    (await upload(bytes, true, { origin: 'https://synthetic.invalid', cookie: headers.cookie }))
      .status,
  ).toBe(403);
  expect(financial()).toBe(before);
  expect(opened.sqlite.prepare('SELECT * FROM statement_intake').all()).toEqual([]);
});

it('rejects client-supplied financial proof before parsing and leaves the complete ledger unchanged', async () => {
  const sha = 'f'.repeat(64);
  const intake = stageStatementIntake(
    opened.db,
    {
      accountId: CARD,
      sha256: sha,
      sizeBytes: 100,
      filename: 'synthetic-body-validation-only.pdf',
      proposal: parseStatementText('Rechnungsdatum 04.01.2031', sha),
    },
    { actor: 'synthetic-fixture' },
  ).intake;
  const before = financial();
  const response = await json('POST', `/api/statement-intake/${intake.id}/automate`, {
    ...cas(intake),
    document: { totalsVerified: true, rows: [{ amountCents: -7000 }] },
  });
  expect(response.status).toBe(400);
  expect(financial()).toBe(before);
});

it('reports corrupt retained bytes safely without posting a remembered summary', async () => {
  await configure();
  await prior();
  const bytes = await syntheticColumnarPayslipPdf(pdfRows(), ''),
    response = await upload(bytes);
  expect(response.status).toBe(201);
  const { intake } = (await response.json()) as Reply;
  writeFileSync(join(dir, 'receipts', intake.sha256), Buffer.from('synthetic corrupted source'));
  const before = financial(),
    result = await json('POST', `/api/statement-intake/${intake.id}/automate`, cas(intake));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    automation: {
      status: 'review',
      runId: null,
      reasons: ['retained_source_unavailable'],
      created: 0,
      credits: 0,
    },
  });
  expect(financial()).toBe(before);
});

it('rechecks configuration after actual worker I/O and rejects an asynchronous configuration race atomically', async () => {
  const config = await configure();
  await prior();
  const bytes = await syntheticColumnarPayslipPdf(pdfRows(), ''),
    uploaded = await upload(bytes);
  expect(uploaded.status).toBe(201);
  const { intake } = (await uploaded.json()) as Reply;
  const actualExtract = extraction.extractStatementText;
  let changed = false,
    afterChange = '';
  vi.spyOn(extraction, 'extractStatementText').mockImplementation(async (...args) => {
    const extracted = await actualExtract(...args);
    if (!changed) {
      changed = true;
      const changedResponse = await json('PUT', '/api/statement-intake/automation/config', {
        accountId: CARD,
        expectedRevision: config.revision,
        enabled: false,
        mappedCards: config.mappedCards,
        scheduledPayment: config.scheduledPayment,
      });
      expect(changedResponse.status).toBe(200);
      afterChange = allState();
    }
    return extracted;
  });
  const response = await json('POST', `/api/statement-intake/${intake.id}/automate`, cas(intake));
  expect(changed).toBe(true);
  expect(response.status).toBe(409);
  expect(allState()).toBe(afterChange);
});
