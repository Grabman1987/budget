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
      await expect(page.locator('.m-head .m-title-text')).toBeVisible();
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
    for (const [path, label] of [
      ['/einstellungen/sicherheit', /profil/i],
      ['/konten', /stand/i],
      ['/plan/monat', /einnahmen/i],
    ] as const) {
      await page.goto(path);
      const field = page.locator('.titleblock .tb-field:visible').first();
      await expect(field.locator('.tb-label'), path).toBeVisible();
      await expect(field.locator('.tb-label'), path).toHaveText(label);
      await expect(field.locator('.tb-value'), path).toBeVisible();
    }
  });

  test('the header shows the area name (month on Heute) and never truncates it', async ({
    page,
  }) => {
    for (const [path, text] of [
      ['/einstellungen/sicherheit', 'Einstellungen'],
      ['/plan/monat', 'Plan'],
      ['/vermoegen/nettovermoegen', 'Vermögen'],
      ['/konten/buchungen', 'Konten'],
      ['/reports/gruppe/ausgaben', 'Reports'],
    ] as const) {
      await page.goto(path);
      const h1 = page.locator('.m-head .m-title-text');
      await expect(h1, path).toHaveText(text);
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
