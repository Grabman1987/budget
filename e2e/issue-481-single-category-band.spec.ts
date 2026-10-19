import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { sampleTest } from './sample';
import { test } from './isolated-ledger';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';

sampleTest(
  'sample ledger: group-first-category bands, current-baseline reduction and visual/accessibility evidence',
  async ({ page, browser }, info) => {
    sampleTest.setTimeout(90_000);
    await page.goto('/plan/monat?monat=2026-09');
    const response = await page.request.get('/api/budget/2026-09');
    expect(response.ok()).toBe(true);
    const data = (await response.json()) as BudgetMonthView;
    const visible = data.categories.filter((c: { hiddenAt: string | null }) => !c.hiddenAt);
    const singles = data.groups.filter(
      (g: { id: string }) =>
        visible.filter((c: { groupId: string }) => c.groupId === g.id).length === 1,
    );
    const bandGroups = data.groups.filter((g) => visible.some((c) => c.groupId === g.id));
    const multiple = bandGroups.filter((g) => !singles.includes(g));
    const table = page.locator('.ptable-zero');
    await expect(table.locator('.psingle')).toHaveCount(bandGroups.length);
    await expect(table.locator('.pmulti')).toHaveCount(multiple.length);
    await expect(table.locator('.prow:not(.is-empty)')).toHaveCount(visible.length);
    expect(singles).toHaveLength(11);
    const oldRows = data.groups.length + visible.length;
    const newRows = oldRows - bandGroups.length;
    await expect(table.locator('tbody > tr:not(.pgroup-gap)')).toHaveCount(newRows);
    const measurements = {
      groups: data.groups.length,
      categories: visible.length,
      singles: singles.length,
      combinedGroups: bandGroups.length,
      oldRows,
      newRows,
      reductionPercent: (100 * (oldRows - newRows)) / oldRows,
      browserVersion: browser.version(),
      viewport: page.viewportSize(),
      physicalTableHeightPx: (await table.boundingBox())!.height,
    };
    mkdirSync('docs/evidence/plan-single-category-481', { recursive: true });
    expect(oldRows).toBe(55);
    expect(newRows).toBe(36);
    expect(measurements.reductionPercent).toBeGreaterThanOrEqual(30);
    writeFileSync(
      `docs/evidence/plan-single-category-481/${info.project.name}-rows.json`,
      JSON.stringify(measurements, null, 2) + '\n',
    );
    await info.attach('sample-row-reduction', {
      body: JSON.stringify(measurements, null, 2),
      contentType: 'application/json',
    });
    for (const group of singles) {
      const band = page.locator(`[id="grp-${group.id}"]`);
      await expect(band).toHaveClass(/psingle/);
      await expect(band.locator('.pname')).toContainText(group.name);
      await expect(band.locator('.spending-status')).not.toBeEmpty();
      await expect(band.locator('.spending-bar')).toHaveCount(1);
      const bounds = await band.evaluate((row) => ({
        bottom: row.getBoundingClientRect().bottom,
        barBottom: row.querySelector('.spending-bar')!.getBoundingClientRect().bottom,
      }));
      expect(bounds.barBottom).toBeLessThanOrEqual(bounds.bottom);
      await expect(band.locator('.col-avail .pill')).toHaveCount(1);
      await expect(
        band.getByRole('button', { name: `Kategorie in ${group.name} anlegen`, exact: true }),
      ).toHaveCount(1);
    }
    for (const group of multiple) {
      const band = page.locator(`[id="grp-${group.id}"]`);
      await expect(band.locator('.grp-toggle')).toHaveAccessibleName(`Gruppe ${group.name}`);
      const categories = visible.filter((category) => category.groupId === group.id);
      const summaries = data.summary.envelopes.filter((value) =>
        categories.some((category) => category.id === value.categoryId),
      );
      const totals = band.locator(
        info.project.name === 'desktop'
          ? '.col-num > .band-total'
          : '.band-parent-totals .band-total',
      );
      await expect(totals).toHaveCount(3);
      const expected = ['assignedCents', 'activityCents', 'availableCents'] as const;
      for (const [index, key] of expected.entries()) {
        const value = summaries.reduce((sum, row) => sum + row[key], 0);
        await expect(totals.nth(index)).toContainText(
          new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' })
            .format(value / 100)
            .replace('-', '−'),
        );
      }
      await expect(band.locator('.pname')).toHaveCount(1);
      await expect(band.locator('.spending-status')).not.toBeEmpty();
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      if (info.project.name !== 'desktop') {
        const targets = await table
          .locator('.psingle button, .psingle .plan-select')
          .evaluateAll((elements) =>
            elements
              .filter((e) => e.getBoundingClientRect().height > 0)
              .map((e) => ({
                text: e.textContent,
                width: e.getBoundingClientRect().width,
                height: e.getBoundingClientRect().height,
              })),
          );
        expect(targets.filter((t) => t.width < 44 || t.height < 44)).toEqual([]);
      }
      await page.screenshot({ path: info.outputPath(`sample-${theme}.png`), fullPage: true });
      if (
        (info.project.name === 'desktop' && theme === 'light') ||
        (info.project.name !== 'desktop' && theme === 'dark')
      ) {
        mkdirSync('docs/evidence/plan-single-category-481', { recursive: true });
        await page.screenshot({
          path: `docs/evidence/plan-single-category-481/${info.project.name}-${theme}.png`,
          fullPage: true,
        });
      }
    }
  },
);

