import type { Page } from '@playwright/test';

/**
 * #1007: on a phone (redesign ON) a tap or Enter on a Plan category opens the full-screen
 * "Zuweisen"; its "Details" button opens the inspector the older steps expect.
 */
export async function openDetailsFromPhoneSheet(page: Page) {
  if (page.viewportSize()!.width >= 768) return;
  if ((await page.locator('.app').getAttribute('data-budget-redesign')) !== '1') return;
  await page
    .getByRole('dialog', { name: /^Zuweisen für / })
    .getByRole('button', { name: 'Details', exact: true })
    .click();
}
