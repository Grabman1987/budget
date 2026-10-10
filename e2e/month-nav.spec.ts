import { addMonths } from '@budget/domain';
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
  test('payday is disabled outside this month and falls back after navigation and reload', async ({
    page,
  }, info) => {
    await page.goto('/?monat=2026-09&period=payday');
    const payday = page.getByRole('button', { name: 'Bis Gehalt', exact: true });
    const month = page.getByRole('button', { name: 'Monat', exact: true });
    await expect(payday).toBeEnabled();
    await expect(payday).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Vormonat' }).click();
    await expect(payday).toBeDisabled();
    await expect(payday).toHaveAttribute(
      'title',
      'Bis Gehalt ist nur im aktuellen Monat verfügbar.',
    );
    await expect(month).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/period=month/);
    await page.reload();
    await expect(payday).toBeDisabled();
    await expect(month).toHaveAttribute('aria-pressed', 'true');
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.screenshot({
        path: info.outputPath(`payday-disabled-${colorScheme}.png`),
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(payday).toBeEnabled();
    await expect(month).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/?monat=2026-10&period=payday');
    await expect(payday).toBeDisabled();
    await expect(month).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/period=month/);
  });

  test('arrows, keys and the way back to the current month share ?monat=', async ({ page }) => {
    test.slow();
    // Pace lives in the "Mehr zum Monat" fold, closed on the phone by default (UX-2).
    await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
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
    test.skip(info.project.name === 'mobile', 'the phone has neither search field nor wide plan');
    // The header search field moved to its own result page (no month switch there). The month
    // keys' guard for fields is shared with Plan › Monat, whose cover select is a real field.
    await page.goto('/plan/monat?monat=2026-09');
    await page.locator('#cover-all-source').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/monat=2026-09/);
    // The search field keeps the arrow keys for its caret.
    await page.goto('/?monat=2026-09');
    await page.locator('#global-search').click();
    const field = page.getByRole('combobox', { name: 'Suchen', exact: true });
    await expect(field).toBeFocused();
    await page.keyboard.type('ab');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('X');
    await expect(field).toHaveValue('aXb');
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
    await expect(page.getByRole('button', { name: 'Nach Stufen' })).toBeVisible();
  });

  test('the phone keeps one month whatever was chosen', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'desktop shows the choice');
    await withSpan(3)(page);
    await page.goto('/plan/monat?monat=2026-09');
    await expect(page.getByRole('heading', { name: 'September 2026', exact: true })).toBeVisible();
    await expect(page.locator('.ptable-multi')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Anzahl Monate' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Nach Stufen' })).toBeVisible();
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

mainTest(
  'Decken writes and undoes the selected past, current and future month',
  async ({ page }, info) => {
    mainTest.setTimeout(120_000);
    const current = viennaToday.slice(0, 7);
    const headers = { origin: MAIN_URL };
    const tag = `${info.project.name}-${Date.now()}`;
    const account = (
      await post(page.request, '/accounts', {
        name: `Cover months ${tag}`,
        type: 'checking',
        openingDate: `${addMonths(current, -1)}-01`,
        openingBalanceCents: 100_000,
      })
    )['account']!;
    const group = (await post(page.request, '/categories/groups', { name: `Cover months ${tag}` }))[
      'group'
    ]!;
    for (const delta of [-1, 0, 1]) {
      const selected = addMonths(current, delta);
      const targetName = `Ausgabe ${delta} ${tag}`;
      const target = (
        await post(page.request, '/categories', {
          name: targetName,
          groupId: group.id,
          class: 'need',
          stage: 2,
        })
      )['category']!;
      const source = (
        await post(page.request, '/categories', {
          name: `Reserve ${delta} ${tag}`,
          groupId: group.id,
          class: 'want',
          stage: 2,
        })
      )['category']!;
      await post(page.request, '/bookings', {
        type: 'booking',
        accountId: account.id,
        date: `${selected}-01`,
        amountCents: -5_000,
        categoryId: target.id,
      });
      const assigned = await page.request.put(`/api/budget/${selected}/assigned`, {
        headers,
        data: { items: [{ categoryId: source.id, assignedCents: 10_000 }] },
      });
      expect(assigned.ok()).toBe(true);
      await page.goto(`/plan/monat?monat=${selected}`);
      const targetRow = page.locator('tr.prow', { hasText: targetName });
      await expect(targetRow.locator('.col-avail')).toHaveText('−50,00 €');
      // The compact row control opens the envelope panel (UX-2 replaced the triage table rows).
      await page.getByRole('button', { name: `${targetName} decken`, exact: true }).click();
      const coverPanel = page.getByRole('dialog', { name: targetName });
      await coverPanel.getByLabel('Aus', { exact: true }).selectOption(source.id);
      const covered = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith(`/api/budget/${selected}/cover`),
      );
      await coverPanel.getByRole('button', { name: 'Decken · 50,00 €', exact: true }).click();
      expect((await covered).ok()).toBe(true);
      await expect(targetRow.locator('.col-avail')).toHaveText('0,00 €');
      await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
      await expect(targetRow.locator('.col-avail')).toHaveText('−50,00 €');
      if (delta === 1 && info.project.name === 'desktop') {
        await withSpan(2)(page);
        await page.goto(`/plan/monat?monat=${current}`);
        await page.getByRole('button', { name: `${targetName}: Decken im`, exact: false }).click();
        const panel = page.getByRole('dialog');
        await expect(
          panel.getByRole('button', { name: 'Decken · 50,00 €', exact: true }),
        ).toBeVisible();
        const posted = page.waitForResponse(
          (r) =>
            r.request().method() === 'POST' && r.url().endsWith(`/api/budget/${selected}/cover`),
        );
        await panel.getByRole('button', { name: 'Decken · 50,00 €', exact: true }).click();
        expect((await posted).ok()).toBe(true);
        await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
      }
    }
  },
);
