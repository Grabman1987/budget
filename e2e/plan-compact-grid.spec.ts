import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('compact groups retain cent totals, add controls, keyboard and multiple months', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  const month = '2026-10';
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, {
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return await response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Musterkonto',
    type: 'checking',
    openingDate: `${month}-01`,
    openingBalanceCents: 200_000,
  });
  const categoryIds: string[] = [];
  for (let g = 0; g < 2; g++) {
    const { group } = await post('/categories/groups', { name: `Mustergruppe ${g + 1}` });
    for (let i = 0; i < 9; i++) {
      const { category } = await post('/categories', {
        name: `Posten ${g + 1}.${i + 1}${i === 8 ? ' mit einem langen Kategorienamen' : ''}`,
        groupId: group.id,
        class: 'need',
        stage: 2,
        target: { validFrom: month, target: { kind: 'monthly', amountCents: 1_001 } },
      });
      categoryIds.push(category.id);
      const response = await page.request.put(`/api/budget/${month}/assigned`, {
        data: { items: [{ categoryId: category.id, assignedCents: 501 }] },
        headers: { origin: baseURL! },
      });
      expect(response.ok(), await response.text()).toBe(true);
    }
  }
  for (const categoryId of [categoryIds[0], categoryIds[9]]) {
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: `${month}-02`,
      categoryId,
      amountCents: -703,
    });
  }
  for (const [index, amountCents] of [
    [1, -201],
    [2, -501],
  ] as const) {
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: `${month}-02`,
      categoryId: categoryIds[index],
      amountCents,
    });
  }
  await page.goto(`/plan/monat?monat=${month}`);
  await expect(page.locator('.ptable .prow')).toHaveCount(18);
  await expect(page.locator('.plan-add-row')).toHaveCount(0);
  await expect(page.locator('.prow .sw')).toHaveCount(0);
  await expect(page.locator('.prow .spending-status').first()).toHaveText(
    'Überzogen um 2,02 € · fehlt 5,00 € bis Ziel',
  );
  await expect(page.locator('.prow .spending-status').nth(1)).toHaveText(
    'Ausgegeben 2,01 € von 5,01 € · fehlt 5,00 € bis Ziel',
  );
  await expect(page.locator('.prow .spending-status').nth(2)).toHaveText(
    'Komplett ausgegeben · fehlt 5,00 € bis Ziel',
  );
  await page.getByRole('checkbox', { name: 'Alle Kategorien auswählen', exact: true }).check();
  await expect(page.locator('.prow input:checked')).toHaveCount(18);
  await page.getByRole('checkbox', { name: 'Mustergruppe 1 auswählen', exact: true }).uncheck();
  await expect(page.locator('.prow input:checked')).toHaveCount(9);
  await expect(
    page.getByRole('checkbox', { name: 'Alle Kategorien auswählen', exact: true }),
  ).toHaveJSProperty('indeterminate', true);
  await page.getByRole('checkbox', { name: 'Alle Kategorien auswählen', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Alle Kategorien auswählen', exact: true }).uncheck();
  await expect(page.getByTestId('to-be-assigned')).toHaveText('1.909,82 €');
  await expect(page.getByText('Unterfinanziert 90,00 €', { exact: true })).toBeVisible();
  await expect(page.locator('.pgroup').first().locator('.col-assign')).toHaveText('45,09 €');
  await expect(page.locator('.pgroup').first().locator('.col-act')).toHaveText('−14,05 €');
  await expect(page.locator('.pgroup').first().locator('.col-avail')).toHaveText('31,04 €');
  // #587: no overspending chip in the head; the two overspent rows carry the marking and the
  // Zu verteilen disclosure names the same count with its cover actions.
  await expect(page.locator('.plan-chip-scroll')).not.toContainText('überzogen');
  await expect(page.locator('tr.prow.is-over')).toHaveCount(2);
  await page.locator('.plan-tba').click();
  await expect(page.getByRole('group', { name: 'Maßkette Zu verteilen' })).toBeVisible();
  await expect(page.locator('.triage')).toContainText('2 Envelopes überzogen');
  await page.keyboard.press('Escape');
  expect(
    await page.locator('.plan-tba').evaluate((e) => e.parentElement!.hasAttribute('open')),
  ).toBe(false);
  await expect(page.getByText('Monatsdetails', { exact: true })).toHaveCount(0);
  await expect(page.locator('.inspector-section[open]')).toHaveCount(1);
  const desktop = info.project.name === 'desktop';
  if (desktop) {
    const dimensions = await page.locator('.plan').evaluate((plan) => {
      const rows = Array.from(plan.querySelectorAll('.prow')).map((r) => r.getBoundingClientRect());
      return {
        beforeGrid:
          plan.querySelector('.ptable')!.getBoundingClientRect().top -
          plan.getBoundingClientRect().top,
        heights: rows.map((r) => r.height),
        visible: rows.filter((r) => r.bottom <= window.innerHeight).length,
        groups: Array.from(plan.querySelectorAll('.pgroup')).map(
          (r) => r.getBoundingClientRect().height,
        ),
      };
    });
    await info.attach('compact-grid-dimensions', {
      body: JSON.stringify(dimensions),
      contentType: 'application/json',
    });
    await page.screenshot({ path: info.outputPath('plan-compact-fold.png') });
    expect(dimensions.beforeGrid).toBeLessThanOrEqual(120);
    expect(Math.max(...dimensions.heights)).toBeLessThanOrEqual(40);
    expect(Math.max(...dimensions.groups)).toBeLessThanOrEqual(36);
    expect(dimensions.visible).toBeGreaterThanOrEqual(14);
  }
  const firstGroup = page.getByRole('button', { name: 'Mustergruppe 1', exact: true });
  await firstGroup.focus();
  await page.keyboard.press('Enter');
  await expect(firstGroup).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.ptable .prow')).toHaveCount(9);
  await page.getByRole('button', { name: 'Alle ausklappen', exact: true }).click();
  await expect(page.locator('.ptable .prow')).toHaveCount(18);
  await page.getByRole('button', { name: 'Alle einklappen', exact: true }).click();
  await expect(page.locator('.ptable .prow')).toHaveCount(0);
  await page.getByRole('button', { name: 'Alle ausklappen', exact: true }).click();
  await page
    .getByRole('button', { name: 'Kategorie in Mustergruppe 1 anlegen', exact: true })
    .click();
  const categoryDialog = page.getByRole('dialog', { name: 'Kategorie anlegen' });
  await expect(categoryDialog).toBeVisible();
  await categoryDialog.getByLabel('Name', { exact: true }).fill('cg');
  await expect(page.getByRole('dialog', { name: 'Gruppe anlegen' })).toHaveCount(0);
  await categoryDialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('g');
  await expect(page.getByRole('dialog', { name: 'Gruppe anlegen' })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Gruppe anlegen' })
    .getByRole('button', { name: 'Schließen', exact: true })
    .click();
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('c');
  await expect(categoryDialog).toBeVisible();
  await categoryDialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  // #588: "Ansicht" moved into Optionen ▾; "Nur Überzogene" is no longer a menu entry, the
  // link from Heute (?ansicht=triage) still opens the same view with the same two rows.
  const optionen = page.locator('.plan-menu summary', { hasText: 'Optionen' });
  const optionenMenu = page
    .locator('details.plan-menu')
    .filter({ has: page.locator('summary', { hasText: 'Optionen' }) });
  const inOptionen = (name: string) =>
    optionenMenu
      .locator('.plan-menu-panel')
      .getByRole('button', { name: new RegExp(`^${name}( ✓)?$`) });
  const triageUrl = new URL(page.url());
  triageUrl.searchParams.set('ansicht', 'triage');
  await page.goto(triageUrl.toString());
  await expect(page.locator('.ptable .prow:not(.is-empty)')).toHaveCount(2);
  await optionen.click();
  await inOptionen('Gruppen').click();
  if (desktop) {
    await optionen.click();
    await inOptionen('2 Monate').click();
    await expect(page.locator('.ptable-multi .prow')).toHaveCount(18);
    await expect(page.getByTestId('tba-2026-11')).toBeVisible();
    await page
      .locator('.inspector-section > summary')
      .filter({ hasText: 'Wasserfall-Stufen' })
      .click();
    await page.locator('.rail-btn').filter({ hasText: 'Laufender Monat' }).click();
    await optionen.click();
    await expect(inOptionen('1 Monat')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ptable-multi')).toHaveCount(0);
    await inOptionen('Gruppen').click();
  }
  await optionen.click();
  await page.getByRole('link', { name: 'Monatsabschluss starten oder fortsetzen' }).focus();
  await page.keyboard.press('Escape');
  await expect(optionen).toBeFocused();
  await expect(optionenMenu).not.toHaveAttribute('open');
  await page.locator('.plan-chip-scroll').evaluate((element) => {
    element.scrollLeft = 0;
  });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    if (!desktop) {
      const rows = await page
        .locator('.ptable .prow')
        .evaluateAll((elements) => elements.map((e) => e.getBoundingClientRect().height));
      expect(Math.max(...rows)).toBeLessThanOrEqual(76);
      const bar = page.locator('.plan-topbar');
      expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(56);
      await page.locator('.ptoolbar').scrollIntoViewIfNeeded();
      const topbar = (await bar.boundingBox())!;
      const toolbar = (await page.locator('.ptoolbar').boundingBox())!;
      expect(toolbar.y).toBeGreaterThanOrEqual(topbar.y + topbar.height);
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const selector of [
        '.grp-toggle',
        '.plan-add',
        '.pname',
        '.plan-available',
        '.plan-select',
        '.plan-topbar summary',
        '.plan-chip-scroll > .btn',
      ]) {
        const sizes = await page.locator(selector).evaluateAll((elements) =>
          elements.map((e) => {
            const rect = e.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          }),
        );
        expect(
          sizes.every(({ width, height }) => width >= 44 && height >= 44),
          selector,
        ).toBe(true);
      }
    }
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`plan-compact-${scheme}.png`) });
  }
});
