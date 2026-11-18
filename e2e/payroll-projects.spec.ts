import { payrollSource, type SalaryPayslip } from '@budget/domain';
import { captureSaveControl } from './ledger-helpers';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { inspectReport } from './spending-helpers';
import { toast } from './ledger-helpers';

test.describe.configure({ timeout: 120000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (ids) => {
      for (const id of ids) localStorage.setItem(`budget-report-r8-${id}`, '1');
    },
    [
      'projects-history',
      'projects-side',
      'projects-months',
      'payroll-payout',
      'payroll-history',
      'payroll-months',
      'payroll-years',
      'payroll-special',
    ],
  );
});

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
    'Auszahlung weicht von den zugeordneten Bankanteilen ab: −0,01',
  );
  await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByTestId('payroll-report')).toContainText(
    'Auszahlung stimmt mit den zugeordneten Bankanteilen überein.',
  );
  // Static evidence uses reduced motion so WebKit can settle theme transitions.
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
  const redesigned = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  const projectList = page.locator(
    redesigned ? '.settings-projects-v2 .settings-surface' : '.pp-settings tbody',
  );
  await expect(projectList).toContainText('Synthetisches Nebenprojekt');
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
    amountCents: -62000,
    splits: [{ amountCents: -62000 }],
  });
  if (redesigned)
    await page.getByLabel('Aktionen für Synthetisches Nebenprojekt', { exact: true }).click();
  await page.getByRole('button', { name: 'Archivieren', exact: true }).click();
  await expect(projectList).toContainText('archiviert');
  await page.goto('/reports/projekte?zeitraum=2026-09..2026-09');
  await expect(page.getByTestId('projects-report')).toContainText(
    'Synthetisches Nebenprojekt · archiviert',
  );
  await expect(page.locator('.tbd-fig').first()).toContainText('−120');
  await expect(page.getByTestId('projects-report')).toContainText('500,00');
  await expect(page.locator('.pp-chart .pp-negative').first()).toBeVisible();
  await page.getByText('Buchungen (2)', { exact: true }).click();
  const bookings = page.getByRole('table', { name: 'Buchungen · Synthetisches Nebenprojekt' });
  const rows = bookings.getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('03.09.2026');
  await expect(rows.nth(2)).toContainText('Nebeneinkünfte');
  await expect(rows.nth(2).getByRole('link')).toHaveAttribute(
    'href',
    `/konten/buchungen?buchung=${incomeBooking.id}`,
  );
  await inspectReport(page, info, 'projects');
  await page.goto(`/konten/buchungen?buchung=${incomeBooking.id}`);
  await page.getByRole('button', { name: /^Buchung am 02\.09\. bearbeiten · / }).click();
  const bookingDialog = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(bookingDialog.getByLabel('Projekt', { exact: true })).toHaveValue(projectId);
  await expect(
    bookingDialog.getByLabel('Projekt', { exact: true }).locator('option:checked'),
  ).toHaveText('Synthetisches Nebenprojekt · archiviert');
  await bookingDialog.getByLabel('Notiz', { exact: true }).fill('Synthetische Änderung');
  await captureSaveControl(bookingDialog).click();
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
  await expect(page).toHaveURL(/gehalt\?monat=2024-02/);
  await page.goto('/plan/monat/einnahmen?monat=2024-02');
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
  await expect(page).toHaveURL(/\/plan\/monat\/einnahmen\?monat=2024-02/);
  await page.goto('/reports/gehalt/historie?monat=2024-02&zettel=missing');
  await expect(page.getByTestId('payroll-report')).toContainText(
    'Dieser Gehaltszettel ist nicht verfügbar.',
  );
});

