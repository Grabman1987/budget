import { test } from './isolated-ledger';
import { expect, type Page } from '@playwright/test';
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

  /** Phone-only equivalents for the owner-approved explicit selection controls. */
  async function enterPhoneSelection(page: Page) {
    const options = page.locator('details.plan-menu').filter({
      has: page.locator('summary', { hasText: 'Optionen' }),
    });
    await options.locator('summary').click();
    await options.getByRole('button', { name: 'Auswählen', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Kategorienauswahl', exact: true }),
    ).toBeVisible();
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
  // On a phone the compact row shows the amount as text; editing happens in the inspector.
  const phone = info.project.name !== 'desktop';
  const assigned = (name: string) => row(name).locator(phone ? '.phone-assigned' : '.assign-btn');
  const shown = (value: string) => (phone ? `Zugewiesen ${value}` : value);
  const toast = page.locator('.toast.is-open');
  await expect(assigned('Testziel')).toHaveText(shown('≈ 400,01 €'));
  await expect(assigned('Testhistorie')).toHaveText(shown('≈ 190,02 €'));
  await expect(assigned('Testleer')).toHaveText(shown('0,00 €'));
  await expect(assigned('Testhistorie')).toHaveAttribute('title', /Median der Ausgaben/);
  await expect(assigned('Testziel')).toHaveAttribute('title', /Ziel/);
  if (page.viewportSize()!.width < 768) {
    await enterPhoneSelection(page);
    await page.locator(`.pname[data-category-id="${goal.id}"]`).click();
    await page.locator(`.pname[data-category-id="${history.id}"]`).click();
    await expect(page.locator(`.pname[data-category-id="${goal.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator(`.pname[data-category-id="${history.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectPhoneSelectionTargets(page);
  } else {
    await page.getByRole('checkbox', { name: 'Testziel auswählen' }).check();
    await page.getByRole('checkbox', { name: 'Testhistorie auswählen' }).check();
  }
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
  if (page.viewportSize()!.width < 768)
    await page
      .getByRole('region', { name: 'Kategorienauswahl', exact: true })
      .getByRole('button', { name: 'Wie letzter Monat', exact: true })
      .click();
  else {
    await page
      .getByRole('complementary', { name: 'Plan-Inspektor' })
      .getByRole('button', { name: /^Wie letzter Monat / })
      .click();
  }
  await expect(assigned('Testhistorie')).toHaveText(shown('333,33 €'));
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testhistorie')).toHaveText(shown('≈ 190,02 €'));
  if (page.viewportSize()!.width < 768)
    await page
      .getByRole('region', { name: 'Kategorienauswahl', exact: true })
      .getByRole('button', { name: 'Ø 3 Monate', exact: true })
      .click();
  else {
    await page
      .getByRole('complementary', { name: 'Plan-Inspektor' })
      .getByRole('button', { name: /^Ø 3 Monate / })
      .click();
  }
  await expect(assigned('Testhistorie')).toHaveText(shown('196,69 €'));
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testhistorie')).toHaveText(shown('≈ 190,02 €'));
  if (page.viewportSize()!.width < 768)
    await page
      .getByRole('region', { name: 'Kategorienauswahl', exact: true })
      .getByRole('button', { name: 'Ziel', exact: true })
      .click();
  else {
    await page
      .getByRole('complementary', { name: 'Plan-Inspektor' })
      .getByRole('button', { name: /^Ziele / })
      .click();
  }
  await expect(assigned('Testziel')).toHaveText(shown('400,01 €'));
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned('Testziel')).toHaveText(shown('≈ 400,01 €'));
  await page.locator('.plan-menu summary', { hasText: 'Verteilen' }).click();
  await page
    .locator('.plan-menu-panel')
    .getByRole('button', { name: 'Leere füllen', exact: true })
    .click();
  await expect(toast).toContainText('2 Kategorien befüllt · 180,10 € fehlen für 1 Kategorie');
  await expect(assigned('Testziel')).toHaveText(shown('400,01 €'));
  await expect(assigned('Testhistorie')).toHaveText(shown('9,92 €'));
  await expect(page.getByTestId('to-be-assigned')).toHaveText('0,00 €');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  // The menu closes by itself after an action (the popover used to stay open until toggled).
  await expect(page.locator('.plan-menu-verteilen .plan-menu-panel')).toBeHidden();
  await expect(assigned('Testziel')).toHaveText(shown('≈ 400,01 €'));
  await expect(assigned('Testhistorie')).toHaveText(shown('≈ 190,02 €'));
  await toast.getByRole('button', { name: 'Wiederholen' }).click();
  await expect(assigned('Testhistorie')).toHaveText(shown('9,92 €'));
});

// Verify the rendered card ghost affordance keeps its border geometry, hover, focus and phone target.
test('waterfall suggestion keeps an invisible border on hover and keyboard focus', async ({
  page,
  request,
  baseURL,
}) => {
  const send = async (method: 'POST' | 'PUT', path: string, data: unknown) => {
    const res = await request.fetch(`/api${path}`, { method, data, headers: { origin: baseURL! } });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  await send('POST', '/accounts', {
    name: 'Testgeld',
    type: 'checking',
    openingDate: '2026-07-01',
    openingBalanceCents: 103_329,
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Testvorschlag' });
  const { category } = await send('POST', '/categories', {
    name: 'Testziel',
    groupId: group.id,
    class: 'need',
    kind: 'variable',
    stage: 2,
  });
  await send('PUT', `/categories/${category.id}/target`, {
    validFrom: '2026-10',
    target: { kind: 'monthly', amountCents: 40_001 },
  });

  await page.goto('/plan/monat?monat=2026-10');
  const menu = page.locator('.plan-menu-verteilen');
  await menu.locator('summary').click();
  await menu.getByRole('button', { name: 'Wasserfall-Assistent', exact: true }).click();
  const suggestion = page.getByRole('button', { name: /Vorschlag .* für Testziel übernehmen/ });
  await expect(suggestion).toBeVisible();
  await expect(suggestion).toHaveCSS('border-top-width', '1px');
  await expect(suggestion).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await suggestion.hover();
  await expect(suggestion).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await page.keyboard.press('Tab');
  await suggestion.focus();
  await expect(suggestion).toBeFocused();
  await expect(suggestion).toHaveCSS('outline-width', '2px');
  if (page.viewportSize()!.width < 768)
    expect((await suggestion.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
