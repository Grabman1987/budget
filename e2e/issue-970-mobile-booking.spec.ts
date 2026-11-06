import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { redesignLoaded } from './ledger-helpers';
import { VISUAL_BASELINE_PLATFORM } from './visual';

test.use({ ledgerToday: '2026-09-17' });

for (const mode of ['create', 'edit'] as const) {
  test(`mobile ${mode} keeps primary fields above a keyboard-sized viewport`, async ({
    page,
    request,
    baseURL,
  }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-09-17T12:00:00+02:00'));
    const post = async (path: string, data: unknown) => {
      const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const { account } = await post('/accounts', {
      name: 'Giro Muster',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    });
    const { group } = await post('/categories/groups', { name: 'Alltag Muster' });
    const { category } = await post('/categories', {
      groupId: group.id,
      name: 'Essen Muster',
      class: 'need',
      kind: 'variable',
    });
    const { payee } = await post('/payees', { name: 'Laden Muster' });
    const { bookings } = await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-09-17',
      payeeId: payee.id,
      amountCents: -1234,
      splits: [{ categoryId: category.id, amountCents: -1234 }],
    });
    const phone = page.viewportSize()!.width === 390;
    await page.goto(
      mode === 'create'
        ? `/konten/${account.id}?panel=buchung`
        : `/konten/buchungen?buchung=${bookings[0].id}`,
    );
    if (mode === 'edit')
      await page.getByRole('button', { name: /Laden Muster am .* bearbeiten/ }).click();
    const dialog = page.getByRole('dialog', {
      name: mode === 'create' ? 'Buchung erfassen' : 'Buchung bearbeiten',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const redesign = await redesignLoaded(page);
    const amount = dialog.getByLabel('Betrag', { exact: true });
    if (!phone || !redesign) {
      await expect(amount).toHaveAttribute('inputmode', 'text');
      return;
    }
    await expect(amount).toHaveAttribute('inputmode', 'decimal');
    await expect(dialog.getByText('Jede Zeile braucht einen Betrag.')).toHaveCount(0);
    // Browser emulation has no native software keyboard. Resize its visible area to 390×430
    // and keep the amount focused, without scrolling or focusing the other fields into view.
    await page.setViewportSize({ width: 390, height: 430 });
    await amount.focus();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await expect(dialog.locator('.bk-body')).toHaveJSProperty('scrollTop', 0);
      const fields = [
        amount,
        dialog.getByLabel('Empfänger', { exact: true }),
        dialog.getByLabel('Kategorie', { exact: true }),
        dialog.getByLabel('Bezahlt von', { exact: true }),
        dialog.getByLabel('Datum', { exact: true }),
      ];
      for (const field of fields) await expect(field).toBeInViewport({ ratio: 1 });
      const icons = dialog.locator('.bk-mobile-row-icon');
      await expect(icons).toHaveCount(4);
      for (const icon of await icons.all()) await expect(icon).toBeInViewport({ ratio: 1 });
      const boxes = await Promise.all(fields.map((field) => field.boundingBox()));
      for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.y).toBeGreaterThan(boxes[i - 1]!.y);
      await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeInViewport({
        ratio: 1,
      });
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
        [],
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: info.outputPath(`${mode}-${theme}-keyboard.png`) });
      if (process.platform === VISUAL_BASELINE_PLATFORM)
        await expect.soft(page).toHaveScreenshot(`booking-${mode}-${theme}-keyboard.png`);
      else
        info.annotations.push({
          type: 'visual comparison skipped',
          description: `${mode}/${theme}: Linux baselines; local PNG evidence only on ${process.platform}.`,
        });
    }
    if (mode === 'create') {
      await amount.press('Tab');
      await expect(dialog.getByText('Jede Zeile braucht einen Betrag.')).toHaveCount(0);
      await amount.press('Control+Enter');
      await expect(dialog.getByText('Jede Zeile braucht einen Betrag.')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
    }
  });
}
