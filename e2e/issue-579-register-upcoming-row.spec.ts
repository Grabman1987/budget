import { captureSaveControl } from './ledger-helpers';
import { redesignLoaded, pickCategory } from './ledger-helpers';

import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

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
  await captureSaveControl(dialog).click();
  await expect(dialog).toBeHidden();

  await page.goto(`/konten/${account.id}`);
  const toggle = page.locator('.kupcoming-toggle');
  const scheduled = page.locator('.kupcoming [data-occurrence]');
  const touch = info.project.name !== 'desktop';

  // Account future rows are visible initially; the explicit collapse keeps the compact history view.
  await expect(toggle).toHaveText(
    (await redesignLoaded(page))
      ? 'Kommend19 kommend · nächste: Wöchentlich Muster 19.10.'
      : '19 kommend · nächste: Wöchentlich Muster 19.10.',
  );
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.kupcoming [data-booking]')).toHaveCount(18);
  await expect(scheduled).toHaveCount(1);
  await toggle.click();
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

  // Kommend is a read-only preview: no book/skip actions in the row; the name opens the payment.
  await expect(scheduled.getByRole('button')).toHaveCount(0);
  const link = scheduled.getByRole('link', { name: /Wöchentlich Muster/ });
  await expect(link).toBeVisible();
  if (touch) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);

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
