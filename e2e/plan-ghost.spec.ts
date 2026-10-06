import { test } from './isolated-ledger';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('ghosts, selected quick assignment and capped empty-fill share grouped undo', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(60_000);
  const send = async (method: 'POST' | 'PUT', path: string, data: unknown) => {
    const res = await request.fetch(`/api${path}`, { method, data, headers: { origin: baseURL! } });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const { account } = await send('POST', '/accounts', {
    name: 'Testgeld',
    type: 'checking',
    openingDate: '2026-07-01',
    openingBalanceCents: 103_329,
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Testschnellplan' });
  const make = async (name: string) =>
    (
      await send('POST', '/categories', {
        name,
        groupId: group.id,
        class: 'need',
        kind: 'variable',
        stage: 2,
      })
    ).category;
  const goal = await make('Testziel');
  const history = await make('Testhistorie');
  await make('Testleer');
  await send('PUT', `/categories/${goal.id}/target`, {
    validFrom: '2026-10',
    target: { kind: 'monthly', amountCents: 40_001 },
  });
  for (const [month, amountCents] of [
    ['2026-07', -10_001],
    ['2026-08', -19_002],
    ['2026-09', -30_004],
  ] as const)
    await send('POST', '/bookings', {
      type: 'booking',
      accountId: account.id,
      date: `${month}-02`,
      categoryId: history.id,
      amountCents,
    });
  await send('PUT', '/budget/2026-09/assigned', {
    items: [{ categoryId: history.id, assignedCents: 33_333 }],
  });
  await page.goto('/plan/monat?monat=2026-10');
  const row = (name: string) => page.locator('tr.prow', { hasText: name });
  const assigned = (name: string) => row(name).locator('.assign-btn');
  const toast = page.locator('.toast.is-open');
  await expect(assigned('Testziel')).toHaveText('≈ 400,01 €');
  await expect(assigned('Testhistorie')).toHaveText('≈ 190,02 €');
  await expect(assigned('Testleer')).toHaveText('0,00 €');
  await expect(assigned('Testhistorie')).toHaveAttribute('title', /Median der Ausgaben/);
  await expect(assigned('Testziel')).toHaveAttribute('title', /Ziel/);
  await page.getByRole('checkbox', { name: 'Testziel auswählen' }).check();
  await page.getByRole('checkbox', { name: 'Testhistorie auswählen' }).check();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: `test-results/plan-ghost-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Wie letzter Monat', exact: true }).click();
  await expect(assigned('Testhistorie')).toHaveText('333,33 €');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testhistorie')).toHaveText('≈ 190,02 €');
  await page.getByRole('button', { name: 'Ø 3 Monate', exact: true }).click();
  await expect(assigned('Testhistorie')).toHaveText('196,69 €');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testhistorie')).toHaveText('≈ 190,02 €');
  await page.getByRole('button', { name: 'Ziel', exact: true }).click();
  await expect(assigned('Testziel')).toHaveText('400,01 €');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testziel')).toHaveText('≈ 400,01 €');
  await page.getByRole('button', { name: 'Leere füllen', exact: true }).click();
  await expect(toast).toContainText('2 Kategorien befüllt · 180,10 € fehlen für 1 Kategorie');
  await expect(assigned('Testziel')).toHaveText('400,01 €');
  await expect(assigned('Testhistorie')).toHaveText('9,92 €');
  await expect(page.getByTestId('to-be-assigned')).toHaveText('0,00 €');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testziel')).toHaveText('≈ 400,01 €');
  await expect(assigned('Testhistorie')).toHaveText('≈ 190,02 €');
  await toast.getByRole('button', { name: 'Wiederholen' }).click();
  await expect(assigned('Testhistorie')).toHaveText('9,92 €');
});
