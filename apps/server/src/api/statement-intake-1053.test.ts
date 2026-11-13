import { createTestDatabase, type OpenedDatabase } from '@budget/db';
import type { StatementIntakeView } from '@budget/domain';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createApp } from '../app';
import { sha256Hex } from '../auth/crypto';
import { createAuth } from '../auth/routes';
import { AuthStore } from '../auth/store';
import { syntheticColumnarPayslipPdf } from '../payslips/testing';
import { rememberPayslipPassword } from '../payslips/password';

type ApiJson = { intake: StatementIntakeView };

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
  vi.stubEnv('PAYSLIP_PDF_PASSWORD', '');
  vi.stubEnv('BUDGET_PEPPER', 'synthetic-pepper-0123456789abcdef-long');
  opened = createTestDatabase();
  seedBasics(opened.db);
  dir = mkdtempSync(join(tmpdir(), 'budget-statement-1053-'));
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
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});
async function upload(bytes: Buffer, password?: string) {
  const form = new FormData();
  form.set(
    'file',
    new File([new Uint8Array(bytes)], 'synthetic-statement.pdf', { type: 'application/pdf' }),
  );
  form.set('accountId', 'giro');
  if (password) form.set('password', password);
  return app.request('/api/statement-intake/upload', { method: 'POST', headers, body: form });
}
const read = async (res: Response) => ((await res.json()) as ApiJson).intake.proposal;

it('opens an encrypted statement with the remembered password when none is typed (#1053)', async () => {
  rememberPayslipPassword(opened.db, 'synthetic-remembered-secret');
  const bytes = await syntheticColumnarPayslipPdf(rows, 'synthetic-remembered-secret');
  const res = await upload(bytes);
  expect(res.status).toBe(201);
  const text = await res.clone().text();
  expect(text).not.toContain('synthetic-remembered-secret');
  const proposal = await read(res);
  expect(proposal.extraction).not.toBe('password_required');
  expect(proposal.fields.payableCents.value).toBe(12000);
});

it('opens an encrypted statement with the server secret and prefers the typed password', async () => {
  vi.stubEnv('PAYSLIP_PDF_PASSWORD', 'synthetic-server-secret');
  const bytes = await syntheticColumnarPayslipPdf(rows, 'synthetic-server-secret');
  expect((await read(await upload(bytes))).fields.payableCents.value).toBe(12000);
});

it('still reports a missing password when no candidate opens the PDF', async () => {
  vi.stubEnv('PAYSLIP_PDF_PASSWORD', 'synthetic-server-secret');
  const bytes = await syntheticColumnarPayslipPdf(rows, 'synthetic-other-secret');
  expect((await read(await upload(bytes))).extraction).toBe('password_required');
});
