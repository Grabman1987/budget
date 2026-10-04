import AxeBuilder from '@axe-core/playwright';
import { allocationQuality } from '@budget/domain';
import type { PortfolioAllocationView } from '@budget/db';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';
import { MAIN_URL } from '../playwright.config';
import { sampleTest } from './sample';
const read = async (page: Page) =>
  (await (
    await page.request.get(`${MAIN_URL}/api/portfolio/allocation`)
  ).json()) as PortfolioAllocationView;
async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  if (await page.locator('dialog[open] .panel-body').count())
    await page.locator('dialog[open] .panel-body').evaluate((element) => (element.scrollTop = 0));
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
  expect(
    (
      await new AxeBuilder({ page })
        .include((await page.locator('dialog[open]').count()) ? 'dialog[open]' : 'main')
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: process.env['BUDGET_ALLOCATION_EVIDENCE']
      ? join(process.env['BUDGET_ALLOCATION_EVIDENCE'], `${name}-${info.project.name}.png`)
      : info.outputPath(`${name}.png`),
    fullPage: !(await page.locator('dialog[open]').count()),
    animations: 'disabled',
  });
}
async function browserBack(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true });
        window.history.back();
      }),
  );
}
sampleTest(
  'prototype allocation bands and existing rebalancing figures remain authoritative',
  async ({ page }, info) => {
    await page.goto('/vermoegen/portfolio');
    const allocation = page.locator('.valloc');
    await expect(allocation).toContainText('Schwellenländer');
    await expect(page.locator('.vrebal')).toContainText('Umschichtungsabstand 3.560 €');
    await expect(page.locator('.vrebal')).toContainText('3.700 € Bruttoexposure über der Grenze');
    await expect(
      page.locator('.vrebal').getByRole('button', { name: /Sparplan|Vorschlag übernehmen/ }),
    ).toHaveCount(0);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await capture(page, info, `allocation-${theme}`);
    }
    await page
      .locator('.vrebal')
      .getByRole('button', { name: 'Positionen ansehen' })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Positionen', exact: true })).toBeInViewport();
  },
);
test('empty portfolio class creation and target editor validate, save, undo/redo, reload and future version', async ({
  page,
}, info) => {
  const names = [`Aktien ${info.project.name}`, `Reserve ${info.project.name}`];
  await page.goto('/vermoegen/portfolio');
  await page.getByRole('button', { name: 'Sollquoten bearbeiten' }).click();
  const panel = page.getByRole('dialog', { name: 'Sollquoten bearbeiten' });
  await panel.getByLabel('Name der Anlageklasse').fill('Ungespeicherte Klasse');
  await browserBack(page);
  await expect(panel).toContainText('Ungespeicherte Sollquoten oder Klassenangaben');
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(panel.getByLabel('Name der Anlageklasse')).toHaveValue('Ungespeicherte Klasse');
  for (const name of names) {
    await panel.getByLabel('Name der Anlageklasse').fill(name);
    await panel.getByRole('button', { name: 'Anlageklasse anlegen', exact: true }).click();
    await expect(panel.getByLabel(`${name} · Soll (%)`)).toBeVisible();
  }
  const classes = (await read(page)).classes;
  for (const cls of classes) await panel.getByLabel(`${cls.name} · Soll (%)`).fill('0');
  await panel.getByLabel(`${names[0]} · Soll (%)`).fill('74,99');
  await panel.getByLabel(`${names[1]} · Soll (%)`).fill('25');
  await panel.getByRole('button', { name: 'Sollquoten speichern' }).click();
  await expect(panel.getByRole('alert')).toContainText('100,00 %');
  await panel.getByLabel(`${names[0]} · Soll (%)`).fill('75');
  await page.keyboard.press('Escape');
  await expect(panel).toContainText('Ungespeicherte Sollquoten');
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await capture(page, info, `targets-${theme}`);
  }
  await panel.getByLabel('Name der Anlageklasse').fill('Offener Klassenentwurf');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/asset-classes/targets', async (route) => {
    if (route.request().method() === 'PUT') await gate;
    await route.continue();
  });
  await panel.getByRole('button', { name: 'Sollquoten speichern' }).click();
  await expect(panel.getByLabel(`${names[0]} · Soll (%)`)).toBeDisabled();
  await page.keyboard.press('Escape');
  await browserBack(page);
  await expect(page).toHaveURL(/allokation=ziele/);
  await expect(panel.getByLabel('Name der Anlageklasse')).toBeDisabled();
  await expect(panel).toBeVisible();
  release();
  await expect(page.getByText('Sollquoten gespeichert.', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Name der Anlageklasse')).toHaveValue('Offener Klassenentwurf');
  await page.unroute('**/api/asset-classes/targets');
  const own = (view: PortfolioAllocationView) =>
    view.classes.filter((cls) => names.includes(cls.name)).map((cls) => cls.targetBp);
  expect(own(await read(page))).toEqual([7500, 2500]);
  await expect(page.getByText('Sollquoten gespeichert.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(async () => own(await read(page))).toEqual([null, null]);
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect.poll(async () => own(await read(page))).toEqual([7500, 2500]);
  await panel.getByLabel('Name der Anlageklasse').fill('');
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Sollquoten bearbeiten' }).click();
  await expect(panel.getByLabel(`${names[0]} · Soll (%)`)).toHaveValue('75,00');
  await panel.getByLabel('Gültig ab').fill('2050-01-01');
  await expect(panel).toContainText('Zukünftige Ziele ändern die heutige Aufteilung noch nicht.');
  await panel.getByRole('button', { name: 'Sollquoten speichern' }).click();
  await expect(panel).not.toBeVisible();
  expect(own(await read(page))).toEqual([7500, 2500]);
  await page.getByRole('button', { name: 'Sollquoten bearbeiten' }).click();
  await panel.getByLabel('Vorlage').selectOption('2050-01-01');
  await expect(panel.getByLabel('Gültig ab')).toHaveValue('2050-01-01');
  await panel.getByLabel(`${names[0]} · Soll (%)`).fill('60');
  await panel.getByLabel('Name der Anlageklasse').fill('Nicht speichern');
  await browserBack(page);
  await expect(panel).toContainText('Ungespeicherte Sollquoten oder Klassenangaben');
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(panel.getByLabel(`${names[0]} · Soll (%)`)).toHaveValue('60');
  await expect(panel.getByLabel('Name der Anlageklasse')).toHaveValue('Nicht speichern');
  await browserBack(page);
  await panel.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(panel).not.toBeVisible();
  expect(own(await read(page))).toEqual([7500, 2500]);
});
test('unknown current quote is estimated at cost with a hint, and API failures offer retry', async ({
  page,
  request,
}, info) => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${MAIN_URL}/api${path}`, {
      headers: { origin: MAIN_URL },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const account = (
    await post('/accounts', {
      name: `Depot ohne Kurs ${info.project.name}`,
      type: 'brokerage',
      openingDate: '2026-01-01',
    })
  ).account;
  const security = (
    await post('/securities', { name: `Fonds ohne Kurs ${info.project.name}`, kind: 'fund' })
  ).security;
  await post('/trades', {
    accountId: account.id,
    securityId: security.id,
    date: '2026-09-01',
    kind: 'buy',
    units: '2',
    amountCents: 6000,
  });
  await page.goto('/vermoegen/portfolio');
  // Without any quote the position is valued at its cost basis and flagged, never dropped.
  await expect(page.getByText(/teilweise geschätzt/).first()).toBeVisible();
  await page.route('**/api/portfolio/allocation', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.reload();
  await expect(page.locator('.valloc')).toContainText('Aufteilung konnten nicht geladen werden.');
  await page.unroute('**/api/portfolio/allocation');
  await page.locator('.valloc').getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.locator('.valloc')).not.toContainText('konnten nicht geladen werden');
  await expect(page.getByText(/teilweise geschätzt/).first()).toBeVisible();
  await page.route('**/api/asset-classes/targets', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.getByRole('button', { name: 'Sollquoten bearbeiten' }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('Zielversionen konnten nicht geladen werden.');
  await expect(panel.getByRole('button', { name: 'Sollquoten speichern' })).toHaveCount(0);
  await page.unroute('**/api/asset-classes/targets');
  await panel.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(panel.getByRole('button', { name: 'Sollquoten speichern' })).toBeVisible();
});

sampleTest(
  'R07/R08 provisional allocation has visible quality and no certain red recommendation',
  async ({ page }, info) => {
    const response = await page.request.get('/api/portfolio/allocation');
    const base = (await response.json()) as PortfolioAllocationView;
    const quality = allocationQuality(
      [
        {
          id: 'unknown',
          securityId: 'unknown',
          kind: 'other',
          assetClass: null,
          valueCents: 10000,
        },
        {
          id: 'estimated',
          securityId: 'estimated',
          kind: 'etf',
          assetClass: 'a',
          valueCents: 90000,
        },
      ],
      { estimatedSecurityIds: ['estimated'] },
    );
    await page.route('**/api/portfolio/allocation', (route) =>
      route.fulfill({
        json: {
          ...base,
          valuationQuality: quality.valuationQuality,
          quality,
          risk: {
            ...base.risk,
            quality,
            proposals: base.risk!.proposals.map((p) => ({ ...p, confidence: 'provisional' })),
          },
        },
      }),
    );
    await page.goto('/vermoegen/portfolio');
    await expect(page.locator('.valloc')).toContainText('Unklassifiziert: 100 €');
    await expect(page.locator('.valloc')).toContainText('teilweise geschätzt');
    await expect(page.locator('.vrebal')).toContainText('Vorläufig:');
    await expect(page.locator('.vrebal .is-urgent')).toHaveCount(0);
    await expect(page.locator('.valloc .is-out')).toHaveCount(0);
    await expect(page.locator('.vrebal')).toContainText('Umschichtungsabstand');
    await expect(page.locator('.vrebal')).toContainText('Neues Kapital bis Soll');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      await capture(page, info, `allocation-quality-${theme}`);
    }
    await page.unroute('**/api/portfolio/allocation');
    await page.route('**/api/portfolio/allocation', (route) =>
      route.fulfill({
        json: {
          ...base,
          status: 'unavailable',
          valueCents: null,
          risk: null,
          missing: ['missing_price'],
          valuationQuality: 'incomplete',
          quality: {
            ...quality,
            valuationQuality: 'incomplete',
            missingPriceSecurityIds: ['unknown'],
          },
        },
      }),
    );
    await page.reload();
    await expect(page.locator('.valloc')).toContainText('nicht berechenbar');
    await expect(page.locator('.vrebal .rev-row')).toHaveCount(0);
  },
);
