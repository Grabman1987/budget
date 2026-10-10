import AxeBuilder from '@axe-core/playwright';
import type { PortfolioAllocationView } from '@budget/db';
import type { Locator, Page } from '@playwright/test';
import { sampleTest, expect, SAMPLE_URL } from './sample';

async function contained(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const result = await new AxeBuilder({ page }).include('main').analyze();
  expect(result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
    [],
  );
}

async function below(first: Locator, second: Locator) {
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
  expect(b.width).toBeCloseTo(a.width, 0);
}

sampleTest(
  'empty instruments collapse with a count and retain detail and editing paths',
  async ({ page, request }, info) => {
    sampleTest.setTimeout(120_000);
    const response = await request.post('/api/securities', {
      headers: { origin: SAMPLE_URL },
      data: { name: `Unused synthetic ${info.project.name}`, kind: 'stock', currency: 'EUR' },
    });
    expect(response.ok()).toBe(true);
    const created = (await response.json()) as {
      security: { id: string; name: string };
      groupId: string;
    };
    try {
      await page.goto('/vermoegen/portfolio');
      const catalog = page.locator('.instrument-catalog');
      const toggle = catalog.locator('summary');
      await expect(toggle).toHaveText(/Instrumente ohne Bestand \([1-9]\d*\)/);
      await expect(catalog).not.toHaveAttribute('open', '');
      await expect(page.locator('.portfolio-table')).toContainText('ETF Welt');
      const unused = catalog.getByRole('button', { name: created.security.name, exact: true });
      await expect(unused).not.toBeVisible();
      await toggle.focus();
      await toggle.press('Enter');
      await expect(unused).toBeVisible();
      const count = await catalog.locator('tbody tr').count();
      await expect(toggle).toHaveText(`Instrumente ohne Bestand (${count})`);
      expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await toggle.press('Enter');
      await expect(unused).not.toBeVisible();
      await toggle.press('Enter');
      await expect(catalog.locator('tbody tr')).toHaveCount(count);
      await unused.click();
      await expect(page).toHaveURL(new RegExp(`/instrument/${created.security.id}`));
      await page.getByRole('button', { name: 'Stammdaten bearbeiten' }).click();
      await expect(
        page.getByRole('dialog', { name: 'Stammdaten bearbeiten', exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
      await contained(page);
    } finally {
      const undo = await request.post('/api/undo', {
        headers: { origin: SAMPLE_URL },
        data: { groupId: created.groupId },
      });
      expect(undo.ok()).toBe(true);
    }
  },
);

sampleTest(
  'ratio bases and provisional classification links retain signed and gross explanations',
  async ({ page }, info) => {
    sampleTest.setTimeout(120_000);
    await page.route('**/api/portfolio/allocation', async (route) => {
      const data = (await (await route.fetch()).json()) as PortfolioAllocationView;
      data.quality = {
        ...data.quality,
        confidence: 'provisional',
        classification: 'partial',
        valuationQuality: 'estimated',
        unclassifiedSecurityIds: ['sec-etfw', 'cash:synthetic'],
        unclassifiedProductCount: 2,
        estimatedSecurityIds: ['sec-etfw'],
        staleSecurityIds: ['sec-crypto'],
      };
      await route.fulfill({ json: data });
    });
    await page.goto('/vermoegen/portfolio');
    await expect(page.locator('.portfolio-positions')).toContainText('ohne Kassa');
    const allocation = page.getByRole('region', { name: 'Aufteilung Soll/Ist', exact: true });
    await expect(allocation).toContainText('Netto-Allokationsuniversum');
    await expect(allocation).toContainText('negative Klassenwerte ergeben negative Anteile');
    await expect(allocation).toContainText('Risikoanteile können deshalb über 100 % liegen');
    await expect(allocation).toContainText(
      'Geschätzte Werte: 1 Produkte. Veraltete Werte: 1 Produkte.',
    );
    await expect(allocation).toContainText('Sparplanoptimierung wird zurückgehalten');
    const assign = allocation.getByRole('link', {
      name: 'ETF Welt · Anlageklasse zuordnen',
      exact: true,
    });
    await expect(assign).toHaveAttribute('href', /panel=instrument.*instrument=sec-etfw/);
    await expect(
      allocation.getByRole('link', { name: 'Anlage-Cash in Kontoeinstellungen zuordnen' }),
    ).toHaveAttribute('href', '/einstellungen/konten');
    expect((await assign.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await contained(page);
      await page.screenshot({
        path: info.outputPath(`portfolio-bases-${theme}.png`),
        fullPage: true,
      });
    }
    await assign.click();
    await expect(
      page.getByRole('dialog', { name: 'Instrument bearbeiten', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('ETF Welt');
  },
);

sampleTest(
  'allocation and costs summaries and sources follow content at full width',
  async ({ page }, info) => {
    sampleTest.setTimeout(120_000);
    const loaded = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/portfolio/allocation-report',
      { timeout: 60_000 },
    );
    await page.goto('/reports/pallocation');
    expect((await loaded).ok()).toBe(true);
    await expect(page.getByTestId('sunburst-classes')).toBeVisible();
    await below(page.locator('.sb-fig'), page.locator('.composition-legend'));
    await below(
      page.locator('.sb-composition'),
      page
        .locator('.portfolio-allocation-report > .prep-card')
        .first()
        .locator('.prep-scroll')
        .first(),
    );
    await expect(page.getByTestId('soll-table').locator('thead th')).toHaveCount(6);
    await expect(page.getByTestId('speculative-note')).toContainText(
      'Nenner: Netto-Allokationsuniversum',
    );
    await contained(page);
    await page.screenshot({ path: info.outputPath('allocation-full-width.png'), fullPage: true });
    const costsLoaded = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/portfolio/costs-taxes',
      { timeout: 60_000 },
    );
    await page.goto('/reports/psteuern');
    expect((await costsLoaded).ok()).toBe(true);
    await expect(page.locator('.costs-main > section')).toHaveCount(2);
    await below(
      page.locator('.costs-main > section').first(),
      page.locator('.costs-main > section').last(),
    );
    await expect(page.locator('.costs-products thead th')).toHaveCount(7);
    await contained(page);
    await page.screenshot({ path: info.outputPath('costs-full-width.png'), fullPage: true });
  },
);
