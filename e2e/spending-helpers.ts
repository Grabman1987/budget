import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTheme } from './theme';

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
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    // Audit the palette after its colour transitions (a toast fading in or out) have finished.
    await page.evaluate(async () => {
      const finite = document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
      await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
    });
    // A toast may still be fading after the theme switch; its contrast has its own spec (#672).
    const axe = await new AxeBuilder({ page }).exclude('.toast').analyze();
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
