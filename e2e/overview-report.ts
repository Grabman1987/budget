import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared checks of the Überblick report specs: no serious axe violation in light and dark, no
 * horizontal page overflow at the project's viewport, and a screenshot per theme for the evidence
 * folder (`BUDGET_OVERVIEW_EVIDENCE`) or the test output.
 */
export async function inspectReport(page: Page, info: TestInfo, label: string) {
  const width = info.project.name === 'mobile' ? 390 : 1440;
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
      [],
    );
    expect(
      await page.evaluate(() => ({
        width: window.innerWidth,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      })),
    ).toEqual({ width, overflow: false });
    const dir = process.env['BUDGET_OVERVIEW_EVIDENCE'];
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
