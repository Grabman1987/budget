import { expect, test } from '@playwright/test';
import { MIN_TARGET_PX } from './ledger-helpers';

test('category matches stay visible and tappable above the simulated keyboard', async ({
  page,
  isMobile,
}, info) => {
  const bookingWrites: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/bookings')
      bookingWrites.push(request.url());
  });
  await page.goto('/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  const field = dialog.getByRole('combobox', { name: 'Kategorie', exact: true });
  await field.fill('Ess');
  // Headless iPhone emulation has no OS keyboard: shrink the layout, then independently
  // pan/shrink visualViewport as WebKit does while keeping the input focused.
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 430 });
  for (const [offsetTop, height] of [
    [0, 300],
    [80, 240],
  ] as const) {
    await page.evaluate(
      (bounds) => {
        const viewport = window.visualViewport!;
        for (const [key, value] of Object.entries(bounds))
          Object.defineProperty(viewport, key, { configurable: true, value });
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
      },
      { offsetTop, height },
    );
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('aria-expanded', 'true');
    const list = dialog.getByRole('listbox', { name: 'Kategorie, Vorschläge' });
    const match = list.getByRole('option', { name: /^Essen/ });
    await expect(match).toBeVisible();
    await expect
      .poll(() =>
        match.evaluate((option) => {
          const box = option.getBoundingClientRect();
          const viewport = window.visualViewport!;
          return (
            box.top >= viewport.offsetTop &&
            box.bottom <= viewport.offsetTop + viewport.height &&
            option.contains(
              document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
            )
          );
        }),
      )
      .toBe(true);
    expect((await match.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    await page.screenshot({ path: info.outputPath(`category-keyboard-${offsetTop}.png`) });
    if (isMobile) await match.tap();
    else await match.click();
    await expect(field).toHaveValue('Essen');
    await expect(list).toHaveCount(0);
    // Reopening by typing must work without dismissing the keyboard first.
    await field.fill('Ess');
  }
  // Enter chooses the visible match even if the scroller has clipped the focused anchor;
  // it must never propagate to the booking form's save shortcut.
  await expect(dialog.getByRole('option', { name: /^Essen/ })).toBeVisible();
  await field.press('Enter');
  await expect(field).toHaveValue('Essen');
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(bookingWrites).toEqual([]);
  await field.fill('Ess');
  await field.press('Escape');
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
  await expect(dialog).toBeVisible();
});
