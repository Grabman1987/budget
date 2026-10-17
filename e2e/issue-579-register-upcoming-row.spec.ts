import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { pickCategory } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-13' });

// 18 future captures plus the next weekly occurrence = 19 upcoming payments.
test('collapses "Kommend" to one row with hover-only actions and a full, keyboard-reachable list', async ({
  page,
  request,
  baseURL,
}, info) => {
  const headers = { origin: baseURL! };
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Zeile Muster',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post('/categories/groups', { name: 'Alltag Muster' });
  const { category } = await post('/categories', {
    groupId: group.id,
    name: 'Wöchentlich Muster',
    kind: 'variable',
    class: 'want',
  });
  for (let i = 0; i < 4; i++) {
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: `2026-10-0${i + 1}`,
      amountCents: -100,
      payeeName: 'Vergangen Muster',
      status: 'confirmed',
    });
  }
  for (let i = 0; i < 18; i++)
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: `2026-10-${20 + (i % 9)}`,
      amountCents: -100 - i,
      payeeName: `Später ${String(i).padStart(2, '0')} Muster`,
      status: 'confirmed',
    });
  await page.goto(`/konten/${account.id}?panel=buchung`);
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await dialog.getByLabel('Betrag', { exact: true }).fill('2,03');
  await dialog.getByLabel('Datum', { exact: true }).fill('12.10.2026');
  await dialog.getByLabel('Empfänger', { exact: true }).fill('Wöchentlich Muster');
  await pickCategory(dialog, category.name);
  await dialog.getByLabel('Wiederholen', { exact: true }).selectOption('weekly');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.goto(`/konten/${account.id}`);
  const toggle = page.locator('.kupcoming-toggle');
  const scheduled = page.locator('.kupcoming [data-occurrence]');
  const touch = info.project.name !== 'desktop';

  // Collapsed by default: one line, and the history starts inside the first viewport.
  await expect(toggle).toHaveText('19 kommend · nächste: Wöchentlich Muster 19.10.');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.kupcoming [data-booking], .kupcoming [data-occurrence]')).toHaveCount(
    0,
  );
  const first = page.locator('[data-booking]:not(.is-upcoming)').first();
  await expect(first).toBeVisible();
  // The page head and chart sit above the register; with the register at the top of the
  // viewport, the first booked row follows the one-line section instead of 19 payments.
  await page.locator('.ktable').evaluate((el) => el.scrollIntoView());
  const box = (await first.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(box.y - (await toggle.boundingBox())!.y).toBeLessThan(150);
  await page.screenshot({ path: info.outputPath('collapsed.png') });

  // Expanding shows all 19 rows.
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.kupcoming [data-booking]')).toHaveCount(18);
  await expect(scheduled).toHaveCount(1);

  const book = scheduled.getByRole('button', { name: 'Jetzt buchen' });
  const skip = scheduled.getByRole('button', { name: 'Überspringen' });
  const actions = scheduled.locator('.kschedule-actions');
  if (!touch) {
    // Neither visible nor clickable until the row is hovered or holds focus.
    await expect(actions).toHaveCSS('opacity', '0');
    await expect(actions).toHaveCSS('pointer-events', 'none');
    await scheduled.hover();
    await expect(actions).toHaveCSS('opacity', '1');
    await expect(actions).toHaveCSS('pointer-events', 'auto');
    await page.mouse.move(0, 0);
    await expect(actions).toHaveCSS('opacity', '0');
    // Keyboard: Tab from the name reaches both actions, which then show.
    await scheduled.getByRole('link', { name: 'Wöchentlich Muster' }).focus();
    await page.keyboard.press('Tab');
    await expect(book).toBeFocused();
    await expect(actions).toHaveCSS('opacity', '1');
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect(actions).toHaveCSS('opacity', '1');
  } else {
    // Touch: the actions live behind ⋯.
    await expect(book).toBeHidden();
    await expect(skip).toBeHidden();
    const more = scheduled.getByRole('button', { name: 'Aktionen: Wöchentlich Muster' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await more.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    for (const button of [book, skip]) {
      await expect(button).toBeVisible();
      const target = (await button.boundingBox())!;
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
    }
  }

  await scheduled.scrollIntoViewIfNeeded();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`expanded-${theme}.png`) });
  }
});
