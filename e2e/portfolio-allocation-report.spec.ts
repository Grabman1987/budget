import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { allocationQuality, cents, formatEuro } from '@budget/domain';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sampleTest } from './sample';

const screenshot = async (page: Page, name: string, info: TestInfo) => {
  const dir = process.env['BUDGET_PORTFOLIO_REPORT_EVIDENCE'];
  if (dir) mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: dir ? join(dir, name) : info.outputPath(name),
    fullPage: true,
    animations: 'disabled',
  });
};
const accessibleAndContained = async (page: Page, expectedWidth: number) => {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
    [],
  );
  expect(
    await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual({ innerWidth: expectedWidth, scrollWidth: expectedWidth });
};

type AllocationPayload = {
  allocation: {
    totalCents: number;
    classifiedCents: number;
    classes: Array<{ name: string; targetBp: number | null; breach: boolean }>;
    regions: Array<{ region: string | null }>;
    history: { dates: string[]; classes: unknown[] } | null;
  };
};

sampleTest('allocation report reads the sample ledger', async ({ page }, info) => {
  sampleTest.setTimeout(90_000);
  const first = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/portfolio/allocation-report',
  );
  await page.goto('/reports/pallocation');
  const response = await first;
  expect(response.status()).toBe(200);
  const { allocation } = (await response.json()) as AllocationPayload;
  expect(allocation.classes.length).toBeGreaterThanOrEqual(3);

  await expect(page.getByTestId('sunburst-classes')).toBeVisible();
  await expect(page.locator('.sb-composition svg')).toHaveCount(1);
  await expect(page.getByTestId('alloc-total')).toHaveText(
    formatEuro(cents(allocation.classifiedCents)),
  );
  await expect(page.getByTestId('soll-ist-chart')).toBeVisible();
  await expect(page.getByTestId('soll-table').locator('tbody tr')).toHaveCount(
    allocation.classes.length,
  );
  await expect(page.getByTestId('soll-table')).toContainText('Aktien Welt');
  await expect(page.getByTestId('speculative-note')).toContainText('R15');
  await expect(page.getByRole('table', { name: 'Regionen' })).toContainText('Nordamerika');
  await expect(page.getByRole('link', { name: 'ETF Welt' }).first()).toHaveAttribute(
    'href',
    /produkt=/,
  );

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await accessibleAndContained(page, info.project.use.viewport!.width as number);
    await screenshot(page, `allocation-${theme}-${info.project.name}.png`, info);
  }
});

const mock = (overrides: Record<string, unknown>) => {
  const payload = {
    allocation: {
      quality: allocationQuality([
        { id: 'p1', kind: 'etf', assetClass: 'a', valueCents: 60000 },
        { id: 'p2', kind: 'other', assetClass: null, valueCents: 40000 },
      ]),
      classifiedCents: 60_000,
      regionsAvailable: false,
      regionEditSecurityId: 'p1',
      compositionClasses: [
        {
          confidence: 'provisional',
          assetClassId: 'a',
          name: 'Klasse A',
          valueCents: 60_000,
          shareBp: 10_000,
          targetBp: 4_000,
          bandBp: 500,
          deviationBp: 2_000,
          breach: true,
          products: [
            {
              securityId: 'p1',
              name: 'Produkt 1',
              valueCents: 60_000,
              shareBp: 10_000,
              depots: ['Depot X'],
              ttwror12: null,
            },
          ],
        },
      ],
      compositionRegions: [
        {
          region: null,
          valueCents: 60_000,
          shareBp: 10_000,
          products: [{ securityId: 'p1', name: 'Produkt 1', valueCents: 60_000 }],
        },
      ],
      separatePositions: [{ name: 'Produkt 2', valueCents: 40_000, reason: 'Ohne Anlageklasse' }],
      asOf: '2026-09-17',
      totalCents: 100_000,
      classes: [
        {
          confidence: 'provisional',
          assetClassId: 'a',
          name: 'Klasse A',
          valueCents: 60_000,
          shareBp: 6_000,
          targetBp: 4_000,
          bandBp: 500,
          deviationBp: 2_000,
          breach: true,
          products: [
            {
              securityId: 'p1',
              name: 'Produkt 1',
              valueCents: 60_000,
              shareBp: 6_000,
              depots: ['Depot X'],
              ttwror12: null,
            },
          ],
        },
        {
          confidence: 'provisional',
          assetClassId: null,
          name: 'Ohne Anlageklasse',
          valueCents: 40_000,
          shareBp: 4_000,
          targetBp: null,
          bandBp: null,
          deviationBp: null,
          breach: false,
          products: [
            {
              securityId: 'p2',
              name: 'Produkt 2',
              valueCents: 40_000,
              shareBp: 4_000,
              depots: ['Depot X'],
              ttwror12: 0.05,
            },
          ],
        },
      ],
      regions: [
        {
          region: null,
          valueCents: 100_000,
          shareBp: 10_000,
          products: [
            { securityId: 'p1', name: 'Produkt 1', valueCents: 60_000 },
            { securityId: 'p2', name: 'Produkt 2', valueCents: 40_000 },
          ],
        },
      ],
      regionsComplete: false,
      speculative: {
        totalCents: 100_000,
        valueCents: 0,
        grossExposureCents: 0,
        shareBp: 0,
        limitBp: 1_000,
        overCents: 0,
        breach: false,
      },
      history: null,
      ...overrides,
    },
  };
  return {
    allocation: {
      ...payload.allocation,
      compositionGroups: [
        {
          assetClassId: 'g',
          name: 'Gruppe A',
          valueCents: 60_000,
          shareBp: 10_000,
          portfolioShareBp: 6_000,
          targetBp: 4_000,
          deviationBp: 2_000,
          classes: payload.allocation.compositionClasses.map((c) => ({
            ...c,
            portfolioShareBp: 6000,
          })),
        },
      ],
    },
  };
};

