import { sampleTest as test, expect } from './sample';
import { MIN_TARGET_PX } from './ledger-helpers';

const PAGES = ['/', '/einstellungen', '/vermoegen/portfolio', '/plan/monat'];

test.describe('UX-3a phone shell', () => {
  test.skip(({ isMobile }) => !isMobile, '390 px phone project');

  test('search is in the header and booking is the only floating action', async ({ page }) => {
    test.setTimeout(120_000);
    for (const path of PAGES) {
      await page.goto(path);
      const header = page.locator('.m-head');
      const search = header.getByRole('button', { name: 'Suchen', exact: true });
      await expect(search, path).toBeVisible();
      const fixedActions = await page.locator('a:visible, button:visible').evaluateAll((elements) =>
        elements
          .filter((el) => {
            const box = el.getBoundingClientRect();
            return (
              getComputedStyle(el).position === 'fixed' &&
              box.bottom > 0 &&
              box.top < window.innerHeight
            );
          })
          .map((el) => el.getAttribute('aria-label')),
      );
      expect(fixedActions, path).toEqual(['Buchung erfassen']);
      const fab = page.getByRole('link', { name: 'Buchung erfassen', exact: true });
      const box = (await fab.boundingBox())!;
      const bar = (await page.locator('.tabbar').boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width - 16);
      expect(bar.y - box.y - box.height).toBe(16);
      await search.tap();
      const input = page.getByRole('combobox', { name: 'Suchen', exact: true });
      await expect(input).toBeFocused();
      await input.press('Escape');
      await expect(search).toBeFocused();
      await fab.tap();
      await expect(
        page.getByRole('dialog', { name: 'Buchung erfassen', exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      // Closing steps back in history; the next page must not start while that traversal is pending.
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).not.toHaveURL(/panel=/);
    }
  });

  test('a touch on the avatar opens an unobstructed profile menu', async ({ page }, info) => {
    test.setTimeout(120_000);
    for (const path of PAGES) {
      // The previous iteration ends on /einstellungen after a tap. Reloading that same URL
      // races WebKit's own pending navigation (interrupted goto, then a crashed page), so
      // only navigate when the page is not already there.
      if (new URL(page.url()).pathname !== path) await page.goto(path);
      const redesign = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
      const avatar = page.locator('.m-profile summary');
      const searchOnly = redesign && path !== '/';
      const entry = searchOnly
        ? page.locator('.m-head').getByRole('button', { name: 'Suchen', exact: true })
        : avatar;
      await expect(entry).toBeVisible();
      const hit = await entry.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { receivesTap: target === el || el.contains(target), target: target?.outerHTML };
      });
      expect(hit.receivesTap, `${path}: ${hit.target}`).toBe(true);
      if (searchOnly) {
        await expect(page.locator('.m-profile')).toHaveCount(0);
        await expect(
          page
            .locator('.m-head')
            .getByRole('link', { name: 'Profil und Einstellungen', exact: true }),
        ).toHaveCount(0);
        const bounds = await entry.boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        expect(bounds!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }
      await entry.tap();
      if (searchOnly) {
        const dialog = page.getByRole('dialog', { name: 'Suchen', exact: true });
        await expect(dialog).toBeVisible();
        const utilities = dialog.getByRole('group', { name: 'Darstellung', exact: true });
        for (const control of [
          utilities.getByRole('button', { name: 'Beträge verbergen', exact: true }),
          utilities.getByTitle('Hell/Dunkel umschalten', { exact: true }),
        ]) {
          await expect(control).toBeVisible();
          const bounds = await control.boundingBox();
          expect(bounds!.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(bounds!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        }
        await page.screenshot({ path: info.outputPath(`utilities-${PAGES.indexOf(path)}.png`) });
        await dialog.getByRole('combobox', { name: 'Suchen', exact: true }).press('Escape');
        await expect(dialog).toBeHidden();
        await expect(entry).toBeFocused();
      } else {
        await expect(page.locator('.m-profile')).toHaveAttribute('open');
        const settings = page.getByRole('link', { name: 'Profil und Einstellungen', exact: true });
        await expect(settings).toBeVisible();
        await page.screenshot({ path: info.outputPath(`profile-${PAGES.indexOf(path)}.png`) });
        await settings.tap();
        await expect(page).toHaveURL(redesign ? /\/einstellungen\/profil$/ : /\/einstellungen$/);
        if (redesign) await expect(page.locator('.m-profile')).toHaveCount(0);
        else await expect(page.locator('.m-profile')).not.toHaveAttribute('open');
      }
      // Let the tap-triggered navigation settle before the next page.goto, which would
      // otherwise be interrupted when both target the same URL.
      await page.waitForLoadState('load');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('the final content clears the FAB by 16 px after scrolling to the bottom', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const clearance = await page.locator('main').evaluate((el) => {
        const fab = document.querySelector('.fab')!.getBoundingClientRect();
        return (
          Number.parseFloat(getComputedStyle(el).paddingBottom) - (window.innerHeight - fab.top)
        );
      });
      expect(clearance, path).toBe(16);
      // The FAB is fixed: measure its slot before it hides on the way down (#468).
      const fabTop = await page.locator('.fab').evaluate((el) => el.getBoundingClientRect().top);
      // Reveal after reaching the bottom: the retained padding must also clear a visible FAB.
      // Two separate steps, so WebKit cannot merge both programmatic scrolls into one event.
      await page.evaluate(async () => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      });
      await page.evaluate(() => window.scrollBy(0, -60));
      await expect(page.locator('.fab')).toBeVisible();
      await expect
        .poll(
          async () =>
            page.locator('main').evaluate((el, top) => {
              const bottom = Math.max(
                ...[...el.children]
                  .filter((child) => child.getClientRects().length > 0)
                  .map((child) => child.getBoundingClientRect().bottom),
              );
              // Normalize the reveal scroll back to the page-end position.
              const remaining = document.documentElement.scrollHeight - innerHeight - scrollY;
              return Math.round(top - bottom + remaining);
            }, fabTop),
          { message: path },
        )
        .toBeGreaterThanOrEqual(16);
    }
  });
});
