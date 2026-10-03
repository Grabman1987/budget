import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { syntheticPayslipPdf } from '../apps/server/src/payslips/testing';
import { inspectReport } from './spending-helpers';
import { toast } from './ledger-helpers';

test.describe.configure({ timeout: 120000 });
test('synthetic encrypted PDF upload, confirm, undo and reject on phone and desktop', async ({
  page,
  request,
  baseURL,
}, info) => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post('/api' + path, { data, headers: { origin: baseURL! } });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const account = await post('/accounts', {
    name: 'Synthetisches Gehaltskonto',
    type: 'checking',
    role: 'budget',
    onBudget: true,
    openingDate: '2025-01-01',
    openingBalanceCents: 0,
  });
  const salary = await post('/bookings', {
    type: 'booking',
    accountId: account.account.id,
    date: '2026-09-30',
    amountCents: 297500,
    splits: [
      { amountCents: 287500, incomeTypeId: 'income-salary' },
      { amountCents: 10000, incomeTypeId: 'income-refund' },
    ],
  });
  await page.goto('/einstellungen/datenquellen');
  const source = page.locator('section', {
    has: page.getByRole('heading', { name: 'Gehaltszettel', exact: true }),
  });
  await source.getByLabel('Gehaltskonto', { exact: true }).selectOption(account.account.id);
  await source.getByRole('button', { name: 'Lohnart hinzufügen' }).click();
  await source.getByLabel('Lohnart 1', { exact: true }).fill('899');
  await source.getByLabel('Typ 1', { exact: true }).selectOption('reimbursement');
  await source.getByRole('button', { name: 'Zuordnung speichern' }).click();
  await expect(source).toContainText('Passwort gesetzt');
  await inspectReport(page, info, 'payslip-source');
  await page.goto('/reports/gehalt?monat=2026-09');
  const bytes = await syntheticPayslipPdf();
  await page
    .getByLabel('Gehaltszettel-PDF auswählen')
    .setInputFiles({ name: 'synthetic-202701.pdf', mimeType: 'application/pdf', buffer: bytes });
  // Extraction may use the bounded 20-second PDF worker budget before staging completes.
  await expect(page.getByRole('status').filter({ hasText: 'PDF im Posteingang' })).toBeVisible({
    timeout: 25000,
  });
  await page.goto('/konten/posteingang');
  const row = page.getByTestId('inbox-row').filter({ hasText: 'Gehaltszettel 09/2026 erkannt' });
  await row.getByText('Gehaltszettel prüfen', { exact: true }).click();
  await expect(row).toContainText('2.975,00');
  await expect(row).toContainText('innerhalb 1 Cent');
  await expect(row.getByLabel('Gehaltsbuchung (±5 Tage)')).toHaveValue(salary.id);
  await inspectReport(page, info, 'payslip-intake');
  await row.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  await expect(row).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row).toHaveCount(1);
  await row.getByText('Gehaltszettel prüfen', { exact: true }).click();
  await row.getByRole('button', { name: 'Ablehnen', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page
    .getByLabel('Gehaltszettel-PDF auswählen')
    .setInputFiles({ name: 'renamed.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.getByRole('status').filter({ hasText: 'bereits aufgenommen' })).toBeVisible();
  expect(
    (await request.get('/api/payslips?month=2026-09').then((r) => r.json())).captured,
  ).toHaveLength(0);
});
