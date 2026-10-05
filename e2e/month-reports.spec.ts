import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cents, formatEuro } from '@budget/domain';
import { sampleTest } from './sample';

/**
 * Reports of "Monat und Einkommen" on the seeded sample server (17.09.2026): the figures on the
 * page are the figures of the API, nothing is typed into the page. Desktop and mobile, light and
 * dark, with axe and a check that the page never scrolls sideways.
 */

// Every page is inspected in two themes (axe, scroll width, full-page screenshot): give it room.
sampleTest.describe.configure({ timeout: 90_000 });

const money = (value: number, whole = false) => formatEuro(cents(value), { cents: !whole });
/** Text with every kind of space collapsed, so de-AT number formatting compares equal. */
const flat = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

async function inspect(page: Page, info: TestInfo, name: string) {
  const width = info.project.use.viewport!.width as number;
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await page.evaluate(() => document.fonts.ready);
    const result = await new AxeBuilder({ page }).include('main').analyze();
    expect(
      result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([]);
    expect(
      await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    ).toEqual({ innerWidth: width, scrollWidth: width });
    const dir = process.env['BUDGET_MONTH_REPORTS_EVIDENCE'];
    if (dir) mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: dir
        ? join(dir, `${name}-${theme}-${info.project.name}.png`)
        : info.outputPath(`${name}-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.evaluate(() => delete document.documentElement.dataset['theme']);
}

const isIncome = (month: string) => (response: { url(): string }) => {
  const url = new URL(response.url());
  return url.pathname === '/api/reports/month/income' && url.searchParams.get('month') === month;
};

sampleTest('Einnahmen: the page shows the figures of the sample ledger', async ({ page }, info) => {
  const loaded = page.waitForResponse(isIncome('2026-08'));
  await page.goto('/reports/einnahmen?monat=2026-08');
  const response = await loaded;
  expect(response.status()).toBe(200);
  const data = (await response.json()) as {
    income: { earnedCents: number; capitalCents: number };
    expected: { lines: unknown[] };
    window: {
      rows: Array<{ name: string; sumCents: number }>;
      totalCents: number;
      months: string[];
    };
  };
  await expect(page.getByRole('heading', { name: 'Einnahmen August 2026' })).toBeVisible();
  expect(flat(await page.getByTestId('income-total').textContent())).toBe(
    flat(money(data.income.earnedCents)),
  );
  expect(flat(await page.getByTestId('income-capital-total').textContent())).toBe(
    flat(money(data.income.capitalCents)),
  );
  // Kapitalerträge are no household income: neither a type row nor part of the total.
  const types = page.getByTestId('income-types');
  await expect(types.locator('tbody tr')).toHaveCount(data.window.rows.length + 1);
  await expect(types).not.toContainText('Kapitalerträge');
  await expect(types).not.toContainText('Erstattungen');
  await expect(types.locator('tbody tr').last()).toContainText(
    flat(money(data.window.totalCents, true)),
  );
  await expect(page.getByTestId('income-expected').locator('tbody tr')).toHaveCount(
    data.expected.lines.length,
  );
  await expect(page.getByTestId('income-chart')).toBeVisible();
  await expect(page.getByTestId('income-capital-chart')).toBeVisible();
  await inspect(page, info, 'einnahmen');
});

sampleTest(
  'Einnahmen: the running month announces what is still expected',
  async ({ page }, info) => {
    const loaded = page.waitForResponse(isIncome('2026-09'));
    await page.goto('/reports/einnahmen');
    const response = await loaded;
    expect(response.status()).toBe(200);
    const data: {
      expectedMaterialised: boolean;
      expected: { lines: { status: string }[]; pendingCount: number; pendingCents: number };
    } = await response.json();
    await expect(page.getByTestId('report-month')).toHaveText('September 2026');
    await expect(page.getByRole('button', { name: 'Nächster Monat' })).toBeDisabled();
    await expect(
      page.getByRole('heading', { name: /Einnahmen September 2026 · bis 17\./ }),
    ).toBeVisible();
    const salary = page.locator('[data-testid="income-expected"] tr[data-status="pending"]');
    await expect(salary).toContainText('Gehalt');
    await expect(salary).toContainText('erwartet');
    await expect(page.getByText('1 erwartet, 3.812 €')).toBeVisible();
    // Whether the sample's occurrences are materialised depends on the specs that ran before on this
    // shared server: Plan > Erwartet (expected.spec.ts) refreshes them when it opens and nothing
    // undoes that. Until then the schedule stands in and a due payment is "nicht zugeordnet"
    // (nothing claims a receipt; the fixtures test covers that line); afterwards they carry their
    // match status. The page shows whichever the API reports.
    const unlinked = data.expected.lines.filter((l) => l.status === 'unlinked').length;
    if (!data.expectedMaterialised) expect(unlinked).toBe(1);
    const rows = page.locator('tr[data-status="unlinked"]');
    await expect(rows).toHaveCount(unlinked);
    if (unlinked > 0) {
      await expect(rows).toContainText('nicht zugeordnet');
      await expect(page.getByText(/noch nicht zugeordnet/).first()).toBeVisible();
    }
    await inspect(page, info, 'einnahmen-laufend');

    const previous = page.waitForResponse(isIncome('2026-08'));
    await page.getByRole('button', { name: 'Vormonat' }).click();
    expect((await previous).status()).toBe(200);
    await expect(page).toHaveURL(/monat=2026-08/);
    await expect(page.getByTestId('report-month')).toHaveText('August 2026');
    await expect(page.getByRole('button', { name: 'Nächster Monat' })).toBeEnabled();
  },
);

sampleTest(
  'Einnahmen: before the records, on an error and on an empty ledger',
  async ({ page }) => {
    await page.goto('/reports/einnahmen?monat=2023-05');
    await expect(page.getByText(/gibt es keine Aufzeichnungen/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vormonat' })).toBeDisabled();

    await page.route('**/api/reports/month/income*', (route) =>
      route.fulfill({ status: 500, json: { error: 'boom', message: 'Fehler' } }),
    );
    await page.goto('/reports/einnahmen?monat=2026-08');
    await expect(page.getByRole('alert')).toContainText('konnten nicht geladen werden');
    await expect(page.getByTestId('income-total')).toHaveCount(0);
    await page.unroute('**/api/reports/month/income*');

    await page.route('**/api/reports/month/income*', (route) =>
      route.fulfill({
        json: {
          month: '2026-08',
          asOf: '2026-08-31',
          partial: false,
          firstMonth: '2023-10',
          beforeRecords: false,
          income: { month: '2026-08', types: [], earnedCents: 0, capitalCents: 0, refundCents: 0 },
          expected: {
            lines: [],
            pendingCount: 0,
            pendingCents: 0,
            missingCount: 0,
            unlinkedCount: 0,
          },
          expectedMaterialised: true,
          foreignCurrencyCount: 0,
          window: {
            months: ['2026-08'],
            rows: [],
            totalCents: 0,
            totalMonthCents: 0,
            totalAverageCents: 0,
            capital: { monthCents: 0, perMonth: [0], sumCents: 0, averageCents: 0 },
          },
        },
      }),
    );
    await page.goto('/reports/einnahmen?monat=2026-08');
    await expect(page.getByText('Für diesen Monat sind keine Einnahmen erwartet.')).toBeVisible();
    await expect(
      page.getByText('In diesem Zeitraum sind keine Kapitalerträge gebucht.'),
    ).toBeVisible();
    await expect(page.getByTestId('income-total')).toContainText('0,00 €');
  },
);

const isFlow = (month: string, span: string) => (response: { url(): string }) => {
  const url = new URL(response.url());
  return (
    url.pathname === '/api/reports/month/flow' &&
    url.searchParams.get('month') === month &&
    url.searchParams.get('span') === span
  );
};

sampleTest(
  'Geldfluss: the Sankey and the parts list are the flow of the API',
  async ({ page }, info) => {
    const loaded = page.waitForResponse(isFlow('2026-08', 'month'));
    await page.goto('/reports/geldfluss?monat=2026-08');
    const response = await loaded;
    expect(response.status()).toBe(200);
    const data = (await response.json()) as {
      flow: {
        earnedCents: number;
        capitalCents: number;
        restCents: number;
        columns: {
          income: Array<{ name: string }>;
          pool: Array<{ name: string }>;
          classes: unknown[];
          groups: unknown[];
        };
        table: unknown[];
        chain: Array<{ label: string }>;
      };
    };
    await expect(page.getByRole('heading', { name: 'Geldfluss August 2026' })).toBeVisible();
    const chain = page.getByRole('group', { name: 'Maßkette Geldfluss' });
    for (const term of data.flow.chain) await expect(chain).toContainText(term.label);
    // Kapitalerträge are visible and labelled in the flow, apart from the household income.
    expect(data.flow.columns.income.map((n) => n.name)).toContain('Kapitalerträge');
    const sankey = page.getByTestId('sankey-chart');
    await expect(sankey).toBeVisible();
    await expect(sankey.locator('title', { hasText: /^Bedarf: .* · .*%$/ })).toHaveCount(1);
    await expect(sankey.locator('text', { hasText: / · .*%$/ }).first()).toBeVisible();
    await expect(
      page
        .getByTestId('flow-list')
        .getByRole('columnheader', { name: `Anteil an ${data.flow.columns.pool[0]?.name}` }),
    ).toBeVisible();
    await expect(sankey).toHaveAttribute('aria-label', /Kapitalerträge/);
    await expect(sankey.locator('title', { hasText: /^Kapitalerträge: / })).not.toHaveCount(0);
    // The thin Kapitalerträge node keeps its label.
    await expect(sankey.locator('text', { hasText: /^Kapitalerträge$/ })).toHaveCount(1);
    const nodes = await sankey.locator('rect.sk-node').count();
    const wide = (info.project.use.viewport!.width as number) >= 600;
    expect(nodes).toBe(
      data.flow.columns.income.length +
        1 +
        data.flow.columns.classes.length +
        (wide ? data.flow.columns.groups.length : 0),
    );
    await expect(page.getByTestId('flow-list').locator('tbody tr')).toHaveCount(
      data.flow.table.length,
    );
    await expect(page.getByText(/Kapitalerträge sind eigens ausgewiesen/)).toBeVisible();
    await inspect(page, info, 'geldfluss');
  },
);

sampleTest('Geldfluss: twelve months, running month and empty states', async ({ page }, info) => {
  const month = page.waitForResponse(isFlow('2026-09', 'month'));
  await page.goto('/reports/geldfluss');
  expect((await month).status()).toBe(200);
  await expect(page.getByText(/Der Monat läuft noch/)).toBeVisible();
  const year = page.waitForResponse(isFlow('2026-09', 'year'));
  await page
    .getByRole('group', { name: 'Zeitraum des Geldflusses' })
    .getByRole('button', { name: '12 Monate' })
    .click();
  const answer = await year;
  expect(answer.status()).toBe(200);
  expect(((await answer.json()) as { from: string; to: string }).to).toBe('2026-08');
  await expect(
    page.getByRole('heading', { name: 'Geldfluss Sep 2025 bis Aug 2026' }),
  ).toBeVisible();
  await expect(page.getByTestId('sankey-chart')).toBeVisible();
  await inspect(page, info, 'geldfluss-12-monate');

  const empty = page.waitForResponse(isFlow('2023-05', 'month'));
  await page.goto('/reports/geldfluss?monat=2023-05');
  expect((await empty).status()).toBe(200);
  await expect(page.getByText(/gibt es keine Aufzeichnungen/)).toBeVisible({ timeout: 30_000 });
  await page.route('**/api/reports/month/flow*', (route) =>
    route.fulfill({ status: 500, json: { error: 'boom', message: 'Fehler' } }),
  );
  await page.goto('/reports/geldfluss?monat=2026-08');
  await expect(page.getByRole('alert')).toContainText('konnten nicht geladen werden');
  await expect(page.getByTestId('sankey-chart')).toHaveCount(0);
});

const isOnePager = (month: string) => (response: { url(): string }) => {
  const url = new URL(response.url());
  return url.pathname === '/api/reports/month/onepager' && url.searchParams.get('month') === month;
};

sampleTest('Monats-One-Pager: the sheet shows the figures of the API', async ({ page }, info) => {
  const loaded = page.waitForResponse(isOnePager('2026-08'));
  await page.goto('/reports/onepager?monat=2026-08');
  const response = await loaded;
  expect(response.status()).toBe(200);
  const data = (await response.json()) as {
    result: { savedCents: number; savingsRateBp: number };
    capitalCents: number;
    allocation: { shares: { need: number; want: number; future: number; rest: number } };
    top: unknown[];
    findings: unknown[];
    check: { ok: number; total: number };
    netWorth: { cents: number };
  };
  const sheet = page.getByRole('article', { name: 'Monats-One-Pager August 2026' });
  await expect(sheet).toBeVisible();
  expect(flat(await page.getByTestId('onepager-saved').textContent())).toBe(
    flat(money(data.result.savedCents)),
  );
  await expect(page.getByTestId('onepager-rate')).toContainText('Sparquote');
  // 54 / 34 / 26 / −14 % of the prototype's August, from the ledger.
  expect(data.allocation.shares).toEqual({ need: 54, want: 34, future: 26, rest: -14 });
  const split = page.getByTestId('onepager-split');
  await expect(split).toContainText('54 %');
  await expect(split).toContainText('Aus Guthaben −14 %');
  await expect(page.getByRole('group', { name: 'Maßkette des Monats' })).toContainText('Gespart');
  await expect(page.getByTestId('onepager-top').locator('tr')).toHaveCount(data.top.length);
  await expect(page.getByTestId('onepager-networth')).toHaveText(
    flat(money(data.netWorth.cents, true)),
  );
  await expect(page.getByTestId('onepager-check-ok')).toHaveText(String(data.check.ok));
  await expect(page.getByTestId('onepager-findings').locator('tbody tr')).toHaveCount(
    Math.max(1, data.findings.length),
  );
  await expect(page.getByTestId('heute-pace-chart')).toBeVisible();
  await expect(page.getByTestId('onepager-networth-chart')).toBeVisible();
  await expect(page.getByTestId('onepager-capital')).toContainText('nicht zu den Einnahmen');
  await expect(page.getByText('FA-R1.1-2608')).toBeVisible();
  await inspect(page, info, 'onepager');
});

sampleTest(
  'Monats-One-Pager: the running month, the month switch and the print button',
  async ({ page }) => {
    const loaded = page.waitForResponse(isOnePager('2026-09'));
    await page.goto('/reports/onepager');
    expect((await loaded).status()).toBe(200);
    await expect(page.locator('.ps-head small')).toHaveText('laufend');
    // A rate of a month that has just begun is meaningless: it waits for the month end.
    await expect(page.getByTestId('onepager-rate')).toHaveText('Sparquote nach Monatsende');
    await expect(page.getByTestId('onepager-findings')).toContainText('R04');
    await expect(page.getByTestId('onepager-findings')).toContainText('Laufender Monat bis 17.09.');
    await expect(page.getByRole('button', { name: 'Nächster Monat' })).toBeDisabled();
    await page.evaluate(() => {
      const w = window as unknown as { printed: number };
      w.printed = 0;
      window.print = () => void (w.printed += 1);
    });
    await page.getByRole('button', { name: 'Drucken' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

    const previous = page.waitForResponse(isOnePager('2026-08'));
    await page.getByRole('button', { name: 'Vormonat' }).click();
    expect((await previous).status()).toBe(200);
    await expect(page.getByTestId('report-month')).toHaveText('August 2026');
    await expect(page.locator('.ps-head small')).toHaveCount(0);
  },
);

sampleTest(
  'Monats-One-Pager: on paper it is one A4 sheet without the app around it',
  async ({ page }, info) => {
    sampleTest.skip(
      info.project.name === 'mobile',
      'The paper layout does not depend on the device',
    );
    const loaded = page.waitForResponse(isOnePager('2026-08'));
    await page.goto('/reports/onepager?monat=2026-08');
    await loaded;
    await expect(page.getByRole('article', { name: /Monats-One-Pager/ })).toBeVisible({
      timeout: 20_000,
    });
    // A4 portrait inside 8 mm margins at 96 dpi.
    await page.setViewportSize({ width: 734, height: 1062 });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.titleblock')).toBeHidden();
    const sheet = page.locator('.psheet');
    await expect(sheet).toBeVisible();
    // Nothing of the sheet is cut off: its content fits the fixed A4 height.
    const clipped = await sheet.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(clipped).toBeLessThanOrEqual(1);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const dir = process.env['BUDGET_MONTH_REPORTS_EVIDENCE'];
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'onepager-print.pdf'), pdf);
    }
    const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(1);
    await page.emulateMedia({ media: 'screen' });
  },
);

sampleTest(
  'Monats-One-Pager: unavailable valuation, errors and a month before the records',
  async ({ page }) => {
    await page.goto('/reports/onepager?monat=2023-05');
    await expect(page.getByText(/gibt es keine Aufzeichnungen/)).toBeVisible();

    const real = await page.request.get('/api/reports/month/onepager?month=2026-08');
    const body = (await real.json()) as Record<string, unknown>;
    const unavailable = {
      unavailable: {
        reason: 'missing_price',
        asOf: '2026-08-31',
        message: 'Ein benötigter Wertpapierkurs fehlt bis einschließlich 31.08.2026.',
      },
    };
    await page.route('**/api/reports/month/onepager*', (route) =>
      route.fulfill({ json: { ...body, netWorth: unavailable, check: unavailable } }),
    );
    await page.goto('/reports/onepager?monat=2026-08');
    await expect(page.getByTestId('onepager-networth-unavailable')).toContainText(
      'Wertpapierkurs fehlt',
    );
    await expect(page.getByTestId('onepager-check-unavailable')).toContainText(
      'Wertpapierkurs fehlt',
    );
    await expect(page.getByTestId('onepager-networth')).toHaveCount(0);
    await expect(page.getByTestId('onepager-saved')).toBeVisible();
    await page.unroute('**/api/reports/month/onepager*');

    await page.route('**/api/reports/month/onepager*', (route) =>
      route.fulfill({ status: 500, json: { error: 'boom', message: 'Fehler' } }),
    );
    await page.goto('/reports/onepager?monat=2026-08');
    await expect(page.getByRole('alert')).toContainText('konnten nicht geladen werden');
    await expect(page.locator('.psheet')).toHaveCount(0);
  },
);
