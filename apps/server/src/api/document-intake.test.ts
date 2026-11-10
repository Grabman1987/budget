import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { createApp } from '../app';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { sha256Hex } from '../auth/crypto';
import {
  syntheticColumnarPayslipPdf,
  syntheticPayslipPdf,
  syntheticWageRows,
} from '../payslips/testing';
import { PDF, PNG } from '../receipts/testing';

let opened: OpenedDatabase, dir: string, app: ReturnType<typeof createApp>;
const origin = 'http://localhost:3000',
  token = 'synthetic-document-intake-session';
const headers = { origin, cookie: `budget_session=${token}` };
// Synthetic card layout: every label and number is invented.
const cardRows = [
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
    { x: 40, text: 'Gesamt Firmensumme' },
    { x: 250, text: '100,00', right: true },
    { x: 410, text: '20,00', right: true },
    { x: 520, text: '120,00', right: true },
  ],
];
const cell = (column: number, text: string) => ({ x: 40 + column * 5, text });
// Finite issued-card layout (invented values) that the card parser recognises.
const issuedCardRows = [
  [cell(0, 'Datum 04.01.2031')],
  [cell(0, 'Datum n�chste Umsatznachricht 04.02.2031')],
  [cell(0, 'Wird eingezogen am 12.01.2031')],
  [cell(0, 'Saldo 170,00-')],
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
    cell(8, '30.12.'),
    cell(16, '30.12.'),
    cell(24, 'Synthetic current merchant'),
    cell(94, '70,00-'),
  ],
];
const bankRows = [
  'Kontoauszug',
  'Abrechnungsnummer: DEMO-77',
  'Ausstellungsdatum: 01.10.2026',
  'Abrechnungszeitraum: 01.09.2026 - 30.09.2026',
];
beforeEach(() => {
  vi.stubEnv('PAYSLIP_PDF_PASSWORD', 'synthetic-pdf-password');
  vi.stubEnv('DROPBOX_PAYSLIP_ROOT', '');
  opened = createTestDatabase();
  dir = mkdtempSync(join(tmpdir(), 'budget-document-intake-'));
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
const tables = () =>
  JSON.stringify(
    [
      schema.receipt,
      schema.statementIntake,
      schema.payslipIntake,
      schema.booking,
      schema.transfer,
    ].map((t) => opened.db.all(sql`SELECT count(*) AS n FROM ${t}`)),
  );
function classify(
  bytes: Buffer | Uint8Array,
  type = 'application/pdf',
  extra: Record<string, string> = {},
  auth: Record<string, string> = headers,
) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], 'synthetic.bin', { type }));
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return app.request('/api/document-intake/classify', {
    method: 'POST',
    body: form,
    headers: auth,
  });
}
async function expectKind(
  bytes: Buffer,
  type: string,
  confidence: string,
  mime = 'application/pdf',
) {
  const before = tables();
  const res = await classify(bytes, mime);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ type, confidence, needsPassword: false });
  expect(tables()).toBe(before);
}
describe('document intake classification', () => {
  it('recognises a card statement, a bank statement and a payslip without writing anything', async () => {
    await expectKind(
      await syntheticColumnarPayslipPdf(issuedCardRows, ''),
      'card_statement',
      'certain',
    );
    await expectKind(await syntheticColumnarPayslipPdf(cardRows, ''), 'card_statement', 'probable');
    await expectKind(await syntheticPayslipPdf(bankRows, ''), 'bank_statement', 'probable');
    await expectKind(await syntheticPayslipPdf(syntheticWageRows), 'payslip', 'certain');
  });
  it('reports the printed period and card hint but no amounts or references', async () => {
    const res = await classify(await syntheticColumnarPayslipPdf(cardRows, ''));
    const body = await res.text();
    expect(body).toContain('2026-09-01/2026-09-30');
    expect(body).toContain('****1234');
    expect(body).not.toContain('DEMO-01');
    expect(body).not.toContain('120');
  });
  it('files plain PDFs and images as receipts and corrupt PDFs as unreadable', async () => {
    await expectKind(PNG, 'receipt', 'probable', 'image/png');
    await expectKind(await syntheticPayslipPdf(['Kassenbon', 'Danke'], ''), 'receipt', 'unknown');
    await expectKind(PDF, 'unreadable', 'unknown');
  });
  it('asks for a password on an encrypted PDF and opens it with the typed one', async () => {
    vi.stubEnv('PAYSLIP_PDF_PASSWORD', '');
    const bytes = await syntheticPayslipPdf(syntheticWageRows, 'typed-synthetic-secret');
    const before = tables();
    const locked = await classify(bytes);
    expect(await locked.json()).toMatchObject({ type: 'unreadable', needsPassword: true });
    const unlocked = await classify(bytes, 'application/pdf', {
      password: 'typed-synthetic-secret',
    });
    const text = await unlocked.text();
    expect(text).toContain('"payslip"');
    expect(text).not.toContain('typed-synthetic-secret');
    expect(tables()).toBe(before);
  });
  it('rejects unsupported types, oversize bodies, extra fields and unauthenticated calls', async () => {
    expect((await classify(Buffer.from('<svg></svg>'), 'image/svg+xml')).status).toBe(400);
    expect((await classify(PNG, 'image/png', { bookingId: 'x' })).status).toBe(400);
    expect((await classify(Buffer.alloc(16 * 1024 * 1024 + 1, 1))).status).toBe(413);
    expect((await classify(PNG, 'image/png', {}, { origin })).status).toBe(401);
  });
});
