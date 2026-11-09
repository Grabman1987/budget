import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import type { CategoryTree } from '../apps/web/src/budget/api';
import { MIN_TARGET_PX } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-15' });

for (const scenario of [
  'keyboard',
  'pointer',
  'controls',
  'archive',
  'archive-dark',
  'light',
  'dark',
] as const) {
  const theme = scenario === 'dark' || scenario === 'archive-dark' ? 'dark' : 'light';
  test(`Plan sorting, archive and contact advances (${scenario})`, async ({
    page,
    request,
    baseURL,
  }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
    const send = async (path: string, data: unknown, method = 'POST') => {
      const response = await request.fetch(`/api${path}`, {
        method,
        data,
        headers: { origin: baseURL! },
      });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const { account } = await send('/accounts', {
      name: 'Synthetic account',
      type: 'checking',
      openingDate: '2026-10-01',
      openingBalanceCents: 100000,
    });
    const groups: { id: string; name: string }[] = [];
    const categories: string[] = [];
    for (const name of [
      'Synthetic daily',
      'Synthetic future',
      'Synthetic archive',
      'Synthetic advances',
    ]) {
      const { group } = await send('/categories/groups', { name });
      groups.push(group);
      const { category } = await send('/categories', {
        name: `${name} category`,
        groupId: group.id,
        class: name.endsWith('advances') ? null : 'need',
        kind: name.endsWith('advances') ? 'advance' : 'variable',
      });
      categories.push(category.id);
    }
    // Keep one multi-category group and one combined single-category band.
    await send('/categories', {
      name: 'Synthetic second category',
      groupId: groups[0]!.id,
      class: 'need',
      kind: 'variable',
    });
    await send(`/categories/${categories[2]}`, { hidden: true }, 'PATCH');
    const { group: emptyGroup } = await send('/categories/groups', { name: 'Synthetic empty' });
    const { group: fundedGroup } = await send('/categories/groups', {
      name: 'Synthetic funded archive',
    });
    const { category: fundedCategory } = await send('/categories', {
      name: 'Synthetic retained funds',
      groupId: fundedGroup.id,
      class: 'need',
      kind: 'variable',
    });
    await send(
      '/budget/2026-10/assigned',
      {
        items: [{ categoryId: fundedCategory.id, assignedCents: 5000 }],
      },
      'PUT',
    );
    await send(`/categories/${fundedCategory.id}`, { hidden: true }, 'PATCH');
    // An invisible archived group between two visible neighbours must not consume a move.
    const initialTree: CategoryTree = await (await request.get('/api/categories')).json();
    const sortedGroups = initialTree.groups.filter((group) => group.id !== groups[2]!.id);
    sortedGroups.splice(
      sortedGroups.findIndex((group) => group.id === groups[1]!.id),
      0,
      initialTree.groups.find((group) => group.id === groups[2]!.id)!,
    );
    await send('/categories/sort', {
      groups: sortedGroups.map((group) => ({
        id: group.id,
        categoryIds: initialTree.categories
          .filter((category) => category.groupId === group.id)
          .map((category) => category.id),
      })),
    });
    const { contact } = await send('/contacts', { name: 'Synthetic contact' });
    await send('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-10-10',
      amountCents: -1234,
      splits: [{ categoryId: categories[3], contactId: contact.id, amountCents: -1234 }],
    });
    const before = await (await request.get('/api/budget/2026-10')).json();
    const accountsBefore = await (await request.get('/api/accounts')).json();
    const treeBefore = await (await request.get('/api/categories')).json();
    await page.goto('/plan/monat?monat=2026-10');
    await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
    const handle = (index: number) =>
      page.getByRole('button', { name: `Gruppe ${groups[index]!.name} verschieben`, exact: true });
    await expect(handle(0)).toBeAttached();
    const groupIds = () =>
      page.locator('.ptable tr[id^="grp-"]').evaluateAll((rows) => rows.map((row) => row.id));
    const initialOrder = await groupIds();
    if (scenario === 'controls') {
      await expect(page.locator(`#grp-${groups[2]!.id}`)).toHaveCount(0);
      const advanceRow = page
        .locator(`.pname[data-category-id="${categories[3]}"]`)
        .locator('xpath=ancestor::tr');
      await expect(advanceRow).toContainText('−12,34 €');
      await expect(page.locator(`#grp-${fundedGroup.id}`)).toContainText('50,00 €');
      await expect(
        page.getByRole('button', { name: 'Kategorie in Synthetic empty anlegen', exact: true }),
      ).toBeVisible();
      await expect(page.locator(`#grp-${emptyGroup.id}`)).toBeVisible();
      await expect(page.locator('.ptoolbar')).toHaveCount(1);
      await expect(page.locator('.plan-calm-toolbar')).toBeVisible();
      await expect(page.locator('.plan-v2-page-head .plan-close')).toHaveAttribute(
        'href',
        '/monatsabschluss/2026-10',
      );
      const menu = page.getByRole('button', { name: 'Geld verteilen', exact: true });
      await menu.click();
      await expect(page.getByRole('button', { name: 'Alle Ziele füllen' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      expect((await (await request.get('/api/budget/2026-10')).json()).summary).toEqual(
        before.summary,
      );
      expect(await (await request.get('/api/accounts')).json()).toEqual(accountsBefore);
      return;
    }

    if (scenario === 'keyboard' || scenario === 'pointer') {
      if (scenario === 'keyboard') {
        await handle(0).focus();
        await handle(0).press('ArrowDown');
        await expect(page.getByText('Reihenfolge gespeichert.', { exact: true })).toBeVisible();
        expect((await groupIds()).indexOf(`grp-${groups[0]!.id}`)).toBeGreaterThan(
          (await groupIds()).indexOf(`grp-${groups[1]!.id}`),
        );
        await expect(handle(0)).toBeFocused();
        await expect(
          page.getByRole('status').filter({ hasText: 'Gruppe nach unten verschoben' }),
        ).toHaveAttribute('aria-live', 'polite');
        const reordered = await (await request.get('/api/categories')).json();
        expect(reordered.categories).toEqual(treeBefore.categories);
        await page
          .locator('.toast.is-open')
          .getByRole('button', { name: 'Rückgängig', exact: true })
          .click();
        await expect.poll(groupIds).toEqual(initialOrder);
      }
      if (scenario === 'pointer' && info.project.name !== 'desktop') {
        await handle(0).tap();
        for (const control of [
          handle(0),
          page.getByRole('button', { name: `Gruppe ${groups[0]!.name} nach oben`, exact: true }),
          page.getByRole('button', { name: `Gruppe ${groups[0]!.name} nach unten`, exact: true }),
        ]) {
          const box = (await control.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        }
        await page
          .getByRole('button', { name: `Gruppe ${groups[0]!.name} nach unten`, exact: true })
          .tap();
        await expect(page.getByText('Reihenfolge gespeichert.', { exact: true })).toBeVisible();
        await expect(handle(0)).toBeFocused();
        expect((await groupIds()).indexOf(`grp-${groups[0]!.id}`)).toBeGreaterThan(
          (await groupIds()).indexOf(`grp-${groups[1]!.id}`),
        );
        await page
          .locator('.toast.is-open')
          .getByRole('button', { name: 'Rückgängig', exact: true })
          .tap();
        await expect.poll(groupIds).toEqual(initialOrder);
      }
      if (scenario === 'pointer' && info.project.name === 'desktop') {
        await handle(0).hover();
        await handle(0).dragTo(page.locator(`#grp-${groups[1]!.id}`));
        await expect(page.getByText('Reihenfolge gespeichert.', { exact: true })).toBeVisible();
        expect((await groupIds()).indexOf(`grp-${groups[0]!.id}`)).toBeGreaterThan(
          (await groupIds()).indexOf(`grp-${groups[1]!.id}`),
        );
        await page
          .locator('.toast.is-open')
          .getByRole('button', { name: 'Rückgängig', exact: true })
          .click();
        await expect.poll(groupIds).toEqual(initialOrder);
        await handle(1).hover();
        await handle(1).dragTo(page.locator(`#grp-${groups[0]!.id}`));
        await expect(page.getByText('Reihenfolge gespeichert.', { exact: true })).toBeVisible();
        expect((await groupIds()).indexOf(`grp-${groups[1]!.id}`)).toBeLessThan(
          (await groupIds()).indexOf(`grp-${groups[0]!.id}`),
        );
        await page.reload();
        await expect(handle(1)).toBeAttached();
        expect((await groupIds()).indexOf(`grp-${groups[1]!.id}`)).toBeLessThan(
          (await groupIds()).indexOf(`grp-${groups[0]!.id}`),
        );
        // Reload retains order; the API audit group is also the settings order.
        await page.goto('/einstellungen/kategorien');
        const settings = page.locator('.settings-category-group > strong');
        await expect(settings.filter({ hasText: groups[1]!.name })).toBeVisible();
        const names = await settings.allTextContents();
        expect(names.indexOf(groups[1]!.name)).toBeLessThan(names.indexOf(groups[0]!.name));
        await page.goto('/plan/monat?monat=2026-10');
        await handle(1).focus();
        await handle(1).press('ArrowDown');
        await expect.poll(groupIds).toEqual(initialOrder);
      }
      expect((await (await request.get('/api/budget/2026-10')).json()).summary).toEqual(
        before.summary,
      );
      expect(await (await request.get('/api/accounts')).json()).toEqual(accountsBefore);
      return;
    }
    if (scenario === 'archive' || scenario === 'archive-dark') {
      const options = page.locator('.plan-menu-optionen > summary');
      await options.click();
      await page.getByRole('button', { name: 'Ausgeblendete zeigen' }).click();
      await expect(page.locator(`[data-category-id="${categories[2]}"]`)).toBeVisible();
      await options.click();
      await page.getByRole('button', { name: 'Ausgeblendete zeigen' }).click();
      await expect(page.locator(`#grp-${groups[2]!.id}`)).toHaveCount(0);
      const advances = page.locator('.plan-contact-advances');
      await expect(advances).not.toHaveAttribute('open');
      await advances.locator('summary').click();
      await expect(advances).toContainText('Offen 12,34 €');
      await expect(advances.getByRole('link', { name: 'Synthetic contact' })).toHaveAttribute(
        'href',
        `/konten/kontakte/${contact.id}`,
      );
      await expect(advances.locator('.spending-bar')).toHaveCount(0);
      await advances.screenshot({ path: info.outputPath(`contacts-${theme}.png`) });
      await advances.locator('summary').click();
      expect((await (await request.get('/api/budget/2026-10')).json()).summary).toEqual(
        before.summary,
      );
      expect(await (await request.get('/api/accounts')).json()).toEqual(accountsBefore);
      return;
    }
    expect(
      (await new AxeBuilder({ page }).include('.plan-month-frame').analyze()).violations,
    ).toEqual([]);
    const widths = info.project.name === 'desktop' ? [1440, 1280] : [390];
    for (const width of widths) {
      await page.setViewportSize({ width, height: page.viewportSize()!.height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`plan-${width}-${theme}.png`),
      });
    }
  });
}
