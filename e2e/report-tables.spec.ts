import AxeBuilder from '@axe-core/playwright';
import {
  buildTableRows,
  buildYearView,
  categoryOverview,
  cents,
  formatEuro,
  formatPercent,
  monthClassSpending,
  monthConsumption,
  monthHouseholdIncome,
  monthIncomeOfRole,
  reportPeriodMonths,
  savingsOverview,
  tableCsv,
  tableRowTotal,
  type TableMeta,
} from '@budget/domain';
import type { Page, TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { ReportTables } from '../apps/web/src/reports/table-reports-api';
import { sampleTest as test, expect } from './sample';

/**
 * Reports 1.5 Jahresansicht, 1.6 Kategorieübersicht, 1.7 Sparquote und Geldalter and 1.8
 * Gesamttabelle on the seeded sample server (17.09.2026, August is the last full month). The
 * expected figures are derived from the report's own API answer with the shared domain functions
 * and compared with what the page shows, so a change in the ledger read cannot hide in the page.
 */

// The ledger read behind every report is real work on the sample ledger; the machine may be busy.
test.describe.configure({ timeout: 90_000 });

async function facts(page: Page, netWorth = false): Promise<ReportTables> {
  const response = await page.request.get(
    `/api/report-tables/months${netWorth ? '?netWorth=1' : ''}`,
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as ReportTables;
}

/** Opens a report and waits for its first table (the first visit loads the report chunk). */
async function open(page: Page, path: string) {
  await page.goto(path);
  if (path.startsWith('/reports/gesamttabelle')) {
    const disclosure = page.getByText('Alle Monate: Nettovermögen und CSV', { exact: true });
    await expect(disclosure).toBeVisible({ timeout: 20_000 });
    const box = (await disclosure.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    await disclosure.click();
    await expect(page.locator('table.rg-all')).toBeVisible({ timeout: 20_000 });
    return;
  }
  await expect(page.locator('table.rtable').first()).toBeVisible({ timeout: 20_000 });
}

const whole = (value: number) => formatEuro(cents(value), { cents: false });
const plain = (value: number) => whole(value).replace(/ €$/, '');
/** "1.234 €" / "−56 €" / "+10 €" as whole euros. */
const euros = (text: string) => Number(text.replace(/[^\d−-]/g, '').replace('−', '-'));

/** Axe in both themes, no page-level horizontal overflow, a screenshot kept as evidence. */
async function inspect(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('main')
      .analyze();
    const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      bad.map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(' | ')}`,
      ),
      `${name} ${scheme}`,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      path: info.outputPath(`${name}-${scheme}.png`),
    });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

// ---------------------------------------------------------------------------------------------
// 1.5 Jahresansicht
// ---------------------------------------------------------------------------------------------
test.describe('1.5 Jahresansicht', () => {
  const row = (page: Page, key: string) => page.getByTestId('template-year').locator(`[data-template-row="${key}"]`);
  test('retains every original year cell, household/consumption totals and missing-month distinction', async ({ page }, info) => {
    const data = await facts(page);
    const view = buildYearView(data.months, 2026, data.lastFullMonth);
    const rows = buildTableRows(view.months, data, true);
    await open(page, '/reports/jahresansicht');
    await expect(page.getByRole('combobox', { name: 'Jahr', exact: true })).toHaveValue('2026');
    for (const expected of rows) {
      const cells = await row(page, expected.key).locator('td').allInnerTexts();
      for (let i = 0; i < 12; i++) {
        const value = expected.vals[i];
        const text = cells[i]?.replace(/\s*[↑↓]$/, '').trim();
        expect(text, `${expected.key} month ${i}`).toBe(value === null || value === undefined ? '–' : expected.kind === 'pct' ? `${value < 0 ? '−' : ''}${Math.round(Math.abs(value) / 100)} %` : formatEuro(cents(value)));
      }
      const sum = tableRowTotal(expected);
      expect(cells[12]?.replace(/\s*[↑↓]$/, '').trim(), expected.key).toBe(sum === null ? '–' : formatEuro(cents(sum)));
    }
    const have = view.months.flatMap((m) => m ? [m] : []);
    const income = have.reduce((a, m) => a + monthHouseholdIncome(m, data), 0);
    const consumption = have.reduce((a, m) => a + monthConsumption(m, data), 0);
    const future = have.reduce((a, m) => a + monthClassSpending(m, data, 'future'), 0);
    await expect(row(page, 'rest').locator('td').nth(12)).toContainText(formatEuro(cents(income - consumption - future)));
    await expect(row(page, 'sq').locator('td').nth(8)).toHaveText('–');
    await expect(page.getByRole('rowheader', { name: 'Kapitalerträge (nicht in Einnahmen)' })).toBeVisible();
    expect(rows.find((r) => r.key.startsWith('memo:'))).toBeDefined();
    expect(view.pairs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    await inspect(page, info, 'jahresansicht');
  });
  test('year selection keeps whole-year columns and absent source months through reload', async ({ page }) => {
    const data = await facts(page);
    await open(page, '/reports/jahresansicht');
    for (const [year, pairs] of [['2025', 12], ['2024', 3], ['2023', 0]] as const) {
      await page.getByRole('combobox', { name: 'Jahr', exact: true }).selectOption(year);
      await expect(page.getByTestId('template-year').locator(`th[title="Jänner ${year}"]`)).toBeVisible();
      expect(buildYearView(data.months, Number(year), data.lastFullMonth).pairs).toHaveLength(pairs);
    }
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Jahr', exact: true })).toHaveValue('2023');
    const cells = await row(page, 'inc').locator('td').allInnerTexts();
    expect(cells.slice(0, 9).every((t) => t.trim() === '–')).toBe(true);
    expect(cells[9]?.trim()).not.toBe('–');
  });
  test('accepted year template includes category rows without changing any group amount', async ({ page }) => {
    const data = await facts(page);
    const rows = buildTableRows(buildYearView(data.months, 2026, data.lastFullMonth).months, data, false);
    await open(page, '/reports/jahresansicht');
    await expect(page.getByRole('rowheader', { name: 'Wohnen', exact: true })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Miete', exact: true })).toBeVisible();
    for (const expected of rows.filter((r) => r.kind === 'group')) {
      const cells = await row(page, expected.key).locator('td').allInnerTexts();
      expected.vals.forEach((v, i) => expect(cells[i]?.replace(/\s*[↑↓]$/, '').trim()).toBe(v === null ? '–' : formatEuro(cents(v))));
    }
  });
});

// The owner517 category template replaces the multicategory overview; same category/month facts.
test.describe('1.6 Kategorie im Verlauf', () => {
  test('every selected source category retains its exact months, sum and rounded average', async ({ page }, info) => {
    const data = await facts(page);
    const window = reportPeriodMonths('YTD', data.lastFullMonth!, data.firstMonth!);
    const overview = categoryOverview(data.months, data, window, data.lastFullMonth);
    await open(page, '/reports/kategorien');
    for (const expected of overview.rows.slice(0, 6)) {
      await page.getByRole('combobox', { name: 'Kategorie', exact: true }).selectOption(expected.category.id);
      const row = page.getByTestId('template-category').locator(`[data-template-row="cat:${expected.category.id}"]`);
      await expect(row.getByRole('rowheader')).toHaveText(expected.category.name);
      const cells = await row.locator('td').allInnerTexts();
      expected.history.forEach((point, i) => expect(cells[i]?.replace(/\s*[↑↓]$/, '').trim()).toBe(point.spentCents === null ? '–' : formatEuro(cents(point.spentCents))));
      expect(cells[window.length]?.replace(/\s*[↑↓]$/, '').trim()).toBe(formatEuro(cents(expected.sumCents)));
      expect(cells[window.length + 1]?.trim()).toBe(formatEuro(cents(expected.avgCents)));
    }
    const shareSum = overview.rows.reduce((a, r) => a + (r.shareBp ?? 0), 0);
    expect(Math.abs(shareSum - 10_000)).toBeLessThanOrEqual(overview.rows.length);
    await inspect(page, info, 'kategorien');
  });
  test('category identity, monthly peak and source-cell inspection survive keyboard selection and reload', async ({ page }) => {
    const data = await facts(page);
    const window = reportPeriodMonths('YTD', data.lastFullMonth!, data.firstMonth!);
    const overview = categoryOverview(data.months, data, window, data.lastFullMonth);
    const first = overview.rows[0]!;
    const highest = first.history.reduce((a, h) => (h.spentCents ?? 0) > (a.spentCents ?? 0) ? h : a);
    await open(page, '/reports/kategorien');
    const picker = page.getByRole('combobox', { name: 'Kategorie', exact: true });
    await picker.selectOption(first.category.id);
    await picker.focus();
    await expect(picker).toBeFocused();
    const cell = page.getByTestId('template-category').locator(`[data-template-column="${highest.month}"]`);
    await expect(cell).toContainText(formatEuro(cents(highest.spentCents ?? 0)));
    await cell.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('template-sources')).toContainText(formatEuro(cents(highest.spentCents ?? 0)));
    await page.reload();
    await expect(picker).toHaveValue(first.category.id);
    await expect(page.getByTestId('template-sources')).toBeVisible();
    await page.getByRole('button', { name: 'Buchungen schließen', exact: true }).click();
    await expect(page.getByTestId('template-sources')).toHaveCount(0);
  });
  test('period changes preserve source category sums, including all available history', async ({ page }) => {
    const data = await facts(page);
    const id = data.categories[0]!.id;
    await open(page, `/reports/kategorien?kategorien=${encodeURIComponent(JSON.stringify([id]))}`);
    for (const period of ['1J', 'Alles'] as const) {
      await page.getByRole('group', { name: 'Zeitraum', exact: true }).getByRole('button', { name: period, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`zeitraum=${period}`));
      const window = reportPeriodMonths(period, data.lastFullMonth!, data.firstMonth!);
      const overview = categoryOverview(data.months, data, window, data.lastFullMonth);
      const expected = overview.rows.find((r) => r.category.id === id)!;
      const row = page.getByTestId('template-category').locator(`[data-template-row="cat:${id}"]`);
      await expect(row.locator('td').nth(window.length)).toContainText(formatEuro(cents(expected.sumCents)));
      if (period === 'Alles') expect(expected.previousCents).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------------------------// 1.7 Sparquote und Geldalter
// ---------------------------------------------------------------------------------------------
test.describe('1.7 Sparquote und Geldalter', () => {
  test('Sparquote is household income only, the chain adds up, Geldalter and the years agree', async ({
    page,
  }, info) => {
    const data = await facts(page);
    const window = reportPeriodMonths('YTD', data.lastFullMonth!, data.firstMonth!);
    const overview = savingsOverview(data.months, data, window, data.lastFullMonth);
    await open(page, '/reports/sparquote');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Sparquote · Jän–Aug 2026' }),
    ).toBeVisible();
    await expect(page.getByTestId('savings-rate')).toHaveText(
      formatPercent(overview.window.rateBp!),
    );

    const chain = page.getByRole('group', { name: 'Maßkette Sparquote' });
    const [income, consumption, saved] = (await chain.locator('.ct-val').allTextContents()).map(
      euros,
    ) as [number, number, number];
    expect(Math.abs(income - Math.round(overview.window.incomeCents / 100))).toBeLessThanOrEqual(2);
    expect(income - consumption).toBe(saved);

    // Kapitalerträge are named and not in the Sparquote
    const capital = window.reduce((a, month) => {
      const m = data.months.find((x) => x.month === month)!;
      return a + monthIncomeOfRole(m, data, 'capital');
    }, 0);
    expect(capital).toBeGreaterThan(0);
    await expect(page.getByTestId('capital-note')).toContainText(
      `Kapitalerträge im Zeitraum: ${whole(capital)}`,
    );
    await expect(page.getByTestId('capital-note')).toContainText('nicht in der Sparquote');
    await expect(page.getByTestId('savings-chart')).toBeVisible();
    await expect(page.getByTestId('savings-chart').locator('.bar-neg-ink').first()).toBeVisible();
    await expect(page.locator('.tbd-state').first()).toContainText('Ziel ≥ 20 % (R01)');

    // Geldalter: the last known month end value, the goal from rule R03
    const known = overview.moneyAge.filter((p) => p.days !== null);
    const now = known[known.length - 1]!.days!;
    await expect(page.getByTestId('money-age')).toContainText(String(now));
    await expect(page.getByRole('group', { name: 'Maßkette Geldalter' })).toContainText('Ziel');
    await expect(page.getByTestId('money-age-chart')).toBeVisible();
    await expect(page.locator('.tbd-state').nth(1)).toContainText('Ziel ≥ 30 Tage (R03)');

    // Je Jahr: one row per calendar year with a full month
    const yearRows = page.locator('section[aria-labelledby="years-title"] tbody tr');
    await expect(yearRows).toHaveCount(overview.years.length);
    for (const [i, y] of overview.years.entries()) {
      const cells = await yearRows.nth(i).locator('td').allTextContents();
      expect(cells[0]?.trim()).toBe(whole(y.incomeCents));
      expect(cells[1]?.trim()).toBe(whole(y.consumptionCents));
      expect(cells[3]?.trim()).toBe(formatPercent(y.rateBp!));
    }
    await expect(yearRows.first()).toContainText('2023');
    await expect(yearRows.first()).toContainText('3 Monate');
    await inspect(page, info, 'sparquote');
  });

  test('the Zeitraum changes the window; short windows still chart twelve months', async ({
    page,
  }) => {
    const data = await facts(page);
    await open(page, '/reports/sparquote');
    await page.getByRole('button', { name: '1M' }).click();
    const window = reportPeriodMonths('1M', data.lastFullMonth!, data.firstMonth!);
    const overview = savingsOverview(data.months, data, window, data.lastFullMonth);
    expect(overview.series).toHaveLength(12);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Sparquote · August 2026' }),
    ).toBeVisible();
    await expect(page.getByTestId('savings-rate')).toHaveText(
      formatPercent(overview.window.rateBp!),
    );
    await expect(page.getByTestId('savings-chart')).toBeVisible();
    await page.getByRole('button', { name: 'Alles' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Sparquote · seit Okt 23' }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
// 1.8 Gesamttabelle
// ---------------------------------------------------------------------------------------------
test.describe('1.8 Gesamttabelle', () => {
  test('all 36 months with the running month marked, net worth at every month end', async ({
    page,
  }, info) => {
    const data = await facts(page, true);
    expect(data.netWorth).toBe('ok');
    await open(page, '/reports/gesamttabelle');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Alle Monate seit Okt 23' }),
    ).toBeVisible();
    await expect(page.getByText('Datenbasis: Okt 23 bis Sep 26')).toBeVisible();
    const heads = page.locator('table.rg-all thead th');
    await expect(heads).toHaveCount(1 + 36);
    await expect(heads.nth(1)).toHaveText('Okt 23');
    await expect(heads.last()).toHaveText('Sep 26*');
    await expect(page.getByText('* September 2026 läuft noch')).toBeVisible();

    const nw = await page.locator('table.rg-all tbody tr').last().locator('td').allTextContents();
    expect(nw).toHaveLength(36);
    data.months.forEach((m, i) => expect(nw[i]?.trim(), m.month).toBe(plain(m.netWorthCents!)));
    expect(nw[35]?.trim()).toBe('84.730');

    // the table starts scrolled to the running month
    const scroller = page.locator('.ex-total-history').getByRole('region', { name: /Gesamttabelle/ });
    const scrolled = await scroller.evaluate(
      (el) => el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    );
    expect(scrolled).toBe(true);
    await inspect(page, info, 'gesamttabelle');
  });

  test('the CSV has exactly the rows and columns of the table', async ({ page }) => {
    const data = await facts(page, true);
    const meta = data as TableMeta;
    await open(page, '/reports/gesamttabelle');
    for (const detail of [false, true]) {
      if (detail) await page.getByRole('button', { name: 'Kategorien' }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTestId('csv-download').click(),
      ]);
      expect(download.suggestedFilename()).toBe('gesamttabelle-2023-10-2026-09.csv');
      const path = await download.path();
      const raw = readFileSync(path, 'utf8');
      expect(raw.charCodeAt(0)).toBe(0xfeff); // byte order mark for Excel
      const lines = raw.slice(1).split('\r\n');

      const rows = [
        ...buildTableRows(data.months, meta, detail),
        {
          key: 'nw',
          label: 'Nettovermögen am Monatsende',
          kind: 'level' as const,
          level: 0 as const,
          good: null,
          vals: data.months.map((m) => m.netWorthCents),
        },
      ];
      const heads = data.months.map(
        (m, i) =>
          `${['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][Number(m.month.slice(5)) - 1]} ${m.month.slice(2, 4)}${i === 35 ? '*' : ''}`,
      );
      expect(raw.slice(1)).toBe(tableCsv(rows, heads));

      // and the table on screen has the same rows: label and first month cell
      const tableRows = page.locator('table.rg-all tbody tr');
      await expect(tableRows).toHaveCount(rows.length);
      expect(lines).toHaveLength(rows.length + 1);
      const incomeLine = lines.find((l) => l.startsWith('"Einnahmen"'))!;
      const firstIncome = data.months[0]!;
      expect(incomeLine.split(';')[1]).toBe(
        `${Math.trunc(monthHouseholdIncome(firstIncome, meta) / 100)},${String(monthHouseholdIncome(firstIncome, meta) % 100).padStart(2, '0')}`,
      );
      // the memo rows are in the file under their own labels
      expect(lines.some((l) => l.startsWith('"Kapitalerträge (nicht in Einnahmen)"'))).toBe(true);
      expect(lines[0]).toContain('"Sep 26*"');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// States: error, empty, unavailable net worth, loading
// ---------------------------------------------------------------------------------------------
test.describe('states', () => {
  const empty = {
    asOf: '2026-09-17',
    currentMonth: '2026-09',
    firstMonth: null,
    lastFullMonth: null,
    categories: [],
    incomeTypes: [],
    months: [],
    payees: {},
    targets: { savingsRateBp: 2000, moneyAgeDays: 30 },
    netWorth: 'omitted',
    splits: [],
  };

  for (const id of ['jahresansicht', 'kategorien', 'sparquote', 'gesamttabelle']) {
    test(`${id}: says honestly that there is no data`, async ({ page }) => {
      await page.route('**/api/report-tables/months*', (route) => route.fulfill({ json: empty }));
      await page.route('**/api/report-tables/income-expense*', (route) => route.fulfill({ json: empty }));
      await page.goto(`/reports/${id}`);
      if (id === 'gesamttabelle') await page.getByText('Alle Monate: Nettovermögen und CSV', { exact: true }).click();
      await expect(page.getByText(id === 'sparquote' || id === 'gesamttabelle' ? 'Noch keine Monatsdaten' : 'Für diese Auswahl sind keine vollständigen Monatswerte verfügbar.', { exact: false })).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('table.rtable')).toHaveCount(0);
    });

    test(`${id}: shows the failure and retries`, async ({ page }) => {
      let fail = true;
      await page.route(id === 'sparquote' || id === 'gesamttabelle' ? '**/api/report-tables/months*' : '**/api/report-tables/income-expense*', (route) =>
        fail ? route.fulfill({ status: 500, json: { error: 'internal' } }) : route.continue(),
      );
      await page.goto(`/reports/${id}`);
      if (id === 'gesamttabelle') await page.getByText('Alle Monate: Nettovermögen und CSV', { exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(
        id === 'sparquote' || id === 'gesamttabelle' ? 'Monatsdaten konnten nicht geladen werden' : 'Vorlage konnten nicht geladen werden',
        { timeout: 20_000 },
      );
      fail = false;
      await page.getByRole('button', { name: 'Erneut versuchen' }).click();
      await expect(page.locator('table.rtable').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  }

  test('only a running month: no report without a complete month', async ({ page }) => {
    const data = await facts(page);
    const only = {
      ...data,
      firstMonth: '2026-09',
      lastFullMonth: null,
      months: data.months.slice(-1),
    };
    await page.route('**/api/report-tables/months*', (route) => route.fulfill({ json: only }));
    await page.goto('/reports/sparquote');
    await expect(page.getByText('Noch kein vollständiger Monat')).toBeVisible({ timeout: 20_000 });
    // the Gesamttabelle already has the running month
    await open(page, '/reports/gesamttabelle');
    await expect(page.locator('table.rg-all thead th')).toHaveCount(2);
  });

  test('Gesamttabelle: an unavailable valuation withholds the net worth row, nothing is guessed', async ({
    page,
  }) => {
    const data = await facts(page);
    const unavailable = {
      ...data,
      netWorth: 'unavailable',
      months: data.months.map((m) => ({ ...m, netWorthCents: null })),
    };
    await page.route('**/api/report-tables/months*', (route) =>
      route.fulfill({ json: unavailable }),
    );
    await open(page, '/reports/gesamttabelle');
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Nettovermögen am Monatsende ist nicht verfügbar' }),
    ).toBeVisible();
    const nw = await page.locator('table.rg-all tbody tr').last().locator('td').allTextContents();
    expect(nw.every((t) => t.trim() === '–')).toBe(true);
  });

  test('shows a loading note while the facts load', async ({ page }) => {
    await page.route('**/api/report-tables/income-expense*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });
    await page.goto('/reports/kategorien');
    await expect(
      page.getByRole('status').filter({ hasText: 'Vorlage werden geladen' }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('template-category').locator('table')).toBeVisible({ timeout: 20_000 });
  });
});
