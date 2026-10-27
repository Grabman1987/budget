import AxeBuilder from '@axe-core/playwright';
import { createBooking, INCOME_TYPES, openDatabase } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17' });
const period = '2026-08..2026-08';
const path = '/reports/einnahmen-ausgaben';
function seed(databasePath: string) {
  const opened = openDatabase(databasePath);
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('giro','Synthetic budget','checking','budget',1,'2026-08-01'),('depot','Synthetic depot','brokerage','investment',0,'2026-08-01');
      INSERT INTO category_group (id,name) VALUES ('g','Synthetic group');
      INSERT INTO category (id,group_id,name,class,kind) VALUES ('need','g','Synthetic need','need','variable'),('want','g','Synthetic want','want','variable'),('future','g','Synthetic future','future','saving');
      INSERT INTO project (id,name) VALUES ('a','Synthetic same 123,45 €'),('b','Synthetic same 123,45 €'),('empty','Synthetic empty');
    `);
    const book = (
      projectId: string,
      amountCents: number,
      split: { incomeTypeId?: string; categoryId?: string },
      accountId = 'giro',
    ) =>
      createBooking(
        opened.db,
        {
          accountId,
          date: '2026-08-15',
          projectId,
          amountCents,
          splits: [{ ...split, amountCents }],
        },
        { actor: 'synthetic-621' },
      );
    const salary = book('a', 100001, { incomeTypeId: INCOME_TYPES.salary.id });
    book('b', 200002, { incomeTypeId: INCOME_TYPES.salary.id });
    book('a', -10000, { categoryId: 'need' });
    book('a', 500, { categoryId: 'need' });
    book('a', -3000, { categoryId: 'future' });
    book('b', -20000, { categoryId: 'want' });
    book('a', 700, { incomeTypeId: INCOME_TYPES.capital.id });
    book('a', 1300, { incomeTypeId: INCOME_TYPES.capital.id }, 'depot');
    opened.sqlite.exec("UPDATE project SET archived_at='2026-09-01' WHERE id='b'");
    return salary;
  } finally {
    opened.close();
  }
}
const overviewNet = (page: Page) =>
  page
    .locator('.income-expense-report tbody tr')
    .filter({
      has: page.getByRole('rowheader', { name: 'Netto (Einnahmen − Ausgaben)', exact: true }),
    })
    .getByRole('link')
    .nth(0);
async function inspect(page: Page, info: TestInfo, label: string) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controls = page.getByRole('region', { name: 'Ansicht und Projekt', exact: true });
  await expect(controls).toBeVisible();
  const layout = await controls.evaluate((element) => {
    const rect = (node: Element) => {
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        height: box.height,
      };
    };
    const header = document.querySelector('.titleblock-report')!;
    return {
      header: rect(header),
      controls: rect(element),
      views: rect(element.querySelector('.report-view-switch')!),
      project: rect(element.querySelector('.report-project-select')!),
      labels: Array.from(element.querySelectorAll('button')).map((button) => {
        const range = document.createRange();
        range.selectNodeContents(button);
        const text = range.getBoundingClientRect();
        return {
          label: button.textContent,
          button: rect(button),
          text: {
            left: text.left,
            right: text.right,
            top: text.top,
            bottom: text.bottom,
            width: text.width,
            height: text.height,
          },
        };
      }),
    };
  });
  expect(layout.controls.top).toBeGreaterThanOrEqual(layout.header.bottom);
  expect(
    layout.views.right <= layout.project.left ||
      layout.project.right <= layout.views.left ||
      layout.views.bottom <= layout.project.top ||
      layout.project.bottom <= layout.views.top,
  ).toBe(true);
  expect(layout.labels.slice(0, 3).map((entry) => entry.label)).toEqual([
    'Einnahmen',
    'Einnahmen und Ausgaben',
    'Cashflow',
  ]);
  for (const entry of layout.labels) {
    expect(entry.text.width).toBeGreaterThan(0);
    expect(entry.text.height).toBeGreaterThan(0);
    expect(entry.text.left).toBeGreaterThanOrEqual(entry.button.left);
    expect(entry.text.right).toBeLessThanOrEqual(entry.button.right);
    expect(entry.text.top).toBeGreaterThanOrEqual(entry.button.top);
    expect(entry.text.bottom).toBeLessThanOrEqual(entry.button.bottom);
  }
  for (let first = 0; first < layout.labels.length; first++) {
    for (let second = first + 1; second < layout.labels.length; second++) {
      const a = layout.labels[first]!.text;
      const b = layout.labels[second]!.text;
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(
        true,
      );
    }
  }
  if (info.project.name === 'desktop') expect(layout.header.height).toBe(64);
  if (info.project.name !== 'desktop') {
    for (const control of await page
      .locator('.report-income-controls button:visible, .report-income-controls select:visible')
      .all()) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  }
  await page.screenshot({ path: info.outputPath(`${label}.png`), animations: 'disabled' });
}
async function privacy(page: Page, phone: boolean) {
  const profile = page.locator('.m-profile > summary');
  if (phone) await profile.click();
  await page.getByRole('button', { name: 'Beträge verbergen', exact: true }).click();
  if (phone) await profile.click();
}

test('621 fixed August views equal each former report to literal cents without replacing distinct net meanings', async ({
  page,
  isolatedLedger,
}, info) => {
  seed(isolatedLedger.databasePath);
  await page.goto('/reports/einnahmen?monat=2026-08');
  await expect(page.getByTestId('income-total')).toHaveText('3.000,03 €');
  await expect(page.getByTestId('income-capital-total')).toHaveText('7,00 €');
  await page.goto(`/reports/cashflow?zeitraum=${period}`);
  await expect(page.getByTestId('cf-figure')).toHaveText('2.705,03 €');
  for (const theme of ['light', 'dark']) {
    await page.goto(`${path}?monat=2026-08&zeitraum=${period}`);
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await expect(overviewNet(page)).toHaveText('2.675,03 €');
    for (const [view, active, figure] of [
      ['Einnahmen', '.income-report', 'income-total'],
      ['Cashflow', '.cashflow-report', 'cf-figure'],
      ['Einnahmen und Ausgaben', '.income-expense-report', ''],
    ] as const) {
      await page
        .getByRole('group', { name: 'Ansicht von Einnahmen und Cashflow' })
        .getByRole('button', { name: view, exact: true })
        .click();
      await expect(page.locator(active)).toBeVisible();
      await expect(
        page.locator('.income-report, .cashflow-report, .income-expense-report'),
      ).toHaveCount(1);
      expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
      expect(new URL(page.url()).searchParams.get('zeitraum')).toBe(period);
      if (figure)
        await expect(page.getByTestId(figure)).toHaveText(
          view === 'Einnahmen' ? '3.000,03 €' : '2.705,03 €',
        );
      else await expect(overviewNet(page)).toHaveText('2.675,03 €');
      await inspect(page, info, `legacy-parity-${view}-${theme}`);
    }
    await page.reload();
    await expect(overviewNet(page)).toHaveText('2.675,03 €');
    await expect(
      page.getByRole('link', {
        name: 'Vollständige Projekt-Ergebnisse und Nebeneinkünfte',
        exact: true,
      }),
    ).toHaveAttribute('href', '/reports/projekte');
  }
});

test('621 project identity stays scoped through every view, CSV, sources, privacy and invalid/deleted states', async ({
  page,
  isolatedLedger,
}, info) => {
  const salary = seed(isolatedLedger.databasePath);
  const phone = info.project.name !== 'desktop';
  for (const theme of ['light', 'dark']) {
    await page.goto(`${path}?monat=2026-08&zeitraum=${period}&darstellung=income&projekt=a`);
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await expect(page.getByTestId('income-total')).toHaveText('1.000,01 €');
    await expect(page.getByTestId('income-expected')).toHaveCount(0);
    await expect(
      page.getByText(/Erwartete Zahlungen sind keinem Projekt zugeordnet/),
    ).toBeVisible();
    const filter = page.getByRole('combobox', { name: 'Projektfilter', exact: true });
    await expect(filter).toBeEnabled();
    await expect(filter).toHaveValue('a');
    expect(
      await filter
        .locator('option')
        .evaluateAll((options) => options.map((option) => option.getAttribute('value')).sort()),
    ).toEqual(['', 'a', 'b', 'empty']);
    await privacy(page, phone);
    await expect(page.getByTestId('income-total')).toContainText('•••');
    await expect(page.getByTestId('income-total')).not.toContainText('1.000,01');
    await expect(page.locator('.report-project-note')).not.toContainText('123,45');
    await privacy(page, phone);
    await expect(page.getByTestId('income-total')).toHaveText('1.000,01 €');
    await inspect(page, info, `project-income-${theme}`);
    await page
      .getByRole('group', { name: 'Ansicht von Einnahmen und Cashflow' })
      .getByRole('button', { name: 'Einnahmen und Ausgaben', exact: true })
      .click();
    await expect(overviewNet(page)).toHaveText('875,01 €');
    await expect(page.locator('.report-project-note')).toContainText(
      'Zuweisungen, Geldalter, Vermögen und Regelziele sind nicht projektbezogen verfügbar.',
    );
    const downloadEvent = page.waitForEvent('download');
    await page
      .locator('.income-expense-report')
      .getByRole('button', { name: 'CSV', exact: true })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('einnahmen-ausgaben-projekt-a-2026-08-2026-08.csv');
    const csv = readFileSync((await download.path())!, 'utf8');
    expect(csv).toContain('1000,01');
    expect(csv).toContain('875,01');
    expect(csv).not.toContain('2000,02');
    await inspect(page, info, `project-overview-${theme}`);
    await page
      .getByRole('group', { name: 'Ansicht von Einnahmen und Cashflow' })
      .getByRole('button', { name: 'Cashflow', exact: true })
      .click();
    await expect(page.getByTestId('cf-figure')).toHaveText('905,01 €');
    await expect(page.locator('.report-project-note')).toHaveAttribute('data-project-id', 'a');
    await inspect(page, info, `project-cashflow-${theme}`);
  }
  await page.getByRole('combobox', { name: 'Projektfilter', exact: true }).selectOption('b');
  await expect(page.getByTestId('cf-figure')).toHaveText('1.800,02 €');
  await expect(page.locator('.report-project-note')).toContainText('archiviert');
  await page.getByRole('combobox', { name: 'Projektfilter', exact: true }).selectOption('empty');
  await expect(page.getByTestId('cf-figure')).toHaveText('0,00 €');
  await page.goto(`${path}?monat=2026-08&zeitraum=${period}&darstellung=overview&projekt=a`);
  const household = page
    .locator('.income-expense-report tbody tr')
    .filter({ has: page.getByRole('rowheader', { name: 'Einnahmen · Haushalt', exact: true }) })
    .getByRole('link')
    .nth(0);
  await household.click();
  await expect(page.getByTestId('income-expense-sources').getByRole('link')).toHaveCount(1);
  await page.reload();
  const source = page.getByTestId('income-expense-sources').getByRole('link');
  const bookingUrl = new URL((await source.getAttribute('href'))!, isolatedLedger.origin);
  expect(bookingUrl.searchParams.get('buchung')).toBe(salary);
  expect(bookingUrl.searchParams.get('von')).toBe('2026-08-01');
  expect(bookingUrl.searchParams.get('bis')).toBe('2026-08-31');
  const back = new URL(bookingUrl.searchParams.get('ruecksprung')!, isolatedLedger.origin);
  expect(back.searchParams.get('projekt')).toBe('a');
  expect(back.searchParams.get('monat')).toBe('2026-08');
  expect(back.searchParams.get('zeitraum')).toBe(period);
  await source.click();
  await page.getByRole('link', { name: 'Zurück zur Report-Zelle', exact: true }).click();
  await expect(page.getByTestId('income-expense-sources')).toBeVisible();
  await page.getByRole('link', { name: 'Zurück zu Einnahmen und Ausgaben', exact: true }).click();
  await expect(overviewNet(page)).toHaveText('875,01 €');
  expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
  await page.goto(`${path}?monat=2026-08&zeitraum=${period}&darstellung=income&projekt=a`);
  await expect(page.getByTestId('income-total')).toHaveText('1.000,01 €');
  const projectFilter = page.getByRole('combobox', { name: 'Projektfilter', exact: true });
  await projectFilter.selectOption('b');
  await expect(page.getByTestId('income-total')).toHaveText('2.000,02 €');
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    opened.sqlite.exec("UPDATE project SET deleted_at='2026-09-16' WHERE id='a'");
  } finally {
    opened.close();
  }
  // A same-mounted selector change must also revalidate the still-cached deleted A.
  let releaseSelected!: () => void;
  const selectedHeld = new Promise<void>((resolve) => {
    releaseSelected = resolve;
  });
  await page.route('**/api/reports/month/income?*', async (route) => {
    await selectedHeld;
    await route.continue();
  });
  const selectedReread = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/reports/month/income' && url.searchParams.get('projectId') === 'a'
    );
  });
  await projectFilter.selectOption('a');
  try {
    await selectedReread;
    await expect(page.getByTestId('income-total')).toHaveCount(0);
    await expect(page.locator('.report-project-note')).toHaveCount(0);
  } finally {
    releaseSelected();
  }
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('income-total')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('projekt')).toBe('a');
  await page.unroute('**/api/reports/month/income?*');
  await page
    .getByRole('group', { name: 'Ansicht von Einnahmen und Cashflow' })
    .getByRole('button', { name: 'Cashflow', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  // A fresh cached 100001-cent result must stay hidden while its deleted scope is reread.
  let releaseIncome!: () => void;
  const incomeHeld = new Promise<void>((resolve) => {
    releaseIncome = resolve;
  });
  await page.route('**/api/reports/month/income?*', async (route) => {
    await incomeHeld;
    await route.continue();
  });
  const incomeReread = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/reports/month/income' && url.searchParams.get('projectId') === 'a'
    );
  });
  await page
    .getByRole('group', { name: 'Ansicht von Einnahmen und Cashflow' })
    .getByRole('button', { name: 'Einnahmen', exact: true })
    .click();
  try {
    await incomeReread;
    await expect(page.getByTestId('income-total')).toHaveCount(0);
    await expect(page.locator('.report-project-note')).toHaveCount(0);
  } finally {
    releaseIncome();
  }
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('income-total')).toHaveCount(0);
  await expect(page.locator('.report-project-note')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('projekt')).toBe('a');
  let moneyReads = 0;
  page.on('request', (request) => {
    if (
      /\/api\/(cashflow|reports\/month\/income|report-tables\/income-expense)(\?|$)/.test(
        request.url(),
      )
    )
      moneyReads++;
  });
  await page.goto(`${path}?darstellung=income&monat=2026-08&projekt=${'x'.repeat(65)}`);
  await expect(page.getByRole('alert')).toContainText('Der Projektfilter ist ungültig.');
  expect(moneyReads).toBe(0);
  await expect(
    page.locator('.income-report, .cashflow-report, .income-expense-report'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Alle Projekte zeigen', exact: true }).click();
  await expect(page.getByTestId('income-total')).toHaveText('3.000,03 €');
});
