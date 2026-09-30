import { expect, test } from '@playwright/test';
import { ROUTES } from './routes';

// Audit D10: layout bugs seen on the owner's phone (390 x 844).
test.describe('phone layout', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('the last control of every page can be scrolled fully into view above tab bar and + button', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const problems: string[] = [];
    for (const path of ROUTES) {
      await page.goto(path);
      await expect(page.locator('.m-head h1')).toBeVisible();
      const result = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const focusable = [
          ...document.querySelectorAll<HTMLElement>(
            'main a[href], main button:not([disabled]), main input:not([disabled]):not([type=hidden]), main select:not([disabled]), main textarea:not([disabled]), main [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const last = focusable.at(-1);
        if (!last) return { none: true } as const;
        const rect = last.getBoundingClientRect();
        const bar = document.querySelector('.tabbar')?.getBoundingClientRect();
        const fab = document.querySelector('.fab')?.getBoundingClientRect();
        const covers = (o: DOMRect | undefined) =>
          Boolean(o) &&
          rect.bottom > (o as DOMRect).top &&
          rect.top < (o as DOMRect).bottom &&
          rect.right > (o as DOMRect).left &&
          rect.left < (o as DOMRect).right;
        return {
          none: false,
          name: (last.textContent || last.getAttribute('aria-label') || last.tagName).trim(),
          inside: rect.top >= 0 && rect.bottom <= window.innerHeight,
          underBar: covers(bar),
          underFab: covers(fab),
        } as const;
      });
      if (result.none) continue;
      if (!result.inside || result.underBar || result.underFab)
        problems.push(`${path}: "${result.name}" ${JSON.stringify(result)}`);
    }
    expect(problems).toEqual([]);
  });

  test('title-block fields keep their label on the phone', async ({ page }) => {
    await page.goto('/einstellungen/sicherheit');
    const field = page.locator('.titleblock .tb-field').first();
    await expect(field.locator('.tb-label')).toBeVisible();
    await expect(field.locator('.tb-label')).toHaveText(/passkeys/i);
    await expect(field.locator('.tb-value')).toBeVisible();
  });

  test('the header shows the register name and never truncates it', async ({ page }) => {
    for (const path of ['/einstellungen/sicherheit', '/plan/monat', '/vermoegen/nettovermoegen']) {
      await page.goto(path);
      const h1 = page.locator('.m-head h1');
      await expect(h1, path).not.toContainText('·');
      const clipped = await h1.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(clipped, path).toBe(false);
    }
  });

  test('a scrolling register row shows that there is more', async ({ page }) => {
    await page.goto('/einstellungen/sicherheit');
    const registers = page.locator('.registers');
    const overflows = await registers.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflows).toBe(true);
    // Edge fade at the end while there is more to the right, at the start once scrolled.
    await expect(registers).toHaveAttribute('data-fade-end', 'true');
    await expect(registers).not.toHaveAttribute('data-fade-start', 'true');
    await registers.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect(registers).toHaveAttribute('data-fade-start', 'true');
    await expect(registers).not.toHaveAttribute('data-fade-end', 'true');
  });
});
