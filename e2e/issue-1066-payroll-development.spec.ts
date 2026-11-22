import AxeBuilder from '@axe-core/playwright';
import {
  accounts,
  addExpectedVersion,
  categories,
  categoryGroup,
  createBooking,
  createEntity,
  createExpectedPayment,
  matchOccurrences,
  refreshOccurrences,
  openDatabase,
  payee,
  savePayslip,
  saveWageComponentMapping,
  storeCpi,
  storePayslipWageRead,
  type Db,
} from '@budget/db';
import { monthsBetween, type PayslipInput, type SalaryComponent } from '@budget/domain';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';
import { setTheme } from './theme';

const today = '2026-12-15';
const ctx = { actor: 'synthetic-fixture' };
test.use({ ledgerToday: today });

function seedPay(db: Db) {
  const mappings: [string, SalaryComponent][] = [
    ['100', 'base'],
    ['200', 'special'],
    ['300', 'variable'],
  ];
  for (const [wageCode, component] of mappings)
    saveWageComponentMapping(
      db,
      { employerContactId: null, wageCode, label: null, component },
      ctx,
    );
  const pay = (
    month: string,
    lines: [code: string, amountCents: number][],
    specialType: PayslipInput['specialType'] = null,
  ) => {
    const grossCents = lines.reduce((sum, [, cents]) => sum + cents, 0);
    const svCents = specialType === 'other' ? 1000 : 20000;
    const taxCents = specialType === 'other' ? 2000 : 30000;
    const draft: PayslipInput = {
      month,
      kind: specialType ? 'special' : 'regular',
      specialType,
      grossCents,
      svCents,
      taxCents,
      netCents: grossCents - svCents - taxCents,
      bookingId: null,
      receiptId: null,
      lines: [],
    };
    const saved = savePayslip(db, draft, ctx);
    storePayslipWageRead(
      db,
      saved.id,
      {
        documentType: specialType === 'other' ? 'bonus' : 'payslip',
        periodSource: 'content',
        payoutDate: null,
        draft,
        differenceCents: 0,
        warnings: [],
        statutorySplit: null,
        wageLines: lines.map(([code, amountCents], order) => ({
          code,
          amountCents,
          order,
          section: 'earning',
          label: `Synthetic wage ${code}`,
          referenceMonth: null,
          quantity: null,
          rate: null,
        })),
      },
      { origin: 'intake', receiptId: null },
      ctx,
    );
  };
  pay('2024-10', [['100', 290001]]);
  pay('2024-11', [['999', 290001]]);
  for (const month of monthsBetween('2025-01', '2026-12')) {
    const lines: [string, number][] = [['100', month < '2026-01' ? 300001 : 330001]];
    if (month === '2026-06') lines.push(['300', 12345]);
    pay(month, lines);
  }
  pay('2025-06', [['300', 10000]], 'other');
  pay('2025-06', [['200', 50000]], 'salary13');
  pay('2026-06', [['200', 60000]], 'salary13');
}

