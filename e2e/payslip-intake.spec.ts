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
  await expect(source).toContainText('PDF-Passwort hinterlegt');
  await inspectReport(page, info, 'payslip-source');
  await page.goto('/reports/gehalt?monat=2026-09');
  const bytes = await syntheticPayslipPdf();
  // Upload lives in its own form dialog since #336.
  await page.getByRole('button', { name: 'Gehaltszettel hochladen', exact: true }).click();
  const upload = page.getByRole('dialog', { name: 'Gehaltszettel hochladen' });
  await expect(upload).toBeVisible();
  const chooserReady = page.waitForEvent('filechooser');
  await upload.getByRole('button', { name: 'Gehaltszettel hochladen', exact: true }).click();
  const chooser = await chooserReady;
  expect(chooser.isMultiple()).toBe(false);
  // Exercise the real button before selecting bytes: direct setInputFiles misses picker freezes.
  await chooser.setFiles({
    name: 'synthetic-202701.pdf',
    mimeType: 'application/pdf',
    buffer: bytes,
  });
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

test('new payout uses the suggested account, allows another account and undoes the whole confirmation', async ({
  page,
  request,
  baseURL,
}, info) => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post('/api' + path, { data, headers: { origin: baseURL! } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const createAccount = async (name: string) =>
    (
      await post('/accounts', {
        name,
        type: 'checking',
        openingDate: '2025-01-01',
        openingBalanceCents: 0,
      })
    ).account;
  const suggested = await createAccount('Gehaltskonto Muster');
  const alternate = await createAccount('Alternativkonto Muster');
  const config = await request.put('/api/payslip-intake/config', {
    headers: { origin: baseURL! },
    data: { salaryAccountId: suggested.id, wageTypes: {} },
  });
  expect(config.ok()).toBe(true);
  await page.goto('/reports/gehalt?monat=2026-09');
  await page.getByRole('button', { name: 'Gehaltszettel hochladen', exact: true }).click();
  const upload = page.getByRole('dialog', { name: 'Gehaltszettel hochladen' });
  const chooserReady = page.waitForEvent('filechooser');
  await upload.getByRole('button', { name: 'Gehaltszettel hochladen', exact: true }).click();
  await (
    await chooserReady
  ).setFiles({
    name: 'synthetic-payout.pdf',
    mimeType: 'application/pdf',
    buffer: await syntheticPayslipPdf(),
  });
  await expect(page.getByRole('status').filter({ hasText: 'PDF im Posteingang' })).toBeVisible({
    timeout: 25000,
  });
  expect((await (await request.get('/api/bookings')).json()).items).toHaveLength(0);
  await page.goto('/konten/posteingang');
  const row = page.getByTestId('inbox-row').filter({ hasText: 'Gehaltszettel 09/2026 erkannt' });
  await row.getByText('Gehaltszettel prüfen', { exact: true }).click();
  await expect(row.getByLabel('Auszahlungskonto')).toHaveValue(suggested.id);
  await row.getByLabel('Auszahlungskonto').selectOption(alternate.id);
  await expect(row.getByLabel('Auszahlungskonto')).toHaveValue(alternate.id);
  await expect(row.getByLabel('Gehaltsbuchung (±5 Tage)')).toHaveValue('');
  await expect(row).toContainText('Die neue Auszahlung wird vorgemerkt');
  await inspectReport(page, info, 'payslip-payout-confirmation');
  await row.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  await expect(row).toHaveCount(0);
  const saved = (await (await request.get('/api/bookings')).json()).items;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    accountId: alternate.id,
    date: '2026-09-30',
    amountCents: 297500,
    status: 'pending',
  });
  expect(saved[0].splits).toMatchObject([
    { amountCents: 287500, incomeTypeId: 'income-salary' },
    { amountCents: 10000, incomeTypeId: 'income-refund' },
  ]);
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row).toHaveCount(1);
  expect((await (await request.get('/api/bookings')).json()).items).toHaveLength(0);
  expect((await (await request.get('/api/payslips?month=2026-09')).json()).captured).toHaveLength(
    0,
  );
});
