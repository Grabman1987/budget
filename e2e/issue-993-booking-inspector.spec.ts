import AxeBuilder from '@axe-core/playwright';
import { expect, type Request } from '@playwright/test';
import { test } from './isolated-ledger';
import { MIN_TARGET_PX } from './ledger-helpers';

for (const scenario of ['light', 'dark', 'navigation'])
  test(`booking context (${scenario})`, async ({ page, isolatedLedger }, info) => {
    const post = async (path: string, data: unknown) => {
      const response = await page.request.post(`/api${path}`, {
        headers: { origin: isolatedLedger.origin },
        data,
      });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const { account } = await post('/accounts', {
      name: 'Synthetic inspector account',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    });
    const { group } = await post('/categories/groups', { name: 'Synthetic group' });
    const { category } = await post('/categories', {
      name: 'Synthetic category',
      groupId: group.id,
      class: 'need',
    });
    const { payee } = await post('/payees', {
      name: 'Synthetic inspector payee',
      defaultCategoryId: category.id,
    });
    const { payment } = await post('/expected', {
      name: 'Synthetic repetition',
      kind: 'outflow',
      accountId: account.id,
      payeeId: payee.id,
      categoryId: category.id,
      rhythm: 'monthly',
      dueDay: 2,
      amountCents: 1234,
      validFrom: '2026-10-01',
      startDate: '2026-10-01',
    });
    for (const date of ['2026-09-02', '2026-10-02'])
      await post('/bookings', {
        type: 'booking',
        accountId: account.id,
        payeeId: payee.id,
        date,
        amountCents: -1234,
        status: 'confirmed',
        splits: [{ categoryId: category.id, amountCents: -1234 }],
      });
    for (let index = 0; index < (scenario === 'navigation' ? 12 : 0); index++)
      await post('/assignment-rules', {
        name: `Synthetic unrelated rule ${index}`,
        enabled: true,
        automatic: false,
        match: {
          mode: 'all',
          conditions: [{ type: 'contains', text: `synthetic-unrelated-${index}` }],
        },
        actions: { categoryId: category.id },
      });
    await post('/assignment-rules', {
      name: 'Synthetic recipient rule',
      enabled: true,
      automatic: false,
      match: { mode: 'all', conditions: [{ type: 'payee', payeeId: payee.id }] },
      actions: { categoryId: category.id },
    });
    await post('/expected/refresh', {});
    const before = await (await page.request.get(`/api/bookings?accountId=${account.id}`)).json();
    const selected = before.items[0];
    const writes: string[] = [];
    const trackWrites = (request: Request) => {
      if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
        writes.push(request.url());
    };
    page.on('request', trackWrites);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/konten/buchungen?empfaenger=${payee.id}`);
    const trigger = page
      .locator(`[data-booking="${selected.id}"]`)
      .getByRole('button', { name: /Buchungsdetails:/ });
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Buchungsdetails', exact: true });
    await expect(panel.getByText('Synthetic category', { exact: true })).toBeVisible();
    await expect(panel.getByRole('link', { name: /Synthetic repetition/ })).toBeVisible();
    await expect(panel.getByLabel('Empfänger-Historie').getByText('−12,34 €')).toBeVisible();
    if (scenario !== 'navigation') {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, scenario);
      expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
        [],
      );
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      const boxes = await panel.locator('a, button').evaluateAll((controls) =>
        controls.map((control) => {
          const { width, height } = control.getBoundingClientRect();
          return { width, height };
        }),
      );
      for (const box of boxes) {
        expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }
      await page.screenshot({ path: info.outputPath(`inspector-${scenario}.png`) });
      await info.attach(`inspector-${scenario}`, {
        path: info.outputPath(`inspector-${scenario}.png`),
        contentType: 'image/png',
      });
    }
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(writes).toEqual([]);
    expect(await (await page.request.get(`/api/bookings?accountId=${account.id}`)).json()).toEqual(
      before,
    );
    if (scenario !== 'navigation') return;
    // Destination pages retain their existing refresh behavior; the inspector itself is read-only.
    page.off('request', trackWrites);
    await trigger.click();
    await panel.getByRole('link', { name: /Synthetic recipient rule/ }).click();
    await expect(page).toHaveURL(/einstellungen\/zuordnung#regel-/);
    const targetRule = page
      .locator('.settings-row[id^="regel-"]')
      .filter({ hasText: 'Synthetic recipient rule' });
    await expect(targetRule).toBeVisible();
    await expect(targetRule).toBeInViewport();
    await expect(targetRule).toBeFocused();
    await page.goBack();
    await trigger.click();
    await panel.getByRole('link', { name: /Synthetic repetition/ }).click();
    await expect(page).toHaveURL(new RegExp(`/plan/erwartet/${payment.id}`));
    await expect(
      page.getByRole('heading', { name: 'Synthetic repetition', exact: true }),
    ).toBeVisible();
    await page.goto(`/konten/${account.id}`);
    await trigger.click();
    await expect(panel.getByLabel('Übliche Kategorie')).toContainText('Synthetic category');
    await panel.getByRole('button', { name: 'Schließen', exact: true }).click();
    expect(await (await page.request.get(`/api/bookings?accountId=${account.id}`)).json()).toEqual(
      before,
    );
  });