function seedPrices(db: Db) {
  accounts.create(
    db,
    {
      id: 'rent-account',
      name: 'Synthetic account',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2025-01-01',
    },
    ctx,
  );
  createEntity(db, categoryGroup, { id: 'rent-group', name: 'Synthetic group' }, ctx);
  createEntity(db, payee, { id: 'rent-payee', name: 'Synthetic payee' }, ctx);
  categories.create(
    db,
    {
      id: 'rent-category',
      groupId: 'rent-group',
      name: 'Synthetic rent',
      kind: 'fixed',
      class: 'need',
      inflationTrailingMean: false,
    },
    ctx,
  );
  createExpectedPayment(
    db,
    {
      id: 'rent',
      name: 'Synthetic rent',
      categoryId: 'rent-category',
      payeeId: 'rent-payee',
      kind: 'outflow',
      rhythm: 'monthly',
      dueDay: 3,
      startDate: '2025-01-01',
    },
    { validFrom: '2025-01-01', amountCents: 10000 },
    ctx,
    today,
  );
  addExpectedVersion(db, 'rent', { validFrom: '2026-01-01', amountCents: 12000 }, ctx, today);
  for (const month of monthsBetween('2025-01', '2026-11')) {
    const date = `${month}-03`;
    const amountCents = month < '2026-01' ? -10000 : -12000;
    createBooking(
      db,
      {
        accountId: 'rent-account',
        date,
        payeeId: 'rent-payee',
        amountCents,
        splits: [{ categoryId: 'rent-category', amountCents }],
      },
      ctx,
    );
  }
  refreshOccurrences(db, today, ctx);
  matchOccurrences(db, today, ctx);
  storeCpi(
    db,
    'synthetic-vpi',
    monthsBetween('2025-01', '2026-12')
      .filter((month) => month !== '2026-10')
      .map((month) => ({ month, indexMicro: month < '2026-01' ? 100_000_000 : 105_000_000 })),
    `${today}T00:00:00Z`,
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`1066 salary development keeps exact component changes, deductions and both real series (${theme})`, async ({
    page,
    request,
    isolatedLedger,
  }, info) => {
    const opened = openDatabase(isolatedLedger.databasePath);
    try {
      seedPay(opened.db);
      seedPrices(opened.db);
    } finally {
      opened.close();
    }
    const result = await request.get('/api/payslips/development?throughMonth=2026-12');
    expect(result.ok()).toBe(true);
    const report = await result.json();
    expect(
      report.years.find((row: { year: string }) => row.year === '2026').development.change,
    ).toMatchObject({
      base: { deltaCents: 360000, deltaBp: 1000 },
      special: { deltaCents: 10000, deltaBp: 2000 },
      variable: { deltaCents: 2345, deltaBp: 2345 },
      total: { deltaCents: 372345 },
    });
    expect(report.variablePay).toMatchObject([
      {
        year: '2025',
        grossCents: 10000,
        attributable: { svCents: 1000, taxCents: 2000, netCents: 7000 },
      },
      { year: '2026', grossCents: 12345, attributable: null },
    ]);
    expect(report.real.official.base.years[1]).toMatchObject({
      months: 11,
      gapCents: 165000,
      realChangeBp: 476,
    });
    expect(report.real.personal.base.years[1]).toMatchObject({
      months: 11,
      gapCents: -330000,
      realChangeBp: -833,
    });

    await page.goto('/reports/gehalt?monat=2026-12');
    expect(await redesignReportsOn(page)).toBe(true);
    const development = page.locator('[data-r8-detail="payroll-development"]');
    await development.locator(':scope > summary').click();
    const base = development.getByTestId('payroll-base-steps');
    const chart = base.getByRole('group', { name: /Monatliches Grundgehalt brutto/ });
    const tooltip = page.locator('.chart-tooltip[role="status"]');
    const years = development.getByRole('table', { name: 'Gehaltsentwicklung je Jahr' });
    const sameMonth = development.getByRole('table', { name: 'Gleicher Monat im Vorjahr' });
    const bonus = development.getByRole('table', { name: 'Bonus und Abzüge' });
    const uncertainty = development.getByRole('table', { name: 'Lücken und unsichere Monate' });
    const official = development.locator('section').filter({
      has: page.getByRole('heading', { name: 'Kaufkraft · Verbraucherpreisindex', exact: true }),
    });
    const personal = development.locator('section').filter({
      has: page.getByRole('heading', { name: 'Kaufkraft · Persönlicher Preisindex', exact: true }),
    });

    await setTheme(page, theme);
    await expect(base.locator('.tbd-fig')).toContainText('3.300,01 €');
    await expect(base.getByRole('row', { name: /Jän 2026/ })).toContainText('+300,00 €');
    await chart.blur();
    await chart.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(tooltip.locator('.chart-tooltip-date')).toHaveText('Dezember 2024');
    await expect(tooltip).toContainText('–');
    await page.keyboard.press('ArrowRight');
    await expect(tooltip.locator('.chart-tooltip-date')).toHaveText('Jänner 2025');
    await expect(tooltip).toContainText('3.000,01 €');
    await page.keyboard.press('Escape');
    const year = years.getByRole('row', { name: /^2026/ });
    await expect(year.getByRole('cell').nth(0)).toHaveText('39.600,12 €+3.600,00 € · +10 %');
    await expect(year.getByRole('cell').nth(1)).toHaveText('600,00 €+100,00 € · +20 %');
    await expect(year.getByRole('cell').nth(2)).toHaveText('123,45 €+23,45 € · +23,45 %');
    await expect(year.getByRole('cell').nth(3)).toContainText('40.323,57 €+3.723,45 €');
    const june = sameMonth.getByRole('row', { name: /^Jun 2026/ });
    await expect(june.getByRole('cell').nth(0)).toHaveText('3.300,01 €3.000,01 €+300,00 € · +10 %');
    await expect(june.getByRole('cell').nth(1)).toHaveText('600,00 €500,00 €+100,00 € · +20 %');
    await expect(june.getByRole('cell').nth(2)).toHaveText('123,45 €100,00 €+23,45 € · +23,45 %');
    await expect(uncertainty.getByRole('row', { name: /^Nov 2024/ })).toContainText(
      '999 · Synthetic wage 999',
    );
    await expect(uncertainty.getByRole('row', { name: /^Dez 2024/ })).toContainText(
      'Gehaltszettel fehlt',
    );
    await expect(bonus.getByRole('row', { name: /^2025/ }).getByRole('cell')).toHaveText([
      '100,00 €',
      '100,00 €',
      '0,28 %',
      '10,00 €',
      '20,00 €',
      '70,00 €',
    ]);
    await expect(bonus.getByRole('row', { name: /^2026/ })).toContainText(
      'Abzüge sind dem Bonus nicht eindeutig zuordenbar.',
    );

    const officialYear = official
      .getByRole('table', { name: /^Grundgehalt · .* je Jahr$/ })
      .getByRole('row', { name: /^2026/ });
    await expect(officialYear.getByRole('cell')).toHaveText([
      'Dez 2026',
      '11',
      '+1.650,00 €',
      '+4,76 %',
    ]);
    const officialTotalYear = official
      .getByRole('table', { name: /^Grundgehalt, Sonderzahlungen und Bonus .* je Jahr$/ })
      .getByRole('row', { name: /^2026/ });
    await expect(officialTotalYear.getByRole('cell')).toHaveText([
      'Dez 2026',
      '11',
      '+2.373,45 €',
      '+4,76 %',
    ]);
    await official.locator('summary').first().click();
    const officialMonths = official.getByRole('table', { name: /^Grundgehalt · .* je Monat$/ });
    await expect(
      officialMonths.getByRole('row', { name: /^Sep 2026/ }).getByRole('cell'),
    ).toHaveText(['110', '105', '104,76', '+150,00 €']);
    await expect(officialMonths.getByRole('row', { name: /^Okt 2026/ })).toContainText(
      'Preisindex für diesen Monat fehlt',
    );
    const personalYear = personal
      .getByRole('table', { name: /^Grundgehalt · .* je Jahr$/ })
      .getByRole('row', { name: /^2026/ });
    await expect(personalYear.getByRole('cell')).toHaveText([
      'Nov 2026',
      '11',
      '−3.300,00 €',
      '−8,33 %',
    ]);
    const personalTotalYear = personal
      .getByRole('table', { name: /^Grundgehalt, Sonderzahlungen und Bonus .* je Jahr$/ })
      .getByRole('row', { name: /^2026/ });
    await expect(personalTotalYear.getByRole('cell')).toHaveText([
      'Nov 2026',
      '11',
      '−2.576,55 €',
      '−8,33 %',
    ]);
    await personal.locator('summary').first().click();
    const personalMonths = personal.getByRole('table', { name: /^Grundgehalt · .* je Monat$/ });
    await expect(
      personalMonths.getByRole('row', { name: /^Okt 2026/ }).getByRole('cell'),
    ).toHaveText(['110', '120', '91,67', '−300,00 €']);
    expect(
      (await new AxeBuilder({ page }).include('[data-r8-detail="payroll-development"]').analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await development.screenshot({ path: info.outputPath(`salary-development-${theme}.png`) });
    await official.locator('summary').first().click();
    await personal.locator('summary').first().click();
    await withShellControls(page, async ({ privacy }) => privacy.click());
    await expect(base.locator('.tbd-fig')).toContainText('•••');
    await expect(development).not.toContainText(/3\.300,01|1\.650,00|4,76 %/);
    await chart.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(tooltip).toContainText('•••');
    await expect(tooltip).not.toContainText('3.000,01');
  });
}
