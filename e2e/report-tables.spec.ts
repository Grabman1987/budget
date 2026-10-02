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
  await expect(page.locator('table.rtable').first()).toBeVisible({ timeout: 20_000 });
}

const whole = (value: number) => formatEuro(cents(value), { cents: false });
const signed = (value: number) => formatEuro(cents(value), { cents: false, sign: true });
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
  const row = (page: Page, label: string) =>
    page
      .locator('table.rg-year tbody tr')
      .filter({ has: page.locator('th', { hasText: new RegExp(`^${label}$`) }) });

  test('shows the year with the chain, the grid and the comparison with the previous year', async ({
    page,
  }, info) => {
    const data = await facts(page);
    const meta = data as TableMeta;
    const view = buildYearView(data.months, 2026, data.lastFullMonth);
    const rows = buildTableRows(view.months, meta, false);
    await open(page, '/reports/jahresansicht');
    await expect(page.getByRole('heading', { level: 2, name: '2026 · 8 Monate' })).toBeVisible();
    await expect(page.locator('.titleblock')).toContainText('Okt 23 bis Aug 26');
    await expect(page.getByRole('button', { name: '2026' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Maßkette: Einnahmen - Konsum - Zukunft = Übrig (balanced whole euros, at most 2 € off).
    const have = view.months.flatMap((m) => (m ? [m] : []));
    const income = have.reduce((a, m) => a + monthHouseholdIncome(m, meta), 0);
    const consumption = have.reduce((a, m) => a + monthConsumption(m, meta), 0);
    const future = have.reduce((a, m) => a + monthClassSpending(m, meta, 'future'), 0);
    const chain = page.getByRole('group', { name: 'Maßkette des Jahres' });
    const [e, k, z, rest] = (await chain.locator('.ct-val').allTextContents()).map(euros) as [
      number,
      number,
      number,
      number,
    ];
    expect(Math.abs(e - Math.round(income / 100))).toBeLessThanOrEqual(2);
    expect(Math.abs(k - Math.round(consumption / 100))).toBeLessThanOrEqual(2);
    expect(Math.abs(z - Math.round(future / 100))).toBeLessThanOrEqual(2);
    expect(e - k - z).toBe(rest);

    // The grid equals the shared row model: every month cell of Einnahmen, the totals of the key rows.
    const incomeRow = row(page, 'Einnahmen');
    const cells = await incomeRow.locator('td').allTextContents();
    const incomeVals = rows.find((r) => r.key === 'inc')!.vals;
    incomeVals.forEach((v, i) => expect(cells[i]?.trim()).toBe(v === null ? '–' : plain(v)));
    for (const [label, key] of [
      ['Einnahmen', 'inc'],
      ['Bedarf', 'need'],
      ['Wunsch', 'want'],
      ['Zukunft', 'future'],
      ['Konsumausgaben', 'cons'],
    ] as const) {
      const r = rows.find((x) => x.key === key)!;
      const tds = await row(page, label).locator('td').allTextContents();
      expect(tds[12]?.trim(), label).toBe(plain(tableRowTotal(r) ?? 0));
    }
    const rest2 = await row(page, 'Übrig nach Zukunft').locator('td').allTextContents();
    expect(rest2[12]?.trim()).toBe(signed(income - consumption - future));
    // Sparquote per month in whole percent, no sum.
    const sq = await row(page, 'Sparquote').locator('td').allTextContents();
    expect(sq[12]?.trim()).toBe('–');
    expect(sq[8]).toBe('–'); // September is not complete
    expect(sq[0]).toMatch(/^−?\d+ %$/);

    // Kapitalerträge and Erstattungen: visible, labelled, and not in Einnahmen.
    await expect(
      page.getByRole('rowheader', { name: 'Kapitalerträge (nicht in Einnahmen)' }),
    ).toBeVisible();
    const capital = rows.find((r) => r.key.startsWith('memo:'))!;
    expect(capital).toBeDefined();
    await expect(page.locator('td.hc2').first()).toBeVisible();

    // Comparison: only the months present in both years; consumption change in cents and percent.
    const compare = page.getByTestId('year-compare');
    await expect(compare).toContainText('Konsum gegen 2025');
    await expect(compare).toContainText('Jän–Aug verglichen');
    await expect(page.getByRole('columnheader', { name: '2025*' })).toBeVisible();
    await inspect(page, info, 'jahresansicht');
  });

  test('switches the year and compares only months that exist in both years', async ({ page }) => {
    await open(page, '/reports/jahresansicht');
    await page.getByRole('button', { name: '2025' }).click();
    await expect(page.getByRole('heading', { level: 2, name: '2025' })).toBeVisible();
    await expect(page.getByTestId('year-compare')).toContainText('ganzes Jahr');
    await expect(page.getByRole('columnheader', { name: '2024', exact: true })).toBeVisible();

    await page.getByRole('button', { name: '2024' }).click();
    await expect(page.getByTestId('year-compare')).toContainText('Okt–Dez verglichen');
    await expect(page.getByRole('columnheader', { name: '2023*' })).toBeVisible();

    await page.getByRole('button', { name: '2023' }).click();
    await expect(page.getByRole('heading', { level: 2, name: '2023 · 3 Monate' })).toBeVisible();
    await expect(page.getByText('Für 2022 liegen keine Monate zum Vergleich vor.')).toBeVisible();
    // months without data stay empty
    const tds = await row(page, 'Einnahmen').locator('td').allTextContents();
    expect(tds.slice(0, 9).every((t) => t.trim() === '–')).toBe(true);
    expect(tds[9]?.trim()).not.toBe('–');
  });

  test('the Kategorien depth adds category rows without changing a group figure', async ({
    page,
  }) => {
    await open(page, '/reports/jahresansicht');
    await expect(row(page, 'Wohnen')).toBeVisible();
    const wohnen = await row(page, 'Wohnen').locator('td').allTextContents();
    expect(await page.getByRole('rowheader', { name: 'Miete', exact: true }).count()).toBe(0);
    await page.getByRole('button', { name: 'Kategorien' }).click();
    await expect(page.getByRole('button', { name: 'Kategorien' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('rowheader', { name: 'Miete', exact: true })).toBeVisible();
    expect(await row(page, 'Wohnen').locator('td').allTextContents()).toEqual(wohnen);
  });
});

// ---------------------------------------------------------------------------------------------
// 1.6 Kategorieübersicht
// ---------------------------------------------------------------------------------------------
test.describe('1.6 Kategorieübersicht', () => {
  test('lists the categories of the Zeitraum with sums, previous period and share', async ({
    page,
  }, info) => {
    const data = await facts(page);
    const window = reportPeriodMonths('YTD', data.lastFullMonth!, data.firstMonth!);
    const overview = categoryOverview(data.months, data, window, data.lastFullMonth);
    await open(page, '/reports/kategorien');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: `${overview.rows.length} Kategorien · Jän–Aug 2026`,
      }),
    ).toBeVisible();
    await expect(page.locator('.tbd-state')).toContainText(
      `Konsum ${whole(overview.consumptionCents)}`,
    );

    const rows = page.locator('tr.rc-row');
    await expect(rows).toHaveCount(overview.rows.length);
    for (const [i, expected] of overview.rows.slice(0, 6).entries()) {
      const r = rows.nth(i);
      await expect(r.locator('.rc-btn span')).toHaveText(expected.category.name);
      const cells = await r.locator('td').allTextContents();
      expect(cells[1]?.trim()).toBe(whole(expected.sumCents));
      expect(cells[2]?.trim()).toBe(whole(expected.avgCents));
      if (expected.shareBp === null) expect(cells[4]).toContain('Zukunft');
      else expect(cells[4]?.trim()).toBe(formatPercent(expected.shareBp));
      if (expected.previousCents !== null && expected.previousCents !== 0)
        expect(cells[3]).toContain(signed(expected.sumCents - expected.previousCents));
    }
    // the shares of the Konsum categories add up to 100 % (rounding to tenths aside)
    const shareSum = overview.rows.reduce((a, r) => a + (r.shareBp ?? 0), 0);
    expect(Math.abs(shareSum - 10_000)).toBeLessThanOrEqual(overview.rows.length);
    await inspect(page, info, 'kategorien');
  });

  test('the largest category is open with chart and facts; rows open and close', async ({
    page,
  }) => {
    const data = await facts(page);
    const window = reportPeriodMonths('YTD', data.lastFullMonth!, data.firstMonth!);
    const overview = categoryOverview(data.months, data, window, data.lastFullMonth);
    const [first, second] = overview.rows as [
      (typeof overview.rows)[number],
      (typeof overview.rows)[number],
    ];
    await open(page, '/reports/kategorien');
    const firstButton = page.getByRole('button', { name: new RegExp(`^${first.category.name}`) });
    await expect(firstButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('category-chart')).toBeVisible();
    const payees = data.payees[first.category.id] ?? [];
    await expect(page.locator('.rc-facts')).toContainText(payees.length ? payees.join(', ') : '–');
    const highest = first.history.reduce((a, h) => (h.spentCents > a.spentCents ? h : a));
    await expect(page.locator('.rc-facts')).toContainText(formatEuro(cents(highest.spentCents)));

    const secondButton = page.getByRole('button', { name: new RegExp(`^${second.category.name}`) });
    await secondButton.click();
    await expect(secondButton).toHaveAttribute('aria-expanded', 'true');
    await expect(firstButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('tr.rc-detail')).toHaveCount(1);
    await secondButton.click();
    await expect(page.locator('tr.rc-detail')).toHaveCount(0);
    // keyboard: Enter opens
    await secondButton.focus();
    await page.keyboard.press('Enter');
    await expect(secondButton).toHaveAttribute('aria-expanded', 'true');
  });

  test('the Zeitraum switch changes the window and the figures', async ({ page }) => {
    const data = await facts(page);
    await open(page, '/reports/kategorien');
    await page.getByRole('button', { name: '1J' }).click();
    await expect(page).toHaveURL(/zeitraum=1J/);
    const window = reportPeriodMonths('1J', data.lastFullMonth!, data.firstMonth!);
    const overview = categoryOverview(data.months, data, window, data.lastFullMonth);
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: `${overview.rows.length} Kategorien · letzte 12 Monate`,
      }),
    ).toBeVisible();
    const cells = await page.locator('tr.rc-row').first().locator('td').allTextContents();
    expect(cells[1]?.trim()).toBe(whole(overview.rows[0]!.sumCents));
    // a window with no earlier data has no previous period
    await page.getByRole('button', { name: 'Alles' }).click();
    const all = categoryOverview(
      data.months,
      data,
      reportPeriodMonths('Alles', data.lastFullMonth!, data.firstMonth!),
      data.lastFullMonth,
    );
    expect(all.rows[0]!.previousCents).toBeNull();
    await expect(page.locator('tr.rc-row').first().locator('td').nth(3)).toHaveText('–');
  });
});

