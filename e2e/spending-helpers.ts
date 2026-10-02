import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Checks shared by the specs of the spending reports (group 2): axe without serious or critical
 * findings in both themes, no horizontal page scroll, and a screenshot for review (never a
 * baseline: set BUDGET_SPENDING_EVIDENCE to keep the pictures in a folder).
 */
export async function inspectReport(page: Page, info: TestInfo, label: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll('.sr-scroll')) el.scrollTo(0, 0);
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
      `${label} ${theme}`,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const dir = process.env['BUDGET_SPENDING_EVIDENCE'];
    if (dir) mkdirSync(dir, { recursive: true });
    await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      path: dir
        ? join(dir, `${label}-${theme}-${info.project.name}.png`)
        : info.outputPath(`${label}-${theme}.png`),
    });
  }
  await page.evaluate(() => delete document.documentElement.dataset['theme']);
}