// The API regression covers persisted wage reads; this response fixture exercises their ON view.
test('combined source shows unknown net and editable bank income parts', async ({
  page,
  request,
  baseURL,
}, info) => {
  const accountResponse = await request.post('/api/accounts', {
    headers: { origin: baseURL! },
    data: {
      name: 'Synthetic combined salary',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 0,
    },
  });
  expect(accountResponse.ok()).toBe(true);
  const account = (await accountResponse.json()).account;
  const bookingResponse = await request.post('/api/bookings', {
    headers: { origin: baseURL! },
    data: {
      type: 'booking',
      accountId: account.id,
      date: '2026-11-30',
      amountCents: 590000,
      splits: [
        { amountCents: 580000, incomeTypeId: 'income-salary' },
        { amountCents: 10000, incomeTypeId: 'income-refund' },
      ],
    },
  });
  expect(bookingResponse.ok()).toBe(true);
  const bookingId = (await bookingResponse.json()).id;
  const draft = {
    month: '2026-11',
    kind: 'regular',
    specialType: null,
    grossCents: 800000,
    svCents: 120000,
    taxCents: 100000,
    netCents: 590000,
    bookingId,
    receiptId: null,
    lines: [{ section: 'reimbursement', label: 'Synthetic expenses', amountCents: 10000 }],
  };
  const created = await request.post('/api/payslips', {
    headers: { origin: baseURL! },
    data: draft,
  });
  expect(created.ok()).toBe(true);
  const id = (await created.json()).payslip.id;
  const slip: SalaryPayslip = {
    ...draft,
    id,
    kind: 'regular',
    employerContactId: null,
    lines: [{ section: 'reimbursement', label: 'Synthetic expenses', amountCents: 10000 }],
    wage: {
      lineCheck: 'ok',
      split: null,
      lines: [
        {
          code: '100',
          label: 'Synthetic base',
          section: 'earning',
          amountCents: 400000,
          referenceMonth: null,
        },
        {
          code: '200',
          label: 'Synthetic special',
          section: 'earning',
          amountCents: 400000,
          referenceMonth: null,
        },
        {
          code: '300',
          label: 'Synthetic expenses',
          section: 'reimbursement',
          amountCents: 10000,
          referenceMonth: null,
        },
      ],
    },
  };
  await page.route('**/api/payslips?month=2026-11', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.sources = [payrollSource(slip, [])];
    data.years = data.years.map((row: { year: string }) => ({ ...row, specialGrossCents: null }));
    data.salaries[10] = {
      ...data.salaries[10],
      netCents: null,
      salaryNetCents: null,
      netSplitUnknown: true,
    };
    data.timeline = data.timeline.map((row: { month: string }) => ({
      ...row,
      netSplitUnknown: row.month === '2026-11',
    }));
    await route.fulfill({ response, json: data });
  });
  await page.goto('/reports/gehalt?monat=2026-11');
  await expect(page.getByText(/Nettoaufteilung aus der Quelle nicht bestimmbar/)).toBeVisible();
  await expect(page.locator('.pp-warning').filter({ hasText: '200' })).toContainText(
    'Synthetic special',
  );
  await expect(
    page.getByText(/^Bankanteil \u00b7/).filter({ hasText: 'Erstattung' }),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: /Nov.*nicht erfasst/ })).toContainText('100,00');
  // Months carry the full pay of the combined slip (#1207): the chart shows it, no split is invented.
  await expect(page.locator('.pp-dot')).toHaveCount(1);
  await page.getByText('Einnahmenarten der Bankanteile bearbeiten', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Einnahmenart Bankanteil 1', exact: true })
    .selectOption('income-special');
  await page.getByRole('button', { name: 'Einnahmenarten speichern', exact: true }).click();
  await expect(
    page
      .getByText(/^Bankanteil \u00b7/)
      .filter({ hasText: 'Sonderzahlung' })
      .first(),
  ).toBeVisible();
  const updated = await (await request.get(`/api/bookings/${bookingId}`)).json();
  expect(updated.booking.amountCents).toBe(590000);
  expect(
    updated.booking.splits.map((part: { amountCents: number; incomeTypeId: string }) => [
      part.amountCents,
      part.incomeTypeId,
    ]),
  ).toEqual([
    [580000, 'income-special'],
    [10000, 'income-refund'],
  ]);
  await toast(page).getByRole('button', { name: 'R\u00fcckg\u00e4ngig', exact: true }).click();
  await expect(
    page
      .getByText(/^Bankanteil \u00b7/)
      .filter({ hasText: 'Laufendes Gehalt' })
      .first(),
  ).toBeVisible();
  // Keep the light/dark accessibility checks independent of transition scheduling.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await inspectReport(page, info, 'salary-combined-source');
});
