import AxeBuilder from '@axe-core/playwright';
import { test as mainTest, type APIRequestContext, type Page } from '@playwright/test';
import { MAIN_URL } from '../playwright.config';
import { expect, sampleTest as test } from './sample';

/**
 * Month navigation on the seeded sample server ("today" is 17.09.2026): the month switch on Heute,
 * and Plan › Monat with up to three months side by side. The shared sample ledger is read-mostly:
 * the one write below is undone.
 */

const STORAGE = 'budget.plan.months';
const withSpan = (n: number) => (page: Page) =>
  page.addInitScript(([key, value]) => localStorage.setItem(key!, value!), [
    STORAGE,
    String(n),
  ] as const);

const SLOW = { timeout: 20_000 };

test.describe('Heute month switch', () => {
  test('arrows, keys and the way back to the current month share ?monat=', async ({ page }) => {
    test.slow();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'September 2026', exact: true })).toBeVisible();
    // The current month needs no way back and no note about anchored figures.
    await expect(page.getByRole('button', { name: 'Zum aktuellen Monat' })).toHaveCount(0);
    await expect(page.getByTestId('heute-month-note')).toHaveCount(0);

    await page.getByRole('button', { name: 'Vormonat' }).click();
    await expect(page).toHaveURL(/monat=2026-08/);
    await expect(page.getByRole('heading', { name: 'August 2026', exact: true })).toBeVisible();
    // Bis Gehalt stays anchored to today and says so.
    await expect(page.getByTestId('heute-anchor')).toContainText('ab heute (17.09.', SLOW);
    await expect(page.getByTestId('heute-month-note')).toContainText('Stand von heute', SLOW);
    await expect(page.getByText('August 2026 · Pace')).toBeVisible(SLOW);

    // Arrow keys with nothing focused move the month, like the buttons.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/monat=2026-10/);
    await expect(page.getByText('Oktober 2026 · Pace')).toBeVisible(SLOW);
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/monat=2026-09/);

    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await page.getByRole('button', { name: 'Zum aktuellen Monat' }).first().click();
    await expect(page.getByRole('heading', { name: 'September 2026', exact: true })).toBeVisible();
    await expect(page.getByTestId('heute-anchor')).toHaveCount(0);
  });

  test('the arrow keys stay with a focused field', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'the search field is not on the phone');
    await page.goto('/?monat=2026-09');
    await page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/Suchen/))
      .first()
      .focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/monat=2026-09/);
  });
});

test.describe('Plan › Monat with several months', () => {
  test('2 and 3 months side by side, the window follows ?monat=, the choice persists', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile', 'the phone always shows one month');
    await page.goto('/plan/monat?monat=2026-09');
    await expect(page.locator('.ptable-multi')).toHaveCount(0);
    const span = page.getByRole('group', { name: 'Anzahl Monate' });
    await span.getByRole('button', { name: '2 Monate' }).click();
    const table = page.locator('.ptable-multi');
    await expect(table.locator('thead th.pm-head')).toHaveText([/September 2026/, /Oktober 2026/]);
    // Hero and inspector name the leftmost month; every month head carries its own Zu verteilen.
    await expect(page.locator('.hero-label')).toContainText('September 2026');
    await expect(page.getByTestId('tba-2026-09')).toHaveText(/0,00/);
    await expect(page.getByTestId('tba-2026-10')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sep – Okt 2026' })).toBeVisible();

    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(page).toHaveURL(/monat=2026-10/);
    await expect(table.locator('thead th.pm-head')).toHaveText([/Oktober 2026/, /November 2026/]);

    await span.getByRole('button', { name: '3 Monate' }).click();
    await expect(table.locator('thead th.pm-head')).toHaveCount(3);
    await page.reload();
    await expect(page.locator('.ptable-multi thead th.pm-head')).toHaveCount(3);
    await expect(span.getByRole('button', { name: '3 Monate' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await span.getByRole('button', { name: '1 Monat' }).click();
    await expect(page.locator('.ptable-multi')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Wasserfall' })).toBeVisible();
  });

  test('the phone keeps one month whatever was chosen', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'desktop shows the choice');
    await withSpan(3)(page);
    await page.goto('/plan/monat?monat=2026-09');
    await expect(page.getByRole('heading', { name: 'September 2026', exact: true })).toBeVisible();
    await expect(page.locator('.ptable-multi')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Anzahl Monate' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Wasserfall' })).toBeVisible();
  });
});

test.describe('axe on the new views', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(scheme, () => {
      test.use({ colorScheme: scheme });
      test(`Heute in another month and Plan with three months (${scheme})`, async ({
        page,
      }, info) => {
        test.slow();
        await page.goto('/?monat=2026-08');
        await expect(page.getByTestId('heute-anchor')).toBeVisible({ timeout: 20_000 });
        const heute = await new AxeBuilder({ page }).include('main').analyze();
        expect(heute.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
        if (info.project.name === 'mobile') return;
        await withSpan(3)(page);
        await page.goto('/plan/monat?monat=2026-09');
        await expect(page.locator('.ptable-multi')).toBeVisible({ timeout: 20_000 });
        const plan = await new AxeBuilder({ page }).include('main').analyze();
        expect(plan.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      });
    });
  }
});

// The write test runs on the writable main server with envelopes of its own (see plan.spec.ts).
const viennaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(
  new Date(),
);

async function post(request: APIRequestContext, path: string, data: unknown) {
  const res = await request.post(`/api${path}`, { data, headers: { origin: MAIN_URL } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as Record<string, { id: string }>;
}

mainTest(
  'Plan with two months: assigning works in the second month and its guard applies there',
  async ({ page }, info) => {
    mainTest.skip(info.project.name === 'mobile', 'the phone always shows one month');
    const month = viennaToday.slice(0, 7);
    const tag = `${info.project.name}-${Date.now().toString(36).slice(-5)}`;
    const { request } = page;
    await post(request, '/accounts', {
      name: `Giro Monate ${tag}`,
      type: 'checking',
      openingDate: `${month}-01`,
      openingBalanceCents: 100_000,
    });
    const group = (await post(request, '/categories/groups', { name: `Monate ${tag}` }))['group']!;
    const name = `Kino M ${tag}`;
    await post(request, '/categories', { name, groupId: group.id, class: 'want', stage: 2 });

    await withSpan(2)(page);
    await page.goto(`/plan/monat?monat=${month}`);
    const row = page.locator('tr.prow', { hasText: name });
    await expect(row).toBeVisible();
    const first = row.locator('td.col-assign').nth(0);
    const second = row.locator('td.col-assign').nth(1);
    const edit = second.getByRole('button', { name: /Zugewiesen .* ändern/ });

    // More than the second month can distribute is refused there, with the way to the maximum.
    await edit.click();
    await second.getByRole('textbox').fill('9999999');
    await second.getByRole('textbox').press('Enter');
    await expect(second.getByRole('alert')).toContainText(/Zu verteilen/);
    await second.getByRole('textbox').press('Escape');

    await edit.click();
    await second.getByRole('textbox').fill('50');
    await second.getByRole('textbox').press('Enter');
    const toast = page.locator('.toast.is-open');
    await expect(toast).toContainText(`${name} (`);
    await expect(toast).toContainText('50,00');
    await expect(second).toContainText('50,00 €');
    await expect(first).toContainText('0,00 €');
    await toast.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(second).toContainText('0,00 €');
  },
);
