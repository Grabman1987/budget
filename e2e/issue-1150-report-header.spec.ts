import { sampleTest as test, expect } from './sample';
import AxeBuilder from '@axe-core/playwright';
import { setTheme } from './theme';
import { expectScreenshot } from './visual';

for (const theme of ['light', 'dark'] as const)
  test(`compact report header and nested menu (${theme})`, async ({ page }, info) => {
    await page.goto('/reports/onepager?monat=2026-08&period=month');
    await setTheme(page, theme);
    const head = page.getByTestId('redesign-report-head');
    await expect(page.getByTestId('r5-month-saved')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await page.getByLabel('Bericht wechseln', { exact: true }).click();
    const parent = page.getByRole('link', { name: '1. Monatsbericht', exact: true });
    const child = page.getByRole('link', { name: 'Finanz-Check-Verlauf', exact: true });
    const parentBox = (await parent.boundingBox())!;
    const childBox = (await child.boundingBox())!;
    expect(childBox.x).toBeGreaterThan(parentBox.x);
    await page.screenshot({ path: info.outputPath(`report-menu-${theme}.png`) });
    await expectScreenshot(page, `report-menu-${theme}.png`);
    // Rule derivation invalidates the ledger queries after the first report render. Capture
    // only after the subsequent rule check and Health Scores have settled.
    const derived = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/rules/evaluate' &&
        response.request().method() === 'POST',
    );
    const refreshedCheck = page.waitForResponse(async (response) => {
      if (new URL(response.url()).pathname !== '/api/rules/check') return false;
      const evaluation = await derived;
      await evaluation.finished();
      const timing = evaluation.request().timing();
      return response.request().timing().startTime >= timing.startTime + timing.responseEnd;
    });
    await child.click();
    expect((await derived).ok()).toBe(true);
    expect((await refreshedCheck).ok()).toBe(true);
    await expect(page.getByTestId('report-verdict')).not.toContainText('Keine Bewertung möglich');
    await expect(page.getByTestId('health-assessment')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bewertung aktualisieren' })).toBeEnabled();
    await expect(page.locator('.health-stale')).toHaveCount(0);
    await expect(page).toHaveURL(/darstellung=finanzcheck/);
    await expect(page.getByTestId('fc-ok-count')).toBeVisible();
    await expect(head.getByRole('heading', { level: 1 })).toHaveText('Finanz-Check-Verlauf');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(head.getByRole('combobox', { name: 'Darstellung', exact: true })).toHaveCount(0);
    await expect(head.locator('.redesign-report-number')).toHaveCount(0);
    await expect(head.getByRole('button', { name: /Bericht:/ })).toHaveCount(0);
    const heading = head.locator('.redesign-report-heading');
    const backBox = (await heading
      .getByRole('link', { name: 'Reports', exact: true })
      .boundingBox())!;
    const titleBox = (await heading.getByRole('heading', { level: 1 }).boundingBox())!;
    const menuBox = (await page.getByLabel('Bericht wechseln', { exact: true }).boundingBox())!;
    expect(
      Math.abs(backBox.y + backBox.height / 2 - titleBox.y - titleBox.height / 2),
    ).toBeLessThan(2);
    if (info.project.name === 'desktop') {
      // Desktop: the report switcher sits in the page header (#1347), above the report frame.
      await expect(
        page.locator('.page-header').getByLabel('Bericht wechseln', { exact: true }),
      ).toBeVisible();
      expect(menuBox.y).toBeLessThan(titleBox.y);
    } else
      expect(
        Math.abs(menuBox.y + menuBox.height / 2 - titleBox.y - titleBox.height / 2),
      ).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).include('[data-testid="redesign-report-head"]').analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`report-header-${theme}.png`) });
    await expectScreenshot(page, `report-header-${theme}.png`);
    await page.reload();
    await expect(head.getByRole('heading', { level: 1 })).toHaveText('Finanz-Check-Verlauf');
    await page.goBack();
    await expect(page.getByTestId('r5-month-saved')).toBeVisible();
  });
