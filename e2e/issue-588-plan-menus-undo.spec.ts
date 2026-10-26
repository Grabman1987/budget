import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

/** Phone-only equivalents for the owner-approved explicit selection controls. */
async function enterPhoneSelection(page: Page) {
  const options = page.locator('details.plan-menu').filter({
    has: page.locator('summary', { hasText: 'Optionen' }),
  });
  await options.locator('summary').click();
  await options.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Kategorienauswahl', exact: true })).toBeVisible();
}
async function expectPhoneSelectionTargets(page: Page) {
  const categories = page.locator('.ptable .pname:visible');
  const toggles = page.locator('.ptable .plan-select-toggle:visible');
  expect(await categories.count()).toBeGreaterThan(0);
  const headings = page.locator('.ptable .group-heading:visible');
  expect(await headings.count()).toBeGreaterThan(0);
  await expect(toggles).toHaveCount(await headings.count());
  for (const heading of await headings.all())
    await expect(heading.locator('.plan-select-toggle')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: /^Alle Kategorien auswählen · \d+\/\d+$/ }),
  ).toHaveCount(1);
  for (const controls of [categories, toggles]) {
    for (let index = 0; index < (await controls.count()); index++) {
      const bounds = (await controls.nth(index).boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
  }
}

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

  if (page.viewportSize()!.width < 768) {
    await enterPhoneSelection(page);
    await page.locator(`.pname[data-category-id="${history.id}"]`).click();
    await expect(page.locator(`.pname[data-category-id="${history.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectPhoneSelectionTargets(page);
  } else {
    await page.getByRole('checkbox', { name: 'Testhistorie auswählen' }).check();
  }
  await run('Wie letzter Monat');
  await expect(assigned('Testhistorie')).toHaveText(shown('333,33 €'));
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testhistorie')).toHaveText(shown('≈ 190,02 €'));

  await run('Ø 3 Monate');
  await expect(assigned('Testhistorie')).toHaveText(shown('196,69 €'));
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testhistorie')).toHaveText(shown('≈ 190,02 €'));

  if (page.viewportSize()!.width < 768) {
    await page.locator(`.pname[data-category-id="${history.id}"]`).click();
    await expect(page.locator(`.pname[data-category-id="${history.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(
      page.getByRole('region', { name: 'Kategorienauswahl', exact: true }),
    ).toBeVisible();
    await page.locator(`.pname[data-category-id="${goal.id}"]`).click();
    await expect(page.locator(`.pname[data-category-id="${goal.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } else {
    await page.getByRole('checkbox', { name: 'Testhistorie auswählen' }).uncheck();
    await page.getByRole('checkbox', { name: 'Testziel auswählen' }).check();
  }
  await run('Ziel');
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

/**
 * "Überzogene decken" in "Verteilen ▾" is the existing `coverAll` call: one undo group. Literal
 * figures derived by hand from the seed: Giro 1.000,00 €, Café assigned 100,00 € (its own money is
 * not the source: free money 900,00 € is larger and covers first), Lebensmittel spent 50,00 € with
 * nothing assigned. Cash 950,00 € - available (-50,00 + 100,00) = Zu verteilen 900,00 €.
 */
test('"Überzogene decken" covers from the named source and its undo restores the overspending', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const send = async (method: 'POST' | 'PUT' | 'PATCH', path: string, data: unknown) => {
    const res = await request.fetch(`/api${path}`, { method, data, headers: { origin: baseURL! } });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const { account } = await send('POST', '/accounts', {
    name: 'Testgeld',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 100_000,
  });
  // Same explicit fixture as plan.spec.ts: the cover cap can never be 0 here.
  await send('PATCH', `/accounts/${account.id}`, { overdraftLimitCents: 10_000_000 });
  const { group } = await send('POST', '/categories/groups', { name: 'Testdecken' });
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
  const food = await make('Testessen');
  const cafe = await make('Testcafe');
  await send('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    categoryId: food.id,
    amountCents: -5_000,
  });
  await send('PUT', '/budget/2026-10/assigned', {
    items: [{ categoryId: cafe.id, assignedCents: 10_000 }],
  });

  await page.goto('/plan/monat?monat=2026-10');
  const row = (name: string) => page.locator('tr.prow', { hasText: name });
  const toast = page.locator('.toast.is-open');
  const tba = page.getByTestId('to-be-assigned');
  await expect(row('Testessen').locator('.col-avail .pill')).toHaveText('−50,00 €');
  await expect(row('Testcafe').locator('.col-avail .pill')).toHaveText('100,00 €');
  await expect(tba).toHaveText('900,00 €');

  await page.locator('.plan-menu summary', { hasText: 'Verteilen' }).click();
  const cover = page
    .locator('.plan-menu-panel')
    .getByRole('button', { name: 'Überzogene decken', exact: true });
  await expect(cover).toHaveAccessibleDescription('1 überzogen · aus verfügbaren Envelopes');
  await cover.click();
  await expect(toast).toContainText('1 gedeckt, 0 offen · 0,00 € fehlen');
  await expect(row('Testessen').locator('.col-avail .pill')).toHaveText('0,00 €');
  await expect(row('Testessen')).not.toHaveClass(/is-over/);
  await expect(row('Testcafe').locator('.col-avail .pill')).toHaveText('100,00 €');
  await expect(tba).toHaveText('850,00 €');

  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row('Testessen').locator('.col-avail .pill')).toHaveText('−50,00 €');
  await expect(row('Testessen')).toHaveClass(/is-over/);
  await expect(row('Testcafe').locator('.col-avail .pill')).toHaveText('100,00 €');
  await expect(tba).toHaveText('900,00 €');
});