test('band selection, shortcuts, cent writes/undo and transition to two categories', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  const month = '2026-10';
  const send = async (method: string, path: string, data: unknown) => {
    const response = await page.request.fetch(`/api${path}`, {
      method,
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await send('POST', '/accounts', {
    name: 'Musterkonto',
    type: 'checking',
    openingDate: `${month}-01`,
    openingBalanceCents: 100_000,
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Musterband' });
  const { category } = await send('POST', '/categories', {
    name: 'Musterposten',
    groupId: group.id,
    class: 'need',
    stage: 2,
    target: { validFrom: month, target: { kind: 'monthly', amountCents: 10_001 } },
  });
  const { group: reserveGroup } = await send('POST', '/categories/groups', {
    name: 'Musterreserve',
  });
  const { category: reserve } = await send('POST', '/categories', {
    name: 'Reserve',
    groupId: reserveGroup.id,
    class: 'want',
  });
  await page.goto(`/plan/monat?monat=${month}`);
  const band = page.locator(`[id="grp-${group.id}"]`);
  await expect(band).toHaveClass(/psingle/);
  const name = band.locator('.pname');
  await expect(name).toHaveAccessibleName('Musterband · Musterposten');
  const inspector = page.getByRole('complementary', { name: 'Plan-Inspektor' });
  await name.focus();
  await page.keyboard.press('Enter');
  await expect(inspector.getByRole('heading', { name: 'Musterposten' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(name).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(band.getByRole('button', { name: 'Kategorie in Musterband anlegen' })).toBeFocused();
  await page.keyboard.press('c');
  const dialog = page.getByRole('dialog', { name: 'Kategorie anlegen', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill('cg');
  await expect(page.getByRole('dialog', { name: 'Gruppe anlegen' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await name.focus();
  await page.keyboard.press('g');
  await expect(page.getByRole('dialog', { name: 'Gruppe anlegen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Alle einklappen', exact: true }).click();
  await expect(name).toBeVisible();
  await page.getByRole('checkbox', { name: 'Musterposten auswählen', exact: true }).check();
  await expect(name).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('checkbox', { name: 'Alle Kategorien auswählen', exact: true }),
  ).toHaveJSProperty('indeterminate', true);
  await band.locator('.spending-status').click();
  await expect(inspector.getByRole('heading', { name: 'Musterposten' })).toBeVisible();
  const writes: { path: string; body: unknown }[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && /\/api\/budget\//.test(r.url()))
      writes.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() });
  });
  const assigned = band.locator(
    info.project.name === 'desktop' ? '.assign-btn' : '.phone-assigned',
  );
  const toast = page.locator('.toast.is-open');
  await inspector.getByLabel('Zugewiesen', { exact: true }).fill('1000,01');
  await inspector.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await expect(inspector.getByText(/Höchstens 1\.000,00 € zuweisen\./)).toBeVisible();
  expect(writes).toEqual([]);
  await inspector.getByLabel('Zugewiesen', { exact: true }).fill('10+0,01');
  await inspector.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  expect(writes[0]).toEqual({
    path: `/api/budget/${month}/assigned`,
    body: { items: [{ categoryId: category.id, assignedCents: 1001 }] },
  });
  await expect(assigned).toContainText('10,01 €');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned).toContainText('100,01 €');
  await inspector.getByRole('button', { name: 'Ziel', exact: true }).click();
  await expect(assigned).toHaveText(
    info.project.name === 'desktop' ? '100,01 €' : 'Zugewiesen 100,01 €',
  );
  expect(writes[1]).toEqual({
    path: `/api/budget/${month}/quick-assign`,
    body: { mode: 'target', categoryIds: [category.id] },
  });
  await inspector.getByLabel('Nach', { exact: true }).selectOption(reserve.id);
  await inspector.getByLabel('Betrag', { exact: true }).fill('0,01');
  await inspector.getByRole('button', { name: 'Verschieben', exact: true }).click();
  expect(writes[2]).toEqual({
    path: `/api/budget/${month}/move`,
    body: { fromId: category.id, toId: reserve.id, amountCents: 1 },
  });
  await expect(assigned).toContainText('100,00 €');
  await expect(toast).toContainText('verschoben');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned).toContainText('100,01 €');
  // Overspending uses the same cover endpoint; no row-specific mutation implementation.
  await send('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    categoryId: category.id,
    date: `${month}-02`,
    amountCents: -10_002,
  });
  await page.reload();
  await expect(band).toHaveClass(/is-over/);
  await band.getByRole('button', { name: 'Musterposten decken', exact: true }).click();
  await inspector.getByRole('button', { name: 'Decken · 0,01 €', exact: true }).click();
  expect(writes[3]).toEqual({
    path: `/api/budget/${month}/cover`,
    body: { categoryId: category.id, fromId: null },
  });
  await expect(band).not.toHaveClass(/is-over/);
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(band).toHaveClass(/is-over/);
  await page.keyboard.press('Escape');
  await band.getByRole('button', { name: 'Kategorie in Musterband anlegen', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Gruppe', { exact: true })).toHaveValue(group.id);
  await dialog.getByLabel('Name', { exact: true }).fill('Zweiter Musterposten');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(band).toHaveClass(/psingle/);
  await expect(band).toHaveClass(/pmulti/);
  await expect(band.locator('.grp-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.prow', { hasText: 'Zweiter Musterposten' })).toHaveCount(1);
  await expect(page.locator('.prow', { hasText: 'Musterposten' })).toHaveCount(2);
  const expandedData = (await (
    await page.request.get(`/api/budget/${month}`)
  ).json()) as BudgetMonthView;
  const sibling = expandedData.categories.find((value) => value.name === 'Zweiter Musterposten')!;
  await send('PUT', `/budget/${month}/assigned`, {
    items: [{ categoryId: sibling.id, assignedCents: 29 }],
  });
  await send('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    categoryId: sibling.id,
    date: `${month}-03`,
    amountCents: -7,
  });
  await page.reload();
  const totals = band.locator(
    info.project.name === 'desktop' ? '.col-num > .band-total' : '.band-parent-totals .band-total',
  );
  await expect(totals.nth(0)).toContainText('100,30 €');
  await expect(totals.nth(1)).toContainText('−100,09 €');
  await expect(totals.nth(2)).toContainText('0,21 €');
  await expect(band.locator('.band-category-assigned')).toContainText('100,01 €');
  await expect(band.locator('.band-category-available')).toContainText('−0,01 €');
  const groupSelection = band.getByRole('checkbox', {
    name: 'Gruppe Musterband auswählen',
    exact: true,
  });
  await groupSelection.check();
  await expect(
    page.getByRole('checkbox', { name: 'Musterposten auswählen', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Zweiter Musterposten auswählen', exact: true }),
  ).toBeChecked();
  await band.locator('.grp-toggle').click();
  await expect(band.locator('.grp-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(`.ptable-zero [data-category-id="${category.id}"]`)).not.toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Zweiter Musterposten auswählen', exact: true }),
  ).not.toBeVisible();
  await expect(groupSelection).toBeChecked();
  await band.locator('.grp-toggle').click();
  await expect(groupSelection).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Zweiter Musterposten auswählen', exact: true }),
  ).toBeChecked();
  if (info.project.name === 'desktop') {
    const options = page
      .locator('details.plan-menu')
      .filter({ has: page.locator('summary', { hasText: 'Optionen' }) });
    await options.locator('summary').click();
    await options.getByRole('button', { name: '2 Monate', exact: true }).click();
    await expect(page.locator('.ptable-multi .prow')).toHaveCount(3);
    await expect(page.locator('.ptable-multi .psingle')).toHaveCount(0);
    await page.getByRole('button', { name: 'Alle einklappen', exact: true }).click();
    await expect(page.locator('.ptable-multi .prow')).toHaveCount(0);
  }
});
