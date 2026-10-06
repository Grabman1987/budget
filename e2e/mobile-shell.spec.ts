import { sampleTest as test, expect } from './sample';

const PAGES = ['/', '/einstellungen', '/vermoegen/portfolio', '/plan/monat'];

test.describe('UX-3a phone shell', () => {
  test.skip(({ isMobile }) => !isMobile, '390 px phone project');

  test('search is in the header and booking is the only floating action', async ({ page }) => {
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
    }
  });

  test('a touch on the avatar opens an unobstructed profile menu', async ({ page }, info) => {
    test.setTimeout(120_000);
    for (const path of PAGES) {
      await page.goto(path);
      const avatar = page.locator('.m-profile summary');
      await expect(avatar).toBeVisible();
      const hit = await avatar.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { receivesTap: target === el || el.contains(target), target: target?.outerHTML };
      });
      expect(hit.receivesTap, `${path}: ${hit.target}`).toBe(true);
      await avatar.tap();
      await expect(page.locator('.m-profile')).toHaveAttribute('open');
      const settings = page.getByRole('link', { name: 'Profil und Einstellungen', exact: true });
      await expect(settings).toBeVisible();
      await page.screenshot({ path: info.outputPath(`profile-${PAGES.indexOf(path)}.png`) });
      await settings.tap();
      await expect(page).toHaveURL(/\/einstellungen$/);
      await expect(page.locator('.m-profile')).not.toHaveAttribute('open');
      // Let the tap-triggered navigation settle before the next page.goto, which would
      // otherwise be interrupted when both target the same URL.
      await page.waitForLoadState('load');
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('the final content clears the FAB by 16 px after scrolling to the bottom', async ({
    page,
  }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      const clearance = await page.locator('main').evaluate((el) => {
        const fab = document.querySelector('.fab')!.getBoundingClientRect();
        return (
          Number.parseFloat(getComputedStyle(el).paddingBottom) - (window.innerHeight - fab.top)
        );
      });
      expect(clearance, path).toBe(16);
      await expect
        .poll(
          async () =>
            page.locator('main').evaluate((el) => {
              window.scrollTo(0, document.documentElement.scrollHeight);
              const bottom = Math.max(
                ...[...el.children]
                  .filter((child) => child.getClientRects().length > 0)
                  .map((child) => child.getBoundingClientRect().bottom),
              );
              const fab = document.querySelector('.fab')!.getBoundingClientRect();
              return Math.round(fab.top - bottom);
            }),
          { message: path },
        )
        .toBeGreaterThanOrEqual(16);
    }
  });
});
