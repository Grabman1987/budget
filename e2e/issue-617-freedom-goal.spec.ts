import AxeBuilder from '@axe-core/playwright';
import { changeFreedomGoal, openDatabase, saveProfile } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { FreedomGoalState } from '@budget/domain';
import { test } from './isolated-ledger';
import { freedomUniverseFixture615 } from '../packages/db/src/repos/freedom-universe-fixture-615';

test.use({ ledgerToday: '2024-02-01' });

function seed(path: string, saved = false) {
  const opened = openDatabase(path);
  try {
    freedomUniverseFixture615(opened);
    saveProfile(
      opened.db,
      { birthDate: '1980-06-15' },
      { actor: 'synthetic-fixture' },
      '2024-02-01',
    );
    if (saved)
      changeFreedomGoal(
        opened.db,
        'none',
        { kind: 'year', year: 2025 },
        { actor: 'synthetic-fixture' },
        '2024-02-01',
      );
  } finally {
    opened.close();
  }
}
const goal = async (page: Page) =>
  (await (await page.request.get('/api/wealth/freedom/goal')).json()) as FreedomGoalState;

test('stored year and age survive reload, audited undo/redo and a real second-context conflict', async ({
  page,
  browser,
  isolatedLedger,
  baseURL,
}) => {
  test.setTimeout(90_000); // One bounded scenario covers save/reload/age/undo/redo/conflict/clear.
  seed(isolatedLedger.databasePath);
  await page.goto('/vermoegen/freiheit');
  await page.getByLabel('Rendite nach Inflation', { exact: true }).selectOption('0');
  const year = page.getByLabel('Zieljahr', { exact: true });
  await year.fill('2025');
  await page.getByRole('button', { name: 'Ziel speichern', exact: true }).click();
  await expect(page.getByTestId('freedom-required-saving')).toContainText('4,55');
  expect(await goal(page)).toMatchObject({ goalYear: 2025, goalAge: 45 });
  const privateState = await goal(page);
  expect(JSON.stringify(privateState)).not.toContain('1980-06-15');
  expect(privateState).not.toHaveProperty('birthDate');
  expect(privateState).not.toHaveProperty('birthYear');
  await page.reload();
  await expect(year).toHaveValue('2025');
  await page.getByLabel('Rendite nach Inflation', { exact: true }).selectOption('0');
  await expect(page.getByTestId('freedom-required-saving')).toContainText('4,55');
  await page.getByLabel('Ziel bis', { exact: true }).selectOption('age');
  const age = page.getByLabel('Alter im Kalenderjahr', { exact: true });
  await age.fill('46');
  await page.getByRole('button', { name: 'Ziel speichern', exact: true }).click();
  await expect(page.getByTestId('freedom-required-saving')).toContainText('2,18');
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(age).toHaveValue('45');
  expect((await goal(page)).goalYear).toBe(2025);
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(age).toHaveValue('46');
  expect((await goal(page)).goalYear).toBe(2026);
  await page.getByLabel('Ziel bis', { exact: true }).selectOption('year');
  await year.fill('2027'); // Keep this dirty draft's original revision while another context writes.
  const second = await browser.newContext({
    baseURL,
    storageState: await page.context().storageState(),
  });
  try {
    const other = await second.newPage();
    await other.clock.setFixedTime(new Date('2024-02-01T12:00:00+01:00'));
    await other.goto('/vermoegen/freiheit');
    await other.getByLabel('Zieljahr', { exact: true }).fill('2028');
    await other.getByRole('button', { name: 'Ziel speichern', exact: true }).click();
    await expect(other.getByText('Nötige Sparrate für 2028', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ziel speichern', exact: true }).click();
    await expect(page.locator('.freedom-personal-goal [role="alert"]')).toContainText('inzwischen');
    await expect(year).toHaveValue('2027');
    expect((await goal(page)).goalYear).toBe(2028);
    await page.getByRole('button', { name: 'Aktuellen Stand laden', exact: true }).click();
    await expect(page.locator('.freedom-personal-goal [role="alert"]')).toContainText(
      'Aktueller Stand geladen',
    );
    await page.getByRole('button', { name: 'Ziel speichern', exact: true }).click();
    await expect(page.getByText('Nötige Sparrate für 2027', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ziel entfernen', exact: true }).click();
    await expect(year).toHaveValue('');
    expect((await goal(page)).goalYear).toBeNull();
    await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(year).toHaveValue('2027');
    const financial = await (await page.request.get('/api/wealth/freedom')).json();
    expect(financial).toMatchObject({ investedCents: 25000, targetCents: 30000 });
  } finally {
    await second.close();
  }
});

async function inspect(page: Page, info: TestInfo, label: string) {
  await page.goto('/vermoegen/freiheit');
  await expect(page.getByLabel('Zieljahr', { exact: true })).toHaveValue('2025');
  await page.getByLabel('Rendite nach Inflation', { exact: true }).selectOption('0');
  await page.getByLabel('Sparrate pro Monat', { exact: true }).fill('100');
  await expect(page.getByTestId('freedom-required-saving')).toContainText('4,55');
  const chart = page.getByTestId('freedom-chart');
  const marker = page.getByTestId('freedom-goal-date');
  await expect(marker).toBeVisible();
  const goalX = Number(await marker.getAttribute('x1'));
  const lastForecastX = await chart.locator('.l-forecast').evaluate((element) => {
    const path = element as SVGPathElement;
    return path.getPointAtLength(path.getTotalLength()).x;
  });
  expect(goalX).toBeGreaterThan(lastForecastX);
  expect(goalX).toBeLessThanOrEqual(
    await chart.evaluate((element) => (element as SVGSVGElement).viewBox.baseVal.width),
  );
  // The deadline extends drawing space, never the financial forecast samples.
  await page.getByRole('switch', { name: 'Prognosewerte als Tabelle' }).click();
  await expect(page.getByTestId('freedom-table').getByRole('row')).toHaveCount(3);
  await expect(page.getByTestId('freedom-table')).toContainText('350,00');
  await page.getByRole('switch', { name: 'Prognosewerte als Tabelle' }).click();
  await page.keyboard.press('Control+Shift+H');
  await expect(page.getByTestId('freedom-required-saving')).toContainText('•••');
  await expect(page.getByTestId('freedom-required-saving')).not.toContainText('4,55');
  await page.keyboard.press('Control+Shift+H');
  const phone = page.viewportSize()!.width === 390;
  for (const theme of ['dark', 'light'] as const) {
    if (phone) {
      const summary = page.locator('.m-profile > summary');
      await summary.tap();
      await page
        .locator('.m-profile')
        .getByRole('button', {
          name: theme === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
          exact: true,
        })
        .tap();
      await summary.tap();
    } else
      await page
        .locator('.sidebar-foot')
        .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
        .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    if (phone)
      for (const control of await page
        .locator(
          '.freedom-personal-goal input, .freedom-personal-goal select, .freedom-personal-goal button',
        )
        .all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      scrollTo(0, 0);
      await document.fonts.ready;
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({
      path: info.outputPath(`goal-${label}-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
}

test('goal deadline geometry, exact values and privacy remain accessible in both themes at actual profile sizes', async ({
  page,
  browser,
  isolatedLedger,
  baseURL,
}, info) => {
  test.setTimeout(90_000); // Bounded actual-theme/Axe/geometry/privacy proof across up to two profiles.
  seed(isolatedLedger.databasePath, true);
  await inspect(page, info, info.project.name);
  if (browser.browserType().name() === 'webkit') {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
      baseURL,
      storageState: await page.context().storageState(),
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    try {
      const actual = await desktop.newPage();
      await actual.clock.setFixedTime(new Date('2024-02-01T12:00:00+01:00'));
      await inspect(actual, info, 'webkit-desktop-layout1440');
    } finally {
      await desktop.close();
    }
  }
});