sampleTest(
  'target classes retain unheld products, empty swatches and kind hints',
  async ({ page }, info) => {
    sampleTest.setTimeout(90_000);
    const payload = mock({});
    const group = payload.allocation.compositionGroups[0]!;
    const unheld = {
      ...group.classes[0]!,
      assetClassId: 'reserve',
      name: 'Reserve A',
      valueCents: 0,
      shareBp: 0,
      portfolioShareBp: 0,
      targetBp: 1000,
      deviationBp: -1000,
      products: [],
      assignedSecurities: [
        {
          securityId: 'unheld',
          name: 'Produkt Reserve',
          isin: 'AT0000000011',
          kind: 'other',
          held: false,
        },
      ],
    };
    group.classes.push(unheld);
    payload.allocation.classes.push(unheld);
    payload.allocation.compositionClasses.push(unheld);
    await page.route('**/api/portfolio/allocation-report', (route) =>
      route.fulfill({ json: payload }),
    );
    await page.goto('/reports/pallocation');
    const row = page.locator('.alloc-table tr.is-class').filter({ hasText: 'Reserve A' });
    await expect(row).toContainText('0,0 %');
    await expect(row).toContainText('10,0 %');
    await expect(row).toContainText('−10,0');
    await expect(
      page.getByTestId('soll-table').locator('tr').filter({ hasText: 'Reserve A' }),
    ).toContainText('0,0 %');
    const product = page.locator('.alloc-table tr').filter({ hasText: 'Produkt Reserve' });
    await expect(product).toContainText('noch nicht gekauft');
    await expect(product).toContainText('AT0000000011');
    await expect(product).toContainText('Typ „Sonstiges“ prüfen');
    await expect(product.getByRole('link', { name: 'Produkt Reserve' })).toHaveAttribute(
      'href',
      /produkt=unheld/,
    );
    const legend = page.locator('.composition-line.is-class').filter({ hasText: 'Reserve A' });
    await expect(legend).toContainText('0 € von Soll 10,0 %');
    await expect(legend.locator('.is-empty')).toHaveCount(1);
    await expect(page.getByTestId('sunburst-classes').locator('.sb-arc')).toHaveCount(2);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await accessibleAndContained(page, info.project.use.viewport!.width as number);
      await screenshot(page, `unheld-${theme}-${info.project.name}.png`, info);
    }
    // An entirely unheld portfolio still shows its targets and assigned products.
    payload.allocation.classifiedCents = 0;
    payload.allocation.totalCents = 0;
    payload.allocation.classes = [unheld];
    group.classes = [unheld];
    group.valueCents = 0;
    group.shareBp = 0;
    await page.reload();
    await expect(page.locator('.composition-legend')).toContainText('Reserve A');
    await expect(product).toContainText('noch nicht gekauft');
    await expect(page.getByTestId('sunburst-classes')).toHaveCount(0);
  },
);

