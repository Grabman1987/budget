import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { inspectReport } from './spending-helpers';
import { toast } from './ledger-helpers';

test.describe.configure({ timeout: 120000 });

test('captured salary through the real API, with undo and mobile/desktop evidence', async ({
  page,
  request,
  baseURL,
}, info) => {
  const post = async (path: string, data: unknown) => {
    const r = await request.post(`/api${path}`, { data, headers: { origin: baseURL! } });
    expect(r.ok()).toBe(true);
    return r.json();
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
    amountCents: 295000,
    splits: [
      { amountCents: 280000, incomeTypeId: 'income-salary' },
      { amountCents: 15000, incomeTypeId: 'income-refund' },
    ],
  });
  await page.goto('/reports/gehalt?monat=2026-09');
  await page.getByRole('button', { name: 'Gehaltszettel hinzufügen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gehaltszettel hinzufügen' });
  await dialog.getByLabel('Brutto ohne zusätzliche Bezüge', { exact: true }).fill('4.000');
  await dialog.getByLabel('SV-DN', { exact: true }).fill('700');
  await dialog.getByLabel('Lohnsteuer', { exact: true }).fill('500');
  await dialog.getByRole('button', { name: 'Zeile hinzufügen', exact: true }).click();
  await dialog.getByLabel('Bezeichnung 1', { exact: true }).fill('Synthetische Reisekosten');
  await dialog
    .getByRole('combobox', { name: 'Zeilentyp 1', exact: true })
    .selectOption('reimbursement');
  await dialog.getByLabel('Betrag Zeile 1', { exact: true }).fill('150');
  await dialog.getByLabel('Auszahlung laut Zettel', { exact: true }).fill('2.950');
  await dialog.getByLabel('Gehaltsbuchung').selectOption(salary.id);
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.tbd-fig').first()).toContainText('2.950');
  await expect(page.locator('.tbd-fig').first()).toContainText(',00 €');
  await page.getByRole('link', { name: 'Gehaltszettel-Historie', exact: true }).click();
  await expect(page.getByTestId('payroll-report')).toContainText(
    'Steuerfreie Erstattung · Synthetische Reisekosten',
  );
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Gehaltszettel bearbeiten' });
  await edit.getByLabel('Lohnsteuer', { exact: true }).fill('499,99');
  await edit.getByLabel('Auszahlung laut Zettel', { exact: true }).fill('2.950,01');
  await edit.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(page.getByTestId('payroll-report')).toContainText(
    'Gehaltsanteil weicht von der Buchung ab: −0,01',
  );
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByTestId('payroll-report')).toContainText(
    'Gehaltsanteil stimmt mit den Gehaltsanteilen der Buchung überein.',
  );
  await inspectReport(page, info, 'salary');
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await edit.getByLabel('Lohnsteuer', { exact: true }).fill('-50');
  await edit.getByLabel('SV-DN', { exact: true }).fill('-20');
  await edit.getByLabel('Auszahlung laut Zettel', { exact: true }).fill('4.220');
  await edit.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(
    page.getByRole('row', { name: /Lohnsteuer-Erstattung \(Aufrollung\)/ }),
  ).toContainText('50,00');
  await expect(page.getByRole('row', { name: /SV-Erstattung \(Aufrollung\)/ })).toContainText(
    '20,00',
  );
  await page.getByRole('link', { name: 'Zurück zum Gehaltsreport' }).click();
  await expect(page.locator('.pp-ratio')).toHaveCount(0);
  await expect(page.getByTestId('payroll-report')).toContainText('Abzugsquote −1,8 %');
  await inspectReport(page, info, 'salary-aufrollung');
});

