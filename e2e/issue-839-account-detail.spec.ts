import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { MIN_TARGET_PX, toast } from './ledger-helpers';

test.use({ ledgerToday: '2026-09-17' });

for (const theme of ['light', 'dark'] as const) {
  test(`K2 ${theme}: account register, source date, reconciliation preview/cancel and Undo`, async ({
    page,
    isolatedLedger,
  }, info) => {
    const origin = isolatedLedger.origin;
    const accountName = 'Synthetic Account with a long descriptive household current account label';
    const created = await page.request.post('/api/accounts', {
      headers: { origin },
      data: {
        name: accountName,
        type: 'checking',
        onBudget: true,
        openingDate: '2026-09-01',
        openingBalanceCents: 10000,
      },
    });
    expect(created.ok()).toBe(true);
    const { account } = (await created.json()) as { account: { id: string } };
    const booking = await page.request.post('/api/bookings', {
      headers: { origin },
      data: {
        type: 'booking',
        accountId: account.id,
        date: '2026-09-17',
        amountCents: -123,
        status: 'pending',
      },
    });
    expect(booking.ok()).toBe(true);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto(`/konten/${account.id}`);
    await expect(page.getByTestId('account-balance')).toHaveText('98,77 €');
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const redesign = (await page.locator('[data-budget-redesign="1"]').count()) > 0;
    await expect(page.locator('[data-redesign="account-detail"]')).toHaveCount(redesign ? 1 : 0);
    if (redesign) {
      const originalViewport = page.viewportSize()!;
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const trigger = page.getByLabel('Kontoaktionen', { exact: true });
        await trigger.click();
        const menu = page.locator('.account-actions-menu > .konten-menu-content');
        await expect(menu).toBeVisible();
        const bounds = await menu.evaluate((element) => {
          const popup = element.getBoundingClientRect();
          const row = element.closest('.kacct-actions')!.getBoundingClientRect();
          const trigger = element.parentElement!.querySelector('summary')!.getBoundingClientRect();
          return {
            insideRow: popup.left >= row.left && popup.right <= row.right,
            insideViewport: popup.left >= 0 && popup.right <= innerWidth,
            belowTrigger: popup.top >= trigger.bottom,
          };
        });
        expect(bounds).toEqual({ insideRow: true, insideViewport: true, belowTrigger: true });
        await trigger.press('Escape');
        await expect(menu).toBeHidden();
        await expect(trigger).toBeFocused();
      }
      await page.setViewportSize(originalViewport);
      await page.getByLabel('Kontoaktionen', { exact: true }).click();
      const jump = page.getByRole('link', { name: 'Buchungen ansehen', exact: true });
      await jump.focus();
      await expect(jump).toBeFocused();
      const box = await jump.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      await jump.press('Enter');
      await expect(page).toHaveURL(new RegExp(`#account-register-${account.id}$`));
      await page.getByText('Dokumente und Kontoauszüge', { exact: true }).click();
      await expect(page.getByRole('region', { name: 'Dokumente und Kontoauszüge' })).toBeVisible();
      await expect(page.getByText('Stand 17.09.2026', { exact: true })).toBeVisible();
    }
    const writes: string[] = [];
    const previews: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/reconciliation/preview')) previews.push(path);
      else if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method()))
        writes.push(`${request.method()} ${path}`);
    });
    await page.getByTestId('account-review-badge').click();
    const dialog = page.getByRole('dialog', { name: `Kontostand prüfen · ${accountName}` });
    await dialog.getByLabel('Saldo laut Bank', { exact: true }).fill('100');
    await expect(dialog.getByRole('button', { name: 'Kontostand stimmt' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(writes).toEqual([]);
    expect(previews).toEqual([`/api/accounts/${account.id}/reconciliation/preview`]);
    await page.goto(`/konten/${account.id}?pruefen=reconcile`);
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Saldo laut Bank', { exact: true }).fill('100');
    await dialog.getByRole('button', { name: 'Kontostand stimmt' }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page)).toContainText('Rückgängig');
    await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(page.getByTestId('account-review-badge')).toContainText(
      redesign ? 'Kontostand prüfenfällig' : 'Nie geprüft',
    );
    expect(writes).toEqual([`POST /api/accounts/${account.id}/reconciliation`, 'POST /api/undo']);
    await expect(page.getByTestId('account-balance')).toHaveText('98,77 €');
    if (redesign) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (
          await new AxeBuilder({ page })
            .include('.account-detail-redesign')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`k2-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
}
