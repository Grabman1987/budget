import { expect, type Page } from '@playwright/test';

export const redesignEnabled = async (page: Page) =>
  (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';

export async function paymentView(page: Page, value: 'next' | 'contracts' | 'all') {
  if (await redesignEnabled(page))
    await page.getByRole('combobox', { name: 'Ansicht', exact: true }).selectOption(value);
  else
    await page
      .getByRole('button', {
        name: value === 'contracts' ? 'Verträge und Abos' : value === 'all' ? 'Alle' : 'Anstehend',
        exact: true,
      })
      .first()
      .click();
}
export async function paymentKindAll(page: Page) {
  await paymentView(page, 'all');
}
export async function paymentHorizon(page: Page, days: '35 Tage' | '90 Tage') {
  if (await redesignEnabled(page))
    await page
      .getByRole('combobox', { name: 'Zeitraum', exact: true })
      .selectOption(days === '35 Tage' ? '35' : '90');
  else await page.getByRole('button', { name: days, exact: true }).click();
}
export async function expectPaymentHorizon(page: Page, days: '35 Tage' | '90 Tage') {
  if (await redesignEnabled(page))
    await expect(page.getByRole('combobox', { name: 'Zeitraum', exact: true })).toHaveValue(
      days === '35 Tage' ? '35' : '90',
    );
  else
    await expect(page.getByRole('button', { name: days, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
}
export async function goalView(page: Page, view: 'Liste' | 'Fortschritt') {
  await page.locator('.goals-reference .plan-v2-view > summary').click();
  await page.getByRole('button', { name: view, exact: true }).click();
}

export async function openPaymentManagement(page: Page) {
  const panel = page.locator('.payment-reference-management');
  if ((await redesignEnabled(page)) && page.viewportSize()!.width >= 768) {
    await expect(panel).toBeAttached();
    if (!(await panel.evaluate((element) => (element as HTMLDetailsElement).open)))
      await panel.locator(':scope > summary').click();
  }
}

export async function forecastHorizon(
  page: Page,
  value: '90d' | '12m',
  label: '90 Tage' | '12 Monate',
) {
  if (await redesignEnabled(page))
    await page.getByRole('combobox', { name: 'Prognosezeitraum' }).selectOption(value);
  else await page.getByRole('button', { name: label, exact: true }).click();
}
