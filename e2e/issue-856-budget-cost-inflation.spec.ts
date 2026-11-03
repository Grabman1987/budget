import { test as isolatedTest } from './isolated-ledger';
import {
  accounts,
  categories,
  capturePlanSnapshot,
  createBooking,
  createEntity,
  openDatabase,
  schema,
} from '@budget/db';
import { formatPercent } from '@budget/domain';
import AxeBuilder from '@axe-core/playwright';
import { cents, formatEuro } from '@budget/domain';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, sampleTest as test } from './sample';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';
import { chooseBudgetCostInflationView } from './budget-cost-inflation-controls';

const cases = [
  {
    name: 'budget',
    path: '/reports/budgettreue?monat=2026-08',
    api: '/api/reports/spending/adherence?month=2026-08',
    body: 'budget-adherence',
    primary: '.r11-budget-total',
    old: 'ba-over',
  },
  {
    name: 'accuracy',
    path: '/reports/budgettreue?monat=2026-08&darstellung=planungstreue',
    api: '/api/reports/planning-accuracy?month=2026-08',
    body: 'planning-accuracy',
    primary: '#accuracy-months',
    old: 'planning-accuracy',
  },
  {
    name: 'contracts',
    path: '/reports/abos',
    api: '/api/reports/spending/contracts',
    body: 'contracts-report',
    primary: '.r11-contract-summary',
    old: 'co-bound',
  },
  {
    name: 'costs',
    path: '/reports/abos?darstellung=bankkosten',
    api: '/api/reports/spending/costs',
    body: 'bank-costs-report',
    primary: '[data-testid="bank-costs-chart"]',
    old: 'bc-total',
  },
  {
    name: 'inflation',
    path: '/reports/inflation',
    api: '/api/reports/spending/inflation',
    body: 'personal-inflation',
    primary: '[data-testid="inflation-chart"]',
    old: 'pi-rate',
  },
] as const;
for (const scene of cases)
  test(`856 ${scene.name}: compact real reader, full detail, themes, privacy and 320px`, async ({
    page,
    request,
  }, info) => {
    const response = await request.get(scene.api);
    expect(response.ok()).toBe(true);
    const data = await response.json();
    await page.goto(scene.path);
    await expect(page.getByTestId(scene.body)).toBeVisible();
    if (!(await redesignReportsOn(page))) {
      await expect(page.getByTestId(scene.old)).toBeVisible();
      await expect(
        page.locator('.r11-contract-summary, .r11-budget-total, .r11-inflation-chart'),
      ).toHaveCount(0);
      return;
    }
    await expect(page.locator(scene.primary)).toBeVisible();
    await expect(page.locator('[data-r8-detail][open]')).toHaveCount(0);
    if (scene.name === 'budget')
      await expect(page.getByTestId('report-frame-result')).toHaveText(
        formatEuro(cents(data.restCents), { sign: true }),
      );
    if (scene.name === 'contracts')
      await expect(page.getByTestId('report-frame-result')).toHaveText(
        formatEuro(cents(data.yearlyCents)),
      );
    if (scene.name === 'costs') {
      await expect(page.getByTestId('report-frame-result')).toHaveText(
        formatEuro(cents(data.totalCents)),
      );
      await expect(page.getByTestId('bc-coverage')).toContainText(
        'nicht die vollständige Gesamtbelastung',
      );
    }
    if (scene.name === 'accuracy' && data.summary.count < 2)
      await expect(page.getByTestId('report-frame-result')).toHaveText('—');
    if (scene.name === 'inflation') {
      const comparison = data.latestComparison;
      expect(comparison).not.toBeNull();
      await expect(page.getByTestId('report-frame-result')).toHaveText(
        `${comparison.differenceBp > 0 ? '+' : ''}${new Intl.NumberFormat('de-AT').format(comparison.differenceBp / 100).replace('-', '−')} Pp`,
      );
      await expect(page.getByTestId('report-calculation')).not.toContainText('€');
    }
    const folder = 'docs/evidence/redesign-reports-20261103-a';
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (info.project.name !== 'webkit-iphone' && scene.name !== 'accuracy') {
        mkdirSync(folder, { recursive: true });
        await page.screenshot({
          path: join(folder, `r11-${scene.name}-${info.project.name}-${theme}.png`),
          fullPage: true,
        });
      }
    }
    // Chart alternatives stay exact, and complete readers remain reachable by keyboard.
    if (scene.name === 'budget') {
      const summary = page.locator('.r11-chart-table > summary');
      await summary.focus();
      await summary.press('Enter');
      await expect(page.locator('.r11-chart-table table')).toBeVisible();
    }
    if (scene.name === 'budget' && data.groups.length > 4) {
      await page
        .getByRole('button', { name: `Alle ${data.groups.length} Gruppen anzeigen`, exact: true })
        .click();
      await expect(page.locator('.r11-bullets .r11-bullet')).toHaveCount(data.groups.length);
    }
    if (scene.name === 'contracts' && data.items.length > 9) {
      await page
        .getByRole('button', { name: `Alle ${data.items.length} Verträge anzeigen`, exact: true })
        .click();
      await expect(page.locator('.r11-contract-desktop tbody tr')).toHaveCount(data.items.length);
      await expect(page.locator('.r11-contract-phone li')).toHaveCount(data.items.length);
    }
    const disclosures = page.locator('[data-r8-detail]');
    for (let i = 0; i < (await disclosures.count()); i++) {
      const detail = disclosures.nth(i);
      if ((await detail.getAttribute('open')) === null)
        await detail.locator(':scope > summary').click();
    }
    await expect(page.getByTestId(scene.old)).toBeVisible();
    await withShellControls(page, async ({ privacy }) => privacy.click());
    const result = page.getByTestId('report-frame-result');
    await expect(result).toHaveText(/•••|—/);
    await withShellControls(page, async ({ privacy }) => privacy.click());
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

test('856 inflation keeps year/base selection and report anchor through settings and reload', async ({
  page,
}) => {
  await page.goto('/reports/inflation?monat=2026-08&zeitraum=1J#warenkorb');
  if (!(await redesignReportsOn(page))) return;
  await page.locator('[data-r8-detail="inflation-basket"] > summary').click();
  await chooseBudgetCostInflationView(page, 'Warenkorbansicht', 'year', 'Je Jahr');
  await expect(page.getByTestId('inflation-basket-yearly')).toBeVisible();
  const source = new URL(page.url());
  expect(source.searchParams.get('warenkorb')).toBe('year');
  expect(source.hash).toBe('#warenkorb');
  await page.getByRole('link', { name: 'Warenkorb bearbeiten', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('von')).toBe(
    source.pathname + source.search + source.hash,
  );
  await page.reload();
  await page.getByRole('link', { name: 'Zur persönlichen Inflation', exact: true }).click();
  await expect(page.getByTestId('inflation-basket-yearly')).toBeVisible();
  expect(new URL(page.url()).search).toBe(source.search);
  expect(new URL(page.url()).hash).toBe(source.hash);
  await chooseBudgetCostInflationView(page, 'Warenkorbansicht', 'base', 'Seit Basis');
  await expect(page.getByTestId('inflation-basket')).toBeVisible();
});

test('856 report loading, failed read, retry and existing offline fallback keep the source context', async ({
  page,
  context,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const url = '**/api/reports/spending/adherence?month=2026-08';
  await page.route(url, async (route) => {
    await gate;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'synthetic_report_read' }),
    });
  });
  try {
    await page.goto('/reports/budgettreue?monat=2026-08');
    await expect(page.locator('[data-testid="budget-adherence"] [aria-busy="true"]')).toContainText(
      'Budgettreue werden geladen',
    );
  } finally {
    release();
  }
  await expect(
    page.getByRole('alert').filter({ hasText: 'Budgettreue konnten nicht geladen werden.' }),
  ).toBeVisible();
  if (await redesignReportsOn(page))
    await expect(page.getByTestId('report-frame-result')).toHaveText('—');
  await page.unroute(url);
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  const on = await redesignReportsOn(page);
  const body = on ? page.locator('.r11-budget-total') : page.getByTestId('ba-over');
  await expect(body).toBeVisible();
  await context.setOffline(true);
  await expect(page.locator('.pwa-connection')).toContainText(
    'Offline · Angezeigte Daten können veraltet sein.',
  );
  await expect(page.locator('.pwa-offline')).toBeVisible();
  await context.setOffline(false);
  await expect(body).toBeVisible();
  expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
});

