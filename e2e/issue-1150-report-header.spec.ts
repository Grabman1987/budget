import { sampleTest as test, expect } from './sample';
import AxeBuilder from '@axe-core/playwright';
import { setTheme } from './theme';

for (const theme of ['light', 'dark'] as const)
  test(`compact report header and nested menu (${theme})`, async ({ page }, info) => {
    await page.goto('/reports/onepager?monat=2026-08&period=month');
    await setTheme(page, theme);
    const head = page.getByTestId('redesign-report-head');
    await expect(page.getByTestId('r5-month-saved')).toBeVisible();
    await page.getByLabel('Bericht wechseln', { exact: true }).click();
    const parent = page.getByRole('link', { name: '1. Monatsbericht', exact: true });
    const child = page.getByRole('link', { name: 'Finanz-Check-Verlauf', exact: true });
    const parentBox = (await parent.boundingBox())!;
    const childBox = (await child.boundingBox())!;
    expect(childBox.x).toBeGreaterThan(parentBox.x);
    await page.screenshot({ path: info.outputPath(`report-menu-${theme}.png`) });
    await child.click();
    await expect(page).toHaveURL(/darstellung=finanzcheck/);
    await expect(page.getByTestId('fc-ok-count')).toBeVisible();
    await expect(head.getByRole('heading', { level: 1 })).toHaveText('Finanz-Check-Verlauf');
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
    await page.reload();
    await expect(head.getByRole('heading', { level: 1 })).toHaveText('Finanz-Check-Verlauf');
    await page.goBack();
    await expect(page.getByTestId('r5-month-saved')).toBeVisible();
  });