test('project P&L through the real API, retaining archived attribution and mobile/desktop evidence', async ({
  page,
  request,
  baseURL,
}, info) => {
  const post = async (path: string, data: unknown) => {
    const r = await request.post(`/api${path}`, { data, headers: { origin: baseURL! } });
    expect(r.ok()).toBe(true);
    return r.json();
  };
  const account = await post('/accounts', {
    name: 'Synthetisches Projektkonto',
    type: 'checking',
    role: 'budget',
    onBudget: true,
    openingDate: '2025-01-01',
    openingBalanceCents: 0,
  });
  await page.goto('/einstellungen/projekte');
  await page.getByLabel('Projektname', { exact: true }).fill('Synthetisches Nebenprojekt');
  await page.getByRole('button', { name: 'Projekt anlegen', exact: true }).click();
  await expect(page.locator('.pp-settings tbody')).toContainText('Synthetisches Nebenprojekt');
  await inspectReport(page, info, 'project-settings');
  const projects = await (await request.get('/api/projects')).json();
  const projectId = projects.projects[0].id;
  const incomeBooking = await post('/bookings', {
    type: 'booking',
    accountId: account.account.id,
    projectId,
    date: '2026-09-02',
    amountCents: 50000,
    splits: [{ amountCents: 50000, incomeTypeId: 'income-side' }],
  });
  await post('/bookings', {
    type: 'booking',
    accountId: account.account.id,
    projectId,
    date: '2026-09-03',
    amountCents: -12000,
    splits: [{ amountCents: -12000 }],
  });
  await page.getByRole('button', { name: 'Archivieren', exact: true }).click();
  await expect(page.locator('.pp-settings tbody')).toContainText('archiviert');
  await page.goto('/reports/projekte?zeitraum=2026-09..2026-09');
  await expect(page.getByTestId('projects-report')).toContainText(
    'Synthetisches Nebenprojekt · archiviert',
  );
  await expect(page.locator('.tbd-fig').first()).toContainText('380');
  await expect(page.getByTestId('projects-report')).toContainText('500,00');
  await page.getByText('Buchungen (2)', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Buchung 1 öffnen' })).toHaveAttribute(
    'href',
    /buchung=/,
  );
  await inspectReport(page, info, 'projects');
  await page.goto(`/konten/buchungen?buchung=${incomeBooking.id}`);
  await page.getByRole('button', { name: 'Buchung am 02.09. bearbeiten', exact: true }).click();
  const bookingDialog = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(bookingDialog.getByLabel('Projekt', { exact: true })).toHaveValue(projectId);
  await expect(
    bookingDialog.getByLabel('Projekt', { exact: true }).locator('option:checked'),
  ).toHaveText('Synthetisches Nebenprojekt · archiviert');
  await bookingDialog.getByLabel('Notiz', { exact: true }).fill('Synthetische Änderung');
  await bookingDialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(bookingDialog).not.toBeVisible();
  const retained = await (await request.get(`/api/bookings?ids=${incomeBooking.id}`)).json();
  expect(retained.items[0].projectId).toBe(projectId);
});

test('salary history deep links, form cancellation, focus return and upload retain the month', async ({
  page,
  request,
  baseURL,
}, info) => {
  const captured = await request.post('/api/payslips', {
    headers: { origin: baseURL! },
    data: {
      month: '2024-02',
      kind: 'regular',
      specialType: null,
      grossCents: 300000,
      svCents: 50000,
      taxCents: 40000,
      netCents: 210000,
      bookingId: null,
      receiptId: null,
      lines: [],
    },
  });
  expect(captured.ok()).toBe(true);
  await page.goto('/reports/gehalt?monat=2024-02');
  const history = page.getByRole('link', { name: 'Gehaltszettel-Historie', exact: true });
  await history.click();
  await expect(page).toHaveURL(/gehalt\/historie\?monat=2024-02/);
  await expect(page.getByRole('navigation', { name: 'Brotkrumen' })).toContainText(
    'Gehaltszettel-Historie',
  );
  await inspectReport(page, info, 'payslip-history');
  await page.goBack();
  await expect(page).toHaveURL(/gehalt\?monat=2024-02/);
  await history.click();
  await page.locator('.pp-history-link').first().click();
  const detailUrl = page.url();
  await page.goto(detailUrl);
  await expect(page.locator('.pp-slip')).toContainText('2.100,00');
  const edit = page.getByRole('button', { name: 'Bearbeiten', exact: true });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Gehaltszettel bearbeiten' });
  if (info.project.name === 'desktop') await expect(dialog).toHaveClass(/modal/);
  await dialog.getByLabel('Lohnsteuer', { exact: true }).fill('399,99');
  let confirmations = 0;
  page.on('dialog', async (prompt) => {
    confirmations++;
    await prompt.accept();
  });
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(confirmations).toBe(1);
  await expect(edit).toBeFocused();
  await expect(page).toHaveURL(detailUrl);
  await edit.click();
  await page.goBack();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('link', { name: 'Zurück zum Gehaltsreport' }).click();
  await page.getByRole('button', { name: 'Gehaltszettel hochladen', exact: true }).click();
  const upload = page.getByRole('dialog', { name: 'Gehaltszettel hochladen' });
  await expect(upload.getByLabel('Gehaltszettel-PDF auswählen')).toHaveAttribute(
    'accept',
    'application/pdf,.pdf',
  );
  await upload.getByText('PDF-Passwort eingeben (optional)').click();
  await expect(upload.getByLabel('PDF-Passwort', { exact: true })).toBeVisible();
  await inspectReport(page, info, 'payslip-upload');
  await page.keyboard.press('Escape');
  await expect(upload).not.toBeVisible();
  await expect(page).toHaveURL(/gehalt\?monat=2024-02/);
  await page.goto('/reports/gehalt/historie?monat=2024-02&zettel=missing');
  await expect(page.getByTestId('payroll-report')).toContainText(
    'Dieser Gehaltszettel ist nicht verfügbar.',
  );
});