// ---------------------------------------------------------------------------------------------
// 1.7 Sparquote und Geldalter
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
    await expect(page.locator('.titleblock')).toContainText('Okt 23 bis Sep 26');
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
    const scroller = page.getByRole('region', { name: /Gesamttabelle/ });
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
  };

  for (const id of ['jahresansicht', 'kategorien', 'sparquote', 'gesamttabelle']) {
    test(`${id}: says honestly that there is no data`, async ({ page }) => {
      await page.route('**/api/report-tables/months*', (route) => route.fulfill({ json: empty }));
      await page.goto(`/reports/${id}`);
      await expect(page.getByText('Noch keine Monatsdaten')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('table.rtable')).toHaveCount(0);
    });

    test(`${id}: shows the failure and retries`, async ({ page }) => {
      let fail = true;
      await page.route('**/api/report-tables/months*', (route) =>
        fail ? route.fulfill({ status: 500, json: { error: 'internal' } }) : route.continue(),
      );
      await page.goto(`/reports/${id}`);
      await expect(page.getByRole('alert')).toContainText(
        'Monatsdaten konnten nicht geladen werden',
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
    await page.route('**/api/report-tables/months*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });
    await page.goto('/reports/kategorien');
    await expect(
      page.getByRole('status').filter({ hasText: 'Monatsdaten werden geladen' }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('table.rcats')).toBeVisible({ timeout: 20_000 });
  });
});