isolatedTest(
  '856 populated forecast accuracy uses observed snapshots, literal actuals and its exact six-month window',
  async ({ page, request, isolatedLedger }, info) => {
    const opened = openDatabase(isolatedLedger.databasePath);
    const actor = { actor: 'synthetic-report-856' };
    try {
      accounts.create(
        opened.db,
        {
          id: 'r11-cash',
          name: 'Synthetic budget',
          type: 'cash',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-04-01',
          openingBalanceCents: 1000000,
        },
        actor,
      );
      createEntity(
        opened.db,
        schema.categoryGroup,
        { id: 'r11-group', name: 'Synthetic costs' },
        actor,
      );
      categories.create(
        opened.db,
        { id: 'r11-category', name: 'Synthetic category', groupId: 'r11-group', class: 'need' },
        actor,
      );
      for (const [i, month] of [
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
      ].entries()) {
        opened.db
          .insert(schema.envelopeMonth)
          .values({ categoryId: 'r11-category', month, assignedCents: 30001 })
          .run();
        createBooking(
          opened.db,
          {
            accountId: 'r11-cash',
            date: `${month}-10`,
            amountCents: -15001,
            splits: [{ categoryId: 'r11-category', amountCents: -15001 }],
          },
          actor,
        );
        capturePlanSnapshot(opened.db, month, `${month}-15`);
        const after = [15001, 18003, 12005, 17007, 19009, 13011][i]!;
        createBooking(
          opened.db,
          {
            accountId: 'r11-cash',
            date: `${month}-20`,
            amountCents: -after,
            splits: [{ categoryId: 'r11-category', amountCents: -after }],
          },
          actor,
        );
      }
    } finally {
      opened.close();
    }
    const response = await request.get('/api/reports/planning-accuracy?month=2026-09');
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.summary.count).toBe(6);
    expect(data.months.find((row: { month: string }) => row.month === '2026-04')).toMatchObject({
      actualCents: 30002,
    });
    expect(data.categories[0]).toMatchObject({ categoryId: 'r11-category', actualCents: 28012 });
    await page.goto('/reports/budgettreue?monat=2026-09&darstellung=planungstreue');
    await expect(
      page.getByRole('group', { name: 'Monatliche Abweichung in Prozent', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.accuracy-bar-column')).toHaveCount(6);
    const on = await redesignReportsOn(page);
    if (!on) {
      await expect(page.getByRole('heading', { name: /^Trefferquote 6 Monate:/ })).toBeVisible();
      return;
    }
    await expect(page.getByTestId('report-frame-result')).toHaveText(
      formatPercent(data.summary.meanAbsoluteBp),
    );
    await expect(page.getByRole('row', { name: /^April 2026/ })).toContainText('300,02 €');
    const folder = 'docs/evidence/redesign-reports-20261103-a';
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      if (info.project.name !== 'webkit-iphone') {
        mkdirSync(folder, { recursive: true });
        await page.screenshot({
          path: join(folder, `r11-accuracy-${info.project.name}-${theme}.png`),
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 320, height: 844 });
    for (const chart of await page.locator('.accuracy-bars > .chart-interactive').all())
      expect((await chart.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  },
);
