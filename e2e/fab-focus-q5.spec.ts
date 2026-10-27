import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';
import type { Page } from '@playwright/test';

async function scroll(page: Page, y: number) {
  await page.evaluate(async (next) => {
    window.scrollTo(0, next);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  }, y);
}

test('phone FAB follows scroll direction, including reduced motion, and clears the last amount', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  test.skip(!isMobile, 'Phone floating action');
  await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    for (const path of ['/?monat=2026-09', '/konten']) {
      await page.goto(path);
      const fab = page.locator('.fab');
      const amount = page
        .locator(path.startsWith('/?') ? '.heute-booking a:visible' : '.kc-num:visible')
        .last();
      await expect(amount).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (path === '/konten') {
        await expect(page.locator('.krow .kmini')).toHaveCount(await page.locator('.krow').count());
      }
      await expect(fab).toBeVisible();
      await expect(page.locator(path.startsWith('/?') ? '.heute' : '.kview')).toBeVisible();
      await scroll(page, 300);
      await expect(fab).toBeHidden();
      await scroll(page, 220);
      await expect(fab).toBeVisible();
      if (reducedMotion === 'reduce') {
        expect(await fab.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
        expect(await fab.evaluate((el) => el.getAnimations().length)).toBe(0);
      }
      await scroll(page, await page.evaluate(() => document.documentElement.scrollHeight));
      await expect(fab).toBeHidden();
      await scroll(page, await page.evaluate(() => window.scrollY - 1));
      await expect(fab).toBeVisible();
      await expect(amount).toBeVisible();
      const amountBox = (await amount.boundingBox())!;
      const fabBox = (await fab.boundingBox())!;
      expect(amountBox.y + amountBox.height).toBeLessThanOrEqual(fabBox.y - 16 + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
    }
  }
});

test('detail has one name, one return path and keyboard-only focus in both themes', async ({
  page,
}, info) => {
  // Fourteen full-page Axe passes include the long account journal on real WebKit.
  test.setTimeout(300_000);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const [path, name, heading, back] of [
      [
        '/einstellungen/kategorien/cat-investieren?ausgeblendet=true',
        'Investieren (ETF-Sparplan)',
        '#category-detail-title',
        '/einstellungen/kategorien',
      ],
      ['/konten/acc-giro', 'Girokonto', '.kacct-head > div > h2', '/konten'],
      ['/konten/acc-depot', 'Depot', '.depot-name', '/konten'],
      [
        '/konten/kontakte/con-muster',
        'Kontakt M. Muster',
        '.contacts-title > h2',
        '/konten/kontakte',
      ],
      [
        '/plan/monat/envelope/cat-investieren?monat=2026-09',
        'Investieren (ETF-Sparplan)',
        '#envelope-title',
        '/plan/monat',
      ],
      [
        '/plan/sparziele/goal-urlaub?monat=2026-09',
        'Urlaub Sommer 2027',
        '#goal-detail-title',
        '/plan/sparziele',
      ],
      ['/heute/details/liquid?monat=2026-09', 'Liquidität', '#dimension-title', '/'],
    ] as const) {
      await page.goto(path);
      const title = page.locator(heading);
      await expect(title).toContainText(name);
      await expect(page.getByRole('heading').filter({ hasText: name })).toHaveCount(1);
      const returns = page.locator(
        '.plan-panel-nav a, .plan-detail-nav a, .heute-detail-nav a, .contacts-statement nav a, .kacct > .kback',
      );
      await expect(returns).toHaveCount(1);
      const targets = await returns.evaluateAll((links) =>
        links.map((link) => {
          const box = link.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      );
      expect(targets.every((box) => box.width >= 44 && box.height >= 44)).toBe(true);
      await expect(returns).toHaveAttribute(
        'href',
        new RegExp(`^${back.replace(/[?]/g, '\\?')}(?:\\?|$)`),
      );
      // Route focus must announce the detail without painting a heading ring.
      await expect(title).toBeFocused();
      expect(await title.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
      await page.keyboard.press('Tab');
      const focus = page.locator(':focus');
      await expect(focus).toHaveCSS('outline-width', '2px');
      await expect(focus).toHaveCSS('outline-style', 'solid');
      if (path === '/konten/acc-giro') {
        // Wait for the register and fonts before checking the reconciliation focus state (#542).
        await expect(page.locator('.ktx-account tr[data-booking]').first()).toBeVisible();
        await expect(page.locator('.ktx-account tr[data-booking]')).toHaveCount(100);
        await page.evaluate(() => document.fonts.ready);
        await page.keyboard.press('Tab');
        await expect(page.getByTestId('account-review-badge')).toBeFocused();
        await expect(focus).toHaveCSS('outline-width', '2px');
        await expect(focus).toHaveCSS('outline-style', 'solid');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`${heading.replace(/\W/g, '')}-${colorScheme}.png`),
        fullPage: false,
      });
    }
  }
});

test('desktop sidebar combines profile/settings and exposes a persistent theme state', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop sidebar');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const footer = page.locator('.sidebar-foot');
  await expect(footer.getByRole('link')).toHaveCount(1);
  await expect(footer.getByRole('link', { name: 'Profil / Einstellungen' })).toHaveAttribute(
    'href',
    '/einstellungen/profil',
  );
  const toggle = footer.getByRole('button', { name: 'Hell/Dunkel umschalten' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page
    .locator('.topbar')
    .getByRole('button', { name: /Seitenleiste/ })
    .click();
  await expect(toggle).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Profil / Einstellungen' })).toBeVisible();
});