sampleTest(
  'group and class rings retain full names and keyboard tooltips below six percent',
  async ({ page }, info) => {
    sampleTest.setTimeout(90_000);
    const payload = mock({});
    const group = payload.allocation.compositionGroups[0]!;
    const original = group.classes[0]!;
    group.name = 'Kryptogruppe';
    // Assigned cash stays outside the chart but belongs to the group's full Soll/Ist universe.
    group.portfolioShareBp = 6500;
    group.deviationBp = 2500;
    group.classes = [
      {
        ...original,
        name: 'Klasse mit langem vollstaendigem Namen',
        valueCents: 57000,
        shareBp: 9500,
        portfolioShareBp: 6200,
        targetBp: 3800,
        deviationBp: 2400,
        products: [{ ...original.products[0]!, valueCents: 57000, shareBp: 9500 }],
      },
      {
        ...original,
        assetClassId: 'b',
        name: 'Coin B',
        valueCents: 3000,
        shareBp: 500,
        portfolioShareBp: 300,
        targetBp: 200,
        deviationBp: 100,
        products: [
          {
            ...original.products[0]!,
            securityId: 'p3',
            name: 'Produkt 3',
            valueCents: 3000,
            shareBp: 500,
          },
        ],
      },
    ];
    await page.route('**/api/portfolio/allocation-report', (route) =>
      route.fulfill({ json: payload }),
    );
    await page.goto('/reports/pallocation');
    const chart = page.getByTestId('sunburst-classes');
    await expect(chart.locator('path')).toHaveCount(3);
    await expect(chart.locator('text')).not.toContainText(['Coin B']);
    await expect(chart.locator('text')).not.toContainText(['…']);
    await expect(page.locator('.composition-legend')).toContainText(group.classes[0]!.name);
    await chart.locator('..').focus();
    await expect(
      page
        .locator('.chart-tooltip')
        .getByText('Anteil am Portfolio', { exact: true })
        .locator('..'),
    ).toContainText('65,0');
    // The share comes from the matched R13 base (portfolioShareBp), never from a second ratio.
    await expect(page.locator('.chart-tooltip')).not.toContainText('Ist · Sollvergleich');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.chart-tooltip')).toContainText('Coin B');
    await expect(page.locator('.chart-tooltip')).toContainText('5,00');
    await expect(page.locator('.chart-tooltip')).toContainText('3,0');
    await page.keyboard.press('Escape');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await accessibleAndContained(page, info.project.use.viewport!.width as number);
      await screenshot(page, `grouped-allocation-${theme}-${info.project.name}.png`, info);
    }
    const fills = () =>
      chart.locator('path').evaluateAll((paths) => paths.map((p) => getComputedStyle(p).fill));
    const forcedDark = await fills();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await expect.poll(fills).toEqual(forcedDark);
  },
);

sampleTest(
  'allocation report is honest about breaches, missing regions, history and errors',
  async ({ page }, info) => {
    sampleTest.setTimeout(60_000);
    await page.route('**/api/portfolio/allocation-report', (route) =>
      route.fulfill({ json: mock({}) }),
    );
    await page.goto('/reports/pallocation');
    await expect(page.getByTestId('soll-table')).toContainText('außerhalb des Bands (R13', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('soll-table')).toContainText('kein Soll hinterlegt');
    await expect(page.getByTestId('soll-table').locator('.is-out')).toHaveCount(0);
    await expect(page.getByText(/Vorläufig: Klassifikation/)).toBeVisible();
    await expect(
      page.getByText('Regionen: für die meisten Produkte keine Länderanteile hinterlegt'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Länderanteile bearbeiten' })).toHaveAttribute(
      'href',
      /panel=instrument/,
    );
    await expect(page.getByRole('table', { name: 'Regionen', exact: true })).toHaveCount(0);
    await expect(page.locator('.sb-composition')).toContainText('Gruppe A');
    const chart = page.getByTestId('sunburst-classes');
    await chart.locator('..').focus();
    await expect(page.locator('.chart-tooltip')).toContainText('Anteil innerhalb der Gruppe');
    await expect(page.locator('.chart-tooltip')).toContainText('Soll');
    await expect(page.locator('.chart-tooltip')).toContainText('60,0');
    await page.keyboard.press('Escape');
    await expect(
      page.getByText('Für den Verlauf liegt keine bewertbare Historie vor.'),
    ).toBeVisible();
    await expect(page.getByTestId('allocation-separate')).toContainText('Produkt 2');
    await expect(page.getByTestId('alloc-total')).toHaveText('600,00 €');
    await accessibleAndContained(page, info.project.use.viewport!.width as number);
    await page.unroute('**/api/portfolio/allocation-report');

    await page.route('**/api/portfolio/allocation-report', (route) =>
      route.fulfill({ json: mock({ totalCents: 0, classes: [], regions: [] }) }),
    );
    await page.reload();
    await expect(
      page.getByRole('status').filter({ hasText: 'keine Wertpapierpositionen' }),
    ).toBeVisible({ timeout: 15_000 });
    await page.unroute('**/api/portfolio/allocation-report');

    await page.route('**/api/portfolio/allocation-report', (route) =>
      route.fulfill({
        status: 503,
        json: { error: 'valuation_unavailable', message: 'Fehlender Wechselkurs für USD.' },
      }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Fehlender Wechselkurs für USD.');
    await expect(page.getByTestId('sunburst-classes')).toHaveCount(0);
  },
);
