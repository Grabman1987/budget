import {
  expect,
  test,
  type Page,
  type PageAssertionsToHaveScreenshotOptions,
} from '@playwright/test';

/**
 * Baseline screenshots are rendered on Linux (CI and the Playwright container, see docs/ops.md and
 * README). Font rasterisation differs on Windows and macOS, so there the comparison is skipped
 * with a visible annotation instead of failing on pixels that were never meant to match.
 */
export const VISUAL_BASELINE_PLATFORM = 'linux';

export async function expectScreenshot(
  page: Page,
  name: string,
  options?: PageAssertionsToHaveScreenshotOptions,
): Promise<void> {
  if (process.platform !== VISUAL_BASELINE_PLATFORM) {
    test.info().annotations.push({
      type: 'visual comparison skipped',
      description: `${name}: baselines exist for ${VISUAL_BASELINE_PLATFORM} only (this is ${process.platform}). Run in mcr.microsoft.com/playwright:v1.56.1-noble, see README.`,
    });
    return;
  }
  await expect(page).toHaveScreenshot(name, options);
}
