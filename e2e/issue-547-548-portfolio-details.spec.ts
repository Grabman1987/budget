import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17' });

function seed(path: string, savings = false) {
  const opened = openDatabase(path);
  try {
    opened.db
      .insert(schema.account)
      .values({
        id: 'depot',
        name: 'Synthetic depot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-01-01',
      })
      .run();
    opened.db
      .insert(schema.security)
      .values({ id: 's', name: 'Synthetic instrument', kind: 'fund' })
      .run();
    if (savings) {
      opened.db
        .insert(schema.savingsPlan)
        .values([
          {
            id: 'old',
            securityId: 's',
            accountId: 'depot',
            amountCents: 10000,
            dayOfMonth: 15,
            validFrom: '2026-01-01',
            validTo: '2026-06-30',
          },
          {
            id: 'new',
            securityId: 's',
            accountId: 'depot',
            amountCents: 20000,
            dayOfMonth: 15,
            validFrom: '2026-07-01',
          },
        ])
        .run();
      opened.db
        .insert(schema.trade)
        .values([
          {
            id: 'may',
            accountId: 'depot',
            securityId: 's',
            date: '2026-05-16',
            kind: 'buy',
            unitsE8: 1_000_000_000,
            amountCents: 10000,
            savingsPlanId: 'old',
            savingsMonth: '2026-05',
          },
          {
            id: 'extra-manual',
            accountId: 'depot',
            securityId: 's',
            date: '2026-06-20',
            kind: 'buy',
            unitsE8: 500_000_000,
            amountCents: 5000,
          },
          {
            id: 'august',
            accountId: 'depot',
            securityId: 's',
            date: '2026-08-16',
            kind: 'buy',
            unitsE8: 2_000_000_000,
            amountCents: 20000,
            savingsPlanId: 'new',
            savingsMonth: '2026-08',
          },
        ])
        .run();
    } else {
      opened.db
        .insert(schema.trade)
        .values([
          {
            id: 'buy',
            accountId: 'depot',
            securityId: 's',
            date: '2026-09-10',
            kind: 'buy',
            unitsE8: 200_000_000,
            amountCents: 2000,
          },
          {
            id: 'sell',
            accountId: 'depot',
            securityId: 's',
            date: '2026-09-12',
            kind: 'sell',
            unitsE8: -100_000_000,
            amountCents: 1500,
          },
          ...Array.from({ length: 11 }, (_, index) => ({
            id: `fee-${index}`,
            accountId: 'depot',
            securityId: 's',
            date: '2026-09-13',
            kind: 'fee' as const,
            amountCents: 0,
          })),
        ])
        .run();
      opened.db
        .insert(schema.price)
        .values([
          {
            securityId: 's',
            date: '2026-09-10',
            priceMicro: 10_000_000,
            currency: 'EUR',
            source: 'manual',
          },
          {
            securityId: 's',
            date: '2026-09-11',
            priceMicro: 12_345_000,
            currency: 'EUR',
            source: 'manual',
          },
          {
            securityId: 's',
            date: '2026-09-12',
            priceMicro: 15_000_000,
            currency: 'EUR',
            source: 'manual',
          },
          {
            securityId: 's',
            date: '2026-09-17',
            priceMicro: 17_500_000,
            currency: 'EUR',
            source: 'manual',
          },
        ])
        .run();
    }
  } finally {
    opened.close();
  }
}
function snapshot(path: string) {
  const opened = openDatabase(path);
  try {
    return JSON.stringify({
      trades: opened.db.select().from(schema.trade).all(),
      plans: opened.db.select().from(schema.savingsPlan).all(),
    });
  } finally {
    opened.close();
  }
}
async function privacy(page: Page, hidden: boolean) {
  const profile = page.locator('.m-profile summary');
  const mobile = await profile.isVisible();
  if (mobile) await profile.click();
  const toggle = page.getByRole('button', { name: 'Beträge verbergen', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', String(hidden));
  if (mobile) await profile.press('Escape');
}
async function compactDesktop(page: Page, info: TestInfo, state: string) {
  if (info.project.name !== 'desktop') return;
  expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
  const geometry = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
  }));
  await info.attach(state, { body: JSON.stringify(geometry), contentType: 'application/json' });
  expect(geometry.height).toBeLessThanOrEqual(1800);
}
async function instrumentPrivacy(page: Page, info: TestInfo, theme: string) {
  const history = page.getByRole('region', { name: 'Wert und Kurs', exact: true });
  for (const mode of ['Wert €', 'Kurs']) {
    await history.getByRole('button', { name: mode, exact: true }).click();
    const chart = history.getByTestId(
      mode === 'Wert €' ? 'instrument-value-chart' : 'price-history-chart',
    );
    const table = history.locator('.chart-data-table');
    await expect(table.locator('tbody tr')).toHaveCount(0);
    await table.locator('summary').focus();
    await table.locator('summary').press('Enter');
    const cells = table.locator('.chart-data-value');
    const publicValues = await cells.allTextContents();
    expect(publicValues.length).toBeGreaterThan(0);
    expect(publicValues).toContain(mode === 'Wert €' ? '24,69 €' : '12,345 €');
    const axes = chart.locator('.graticule + text');
    const publicAxes = await axes.allTextContents();
    expect(publicAxes.length).toBeGreaterThan(0);
    await privacy(page, true);
    await expect(cells).toHaveText(publicValues.map(() => '•••'));
    await expect(axes).toHaveText(publicAxes.map(() => '•••'));
    await expect(table).toContainText('11.09.2026');
    const inspect = chart.locator('..');
    await inspect.focus();
    await inspect.press('ArrowRight');
    const tooltip = page.locator('.chart-tooltip');
    await expect(tooltip).toContainText('11.09.2026');
    const values = tooltip.locator('strong');
    expect(await values.count()).toBeGreaterThan(0);
    await expect(values).toHaveText(Array.from({ length: await values.count() }, () => '•••'));
    await expect(tooltip).not.toContainText('24,69');
    await expect(tooltip).not.toContainText('12,345');
    await inspect.press('Escape');
    await table.locator('summary').click();
    await expect(table).not.toHaveAttribute('open', '');
    await expect(table.locator('tbody tr')).toHaveCount(0);
    await table.locator('summary').click();
    await expect(cells).toHaveText(publicValues.map(() => '•••'));
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(
        `instrument-${mode === 'Kurs' ? 'price' : 'value'}-private-${theme}.png`,
      ),
      fullPage: false,
    });
    await privacy(page, false);
    await expect(cells).toHaveText(publicValues);
    await expect(axes).toHaveText(publicAxes);
    await table.locator('summary').focus();
    await table.locator('summary').press('Enter');
    await expect(table.locator('tbody tr')).toHaveCount(0);
  }
  await history.getByRole('button', { name: 'Wert €', exact: true }).click();
}
async function savingsPrivacy(page: Page, info: TestInfo, theme: string) {
  const purchases = page.locator('.savings-purchases');
  const versions = page.locator('.savings-versions');
  await purchases.locator(':scope > summary').click();
  await versions.locator(':scope > summary').click();
  await expect(purchases.locator('tbody tr')).toHaveCount(3);
  await compactDesktop(page, info, `savings-purchases-and-versions-expanded-${theme}`);
  const months = page.getByRole('region', { name: 'Letzte zwölf Monate', exact: true });
  const may = months
    .getByRole('listitem')
    .filter({ has: page.getByText('2026-05', { exact: true }) });
  const july = months
    .getByRole('listitem')
    .filter({ has: page.getByText('2026-07', { exact: true }) });
  const august = months
    .getByRole('listitem')
    .filter({ has: page.getByText('2026-08', { exact: true }) });
  const extra = purchases.locator('[data-trade-id="extra-manual"]');
  const publicPurchase = await extra.locator('.num').allTextContents();
  expect(publicPurchase.length).toBe(4);
  await privacy(page, true);
  await expect(page.getByTestId('savings-next')).toHaveText('15.10.2026 · ••• €');
  await expect(page.getByTestId('savings-paid')).toHaveText('••• €');
  await expect(may).toContainText('••• €');
  await expect(may).toContainText('Stück: •••');
  await expect(may).not.toContainText('100,00');
  await expect(july).toContainText('Geplant: ••• €');
  await expect(july).toContainText('Zuordnung fehlt');
  await expect(august).toContainText('Stück: •••');
  await expect(august).not.toContainText('200,00');
  await expect(extra.locator('.num')).toHaveText(['•••', '••• €', '••• €', '••• €']);
  await expect(versions.locator('li strong')).toHaveText(['••• € · am 15.', '••• € · am 15.']);
  await purchases.locator(':scope > summary').click();
  await expect(purchases).not.toHaveAttribute('open', '');
  await purchases.locator(':scope > summary').click();
  await expect(extra.locator('.num')).toHaveText(['•••', '••• €', '••• €', '••• €']);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath(`savings-expanded-private-${theme}.png`),
    fullPage: false,
  });
  await privacy(page, false);
  await expect(page.getByTestId('savings-next')).toHaveText('15.10.2026 · 200,00 €');
  await expect(page.getByTestId('savings-paid')).toHaveText('350,00 €');
  await expect(may).toContainText('100,00 €');
  await expect(may).toContainText('Stück: 10');
  await expect(august).toContainText('Stück: 20');
  await expect(extra.locator('.num')).toHaveText(publicPurchase);
  await expect(versions.locator('li strong')).toHaveText([
    '200,00 € · am 15.',
    '100,00 € · am 15.',
  ]);
  await purchases.locator(':scope > summary').click();
  await versions.locator(':scope > summary').click();
}
async function themes(page: Page, info: TestInfo, name: string) {
  if (name === 'instrument')
    await page.getByTestId('instrument-value-chart').scrollIntoViewIfNeeded();
  else
    await page
      .getByRole('region', { name: 'Letzte zwölf Monate', exact: true })
      .scrollIntoViewIfNeeded();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const entityHeading = page.getByRole('heading', {
      name: /^(?:Sparplan · )?Synthetic instrument$/,
      includeHidden: true,
    });
    await expect(entityHeading).toHaveCount(1);
    await expect(entityHeading).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Portfolio', level: 1, exact: true, includeHidden: true }),
    ).toHaveCount(1);
    const back = page.getByRole('link', {
      name: 'Zurück zum Portfolio',
      exact: true,
      includeHidden: true,
    });
    await expect(back).toHaveCount(1);
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute(
      'href',
      name === 'instrument'
        ? '/vermoegen/portfolio/positionen?zeitraum=Alles'
        : '/vermoegen/portfolio/sparplaene',
    );
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (info.project.name !== 'desktop') {
      for (const control of await page.locator('main button, main a, main summary').all()) {
        if (!(await control.isVisible())) continue;
        const box = (await control.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({ path: info.outputPath(`${name}-${theme}.png`), fullPage: false });
    if (name === 'instrument') await instrumentPrivacy(page, info, theme);
    else await savingsPrivacy(page, info, theme);
  }
}

test('547 instrument shares literal value/basis and dates, hover/keyboard and last-twelve row editing', async ({
  page,
  isolatedLedger,
}, info) => {
  seed(isolatedLedger.databasePath);
  const before = snapshot(isolatedLedger.databasePath);
  const response = await page.request.get(
    '/api/securities/s/history?from=2026-09-10&to=2026-09-17',
  );
  expect(response.ok()).toBe(true);
  const history = (await response.json()).history;
  expect(history.points.at(-1)).toMatchObject({
    date: '2026-09-17',
    unitsE8: 100_000_000,
    valueCents: 1750,
  });
  expect(history.position).toMatchObject({ valueCents: 1750, costCents: 1000 });
  await page.goto('/vermoegen/portfolio/instrument/s?zeitraum=Alles');
  await expect(page.getByRole('button', { name: 'Wert €', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const chart = page.getByTestId('instrument-value-chart');
  await expect(chart).toBeVisible();
  expect(
    await chart
      .locator('[data-trade-date]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-trade-date'))),
  ).toEqual(['2026-09-10', '2026-09-12']);
  expect(
    await chart
      .locator('.instrument-cost-line')
      .evaluate((line) => getComputedStyle(line).strokeDasharray),
  ).not.toBe('none');
  const inspect = chart.locator('..');
  await inspect.focus();
  await inspect.press('ArrowRight');
  await expect(page.locator('.chart-tooltip')).toContainText('11.09.2026');
  await expect(page.locator('.chart-tooltip')).toContainText('24,69 €');
  await expect(page.locator('.chart-tooltip')).toContainText('Stück');
  await expect(page.locator('.chart-tooltip')).toContainText('10,00 €');
  const keyboard = await page.locator('.chart-tooltip').textContent();
  expect(keyboard).toBeTruthy();
  await inspect.press('Escape');
  const box = (await chart.boundingBox())!;
  const target = { x: box.x + 64 + (box.width - 80) / 7, y: box.y + 80 };
  if (info.project.use.hasTouch) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.move(target.x, target.y);
  await expect(page.locator('.chart-tooltip')).toHaveText(keyboard!);
  await inspect.press('Escape');
  const trades = page.locator('.trade-list tbody tr');
  await expect(trades).toHaveCount(12);
  await expect(trades.first()).toContainText('Synthetic depot');
  if (info.project.name === 'desktop') {
    await expect(page.locator('.price-history .chart-data-table')).not.toHaveAttribute('open', '');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await compactDesktop(page, info, `instrument-default-last-twelve-${theme}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`instrument-default-last-twelve-${theme}.png`),
        fullPage: false,
      });
    }
  }
  await page.getByRole('button', { name: 'Alle anzeigen (13)', exact: true }).click();
  await expect(trades).toHaveCount(13);
  await trades.first().locator('td').first().click();
  await expect(page.getByRole('dialog', { name: 'Handel bearbeiten', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await trades.first().getByRole('button').focus();
  await trades.first().getByRole('button').press('Enter');
  await expect(page.getByRole('dialog', { name: 'Handel bearbeiten', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await themes(page, info, 'instrument');
  await page.getByRole('button', { name: 'Kurs', exact: true }).click();
  await expect(page.getByTestId('price-history-chart')).toBeVisible();
  await expect(page.getByTestId('price-history-chart').locator('[data-chart-point]')).toHaveCount(
    4,
  );
  expect(snapshot(isolatedLedger.databasePath)).toBe(before);
});

test('548 twelve months keep explicit executions, missing inbox proposals and extra manual buys', async ({
  page,
  isolatedLedger,
}, info) => {
  seed(isolatedLedger.databasePath, true);
  const before = snapshot(isolatedLedger.databasePath);
  const proposals = async () =>
    (await (await page.request.get('/api/savings-plans/execution-proposals')).json()).proposals;
  const pending = await proposals();
  expect(pending.find((proposal: { month: string }) => proposal.month === '2026-07')).toMatchObject(
    { planId: 'new', amountCents: 20000 },
  );
  await page.goto('/vermoegen/portfolio/sparplan/new');
  const months = page.getByRole('region', { name: 'Letzte zwölf Monate', exact: true });
  await expect(months.getByRole('listitem')).toHaveCount(12);
  const slot = (month: string) =>
    months.getByRole('listitem').filter({ has: page.getByText(month, { exact: true }) });
  await expect(slot('2026-05')).toContainText('Ausgeführt · zugeordnet');
  await expect(slot('2026-05')).toContainText('100,00 €');
  await expect(slot('2026-05')).toContainText('Stück: 10');
  await expect(slot('2026-07')).toContainText('Zuordnung fehlt');
  await expect(slot('2026-07')).toContainText('Geplant: 200,00 €');
  await expect(slot('2026-08')).toContainText('200,00 €');
  await expect(slot('2026-08')).toContainText('Stück: 20');
  await expect(page.getByTestId('savings-paid')).toHaveText('350,00 €');
  await expect(page.getByTestId('savings-next')).toHaveText('15.10.2026 · 200,00 €');
  await expect(page.locator('.savings-purchases')).not.toHaveAttribute('open', '');
  await expect(page.locator('.savings-versions')).not.toHaveAttribute('open', '');
  await compactDesktop(page, info, 'savings-purchases-and-versions-closed');
  await themes(page, info, 'savings');
  await page.locator('.savings-purchases > summary').click();
  await expect(page.locator('.savings-purchases .trade-list tbody tr')).toHaveCount(3);
  await expect(page.locator('[data-trade-id="extra-manual"]')).toContainText('50,00');
  expect(await proposals()).toEqual(pending);
  expect(snapshot(isolatedLedger.databasePath)).toBe(before);
});
