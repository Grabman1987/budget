import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

/**
 * Plan › Monat "Verteilen ▾" (#588): every action sends the existing quick-assign call and is one
 * undo group. Same data and literal expectations as `plan-ghost.spec.ts` (which pins the figures
 * independently of the implementation); only the entry point differs.
 */
test('"Verteilen ▾" actions book like the quick-assign calls and each undo restores the ghosts', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
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
  const { group } = await send('POST', '/categories/groups', { name: 'Testverteilen' });
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
  const phone = info.project.name !== 'desktop';
  const assigned = (name: string) => row(name).locator(phone ? '.phone-assigned' : '.assign-btn');
  const shown = (value: string) => (phone ? `Zugewiesen ${value}` : value);
  const toast = page.locator('.toast.is-open');
  const verteilen = page.locator('.plan-menu summary', { hasText: 'Verteilen' });
  const item = (name: string) =>
    page.locator('.plan-menu-panel').getByRole('button', { name, exact: true });
  const run = async (name: string) => {
    await verteilen.click();
    await item(name).click();
  };
  await expect(assigned('Testziel')).toHaveText(shown('≈ 400,01 €'));
  await expect(assigned('Testhistorie')).toHaveText(shown('≈ 190,02 €'));

  // Without a selection the per-category actions are visibly not available and say why.
  await verteilen.click();
  await expect(item('Wie letzter Monat')).toHaveAttribute('aria-disabled', 'true');
  await expect(item('Wie letzter Monat')).toHaveAccessibleDescription(
    'Erst Kategorien in der Liste auswählen',
  );
  await verteilen.click();

  await page.getByRole('checkbox', { name: 'Testhistorie auswählen' }).check();
  await run('Wie letzter Monat');
  await expect(assigned('Testhistorie')).toHaveText(shown('333,33 €'));
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testhistorie')).toHaveText(shown('≈ 190,02 €'));

  await run('Ø 3 Monate');
  await expect(assigned('Testhistorie')).toHaveText(shown('196,69 €'));
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testhistorie')).toHaveText(shown('≈ 190,02 €'));

  await page.getByRole('checkbox', { name: 'Testhistorie auswählen' }).uncheck();
  await page.getByRole('checkbox', { name: 'Testziel auswählen' }).check();
  await run('Ziele');
  await expect(assigned('Testziel')).toHaveText(shown('400,01 €'));
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testziel')).toHaveText(shown('≈ 400,01 €'));

  await run('Leere füllen');
  await expect(toast).toContainText('2 Kategorien befüllt · 180,10 € fehlen für 1 Kategorie');
  await expect(assigned('Testziel')).toHaveText(shown('400,01 €'));
  await expect(assigned('Testhistorie')).toHaveText(shown('9,92 €'));
  await expect(page.getByTestId('to-be-assigned')).toHaveText('0,00 €');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testziel')).toHaveText(shown('≈ 400,01 €'));
  await expect(assigned('Testhistorie')).toHaveText(shown('≈ 190,02 €'));

  // At 0 € to distribute the assistant is not silently grey.
  await run('Leere füllen');
  await expect(page.getByTestId('to-be-assigned')).toHaveText('0,00 €');
  await verteilen.click();
  await expect(verteilen).toHaveAttribute('title', 'Nichts zu verteilen');
  await expect(item('Wasserfall-Assistent')).toHaveAttribute('aria-disabled', 'true');
  await expect(item('Wasserfall-Assistent')).toHaveAccessibleDescription('Nichts zu verteilen');
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
});
