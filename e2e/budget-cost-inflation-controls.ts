import { expect, type Page } from '@playwright/test';
import { redesignReportsOn } from './report-frame';

/** Open the retained full readers for their existing financial assertions, in either build. */
export async function retainBudgetCostInflationReaders(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const id of [
        'adherence-categories',
        'adherence-allocation',
        'adherence-deviation',
        'accuracy-method',
        'accuracy-categories',
        'contracts-history',
        'contracts-increases',
        'contracts-list',
        'contracts-fx',
        'costs-model',
        'costs-calculation',
        'costs-source',
        'costs-credit',
        'costs-kinds',
        'costs-sources',
        'costs-years',
        'inflation-basis',
        'inflation-method',
        'inflation-monthly',
        'inflation-yearly',
        'inflation-contributions',
        'inflation-basket',
      ])
        localStorage.setItem(`budget-report-r8-${id}`, '1');
    } catch {
      /* Private storage may be unavailable. */
    }
  });
}
export async function chooseBudgetCostInflationView(
  page: Page,
  label: string,
  value: string,
  text: string,
) {
  if (await redesignReportsOn(page)) {
    const select = page.getByRole('combobox', { name: label, exact: true });
    await select.selectOption(value);
    await expect(select).toHaveValue(value);
    await expect(select).toBeFocused();
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  } else {
    const button = page
      .getByRole('group', { name: label, exact: true })
      .getByRole('button', { name: text, exact: true });
    await button.focus();
    await button.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    // The original basket test required 44px; legacy desktop mode buttons retain their OFF size.
    if (label === 'Warenkorbansicht')
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
}
