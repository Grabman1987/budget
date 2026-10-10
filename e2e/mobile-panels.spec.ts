import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Mobile panel infrastructure (owner directive 04.10.2026, M01 to M12; docs/mobile-panels.md).
 *
 * Owner report from a real iPhone: the page darkened (backdrop) but no sheet appeared, for the
 * "+ Buchung" button and for the example panel. Cause: WebKit resolved the `height: 100%` of the
 * sheet's inner box against the dialog's `height: fit-content` as 0, so the sheet had no height;
 * Chromium treats that percentage as auto and showed it. That is why this spec runs in the
 * `webkit-iphone` project (real WebKit, iPhone 13 viewport) AND in `mobile` (Chromium): a
 * Chromium pass alone proves nothing for Safari.
 *
 * Each scenario is a real way to open a panel on the phone: the floating "+ Buchung" button
 * (FormDialog, bottom sheet), input dialogs and the primitive's own harness page `/dev/panels`.
 */

test.skip(({ isMobile }) => !isMobile, 'phone only');

interface Scenario {
  id: string;
  /** Accessible name of the dialog. */
  name: string;
  /** `sheet` stops short of the top and shows the backdrop above it; `full` fills the screen. */
  kind: 'sheet' | 'full';
  /** Opened by an in-app link (a history entry of its own): the browser's Back closes it. */
  inApp: boolean;
  open: (page: Page) => Promise<void>;
}

const app = async (page: Page, path: string) => {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
};

const SCENARIOS: Scenario[] = [
  {
    id: 'Buchung erfassen (FormDialog)',
    name: 'Buchung erfassen',
    kind: 'sheet',
    inApp: true,
    open: async (page) => {
      await app(page, '/konten');
      await page.getByRole('link', { name: 'Buchung erfassen' }).tap();
    },
  },
  {
    id: 'Harness: FormDialog',
    name: 'Formulardialog',
    kind: 'sheet',
    inApp: false,
    open: async (page) => {
      await page.goto('/dev/panels');
      await page.getByRole('button', { name: 'Formulardialog' }).tap();
    },
  },
  {
    id: 'Harness: WideDialog',
    name: 'Arbeitsdialog',
    kind: 'full',
    inApp: false,
    open: async (page) => {
      await page.goto('/dev/panels');
      await page.getByRole('button', { name: 'Arbeitsdialog' }).tap();
    },
  },
];

const dialogOf = (page: Page, s: Scenario) => page.getByRole('dialog', { name: s.name });

/** Waits until the open dialog stopped moving (entry transition done) and sits at its place. */
async function settle(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const d = document.querySelector<HTMLElement>('dialog.overlay[open]');
          if (!d) return 'no dialog';
          const before = JSON.stringify(d.getBoundingClientRect());
          await new Promise((resolve) => setTimeout(resolve, 150));
          const still = before === JSON.stringify(d.getBoundingClientRect());
          return still && getComputedStyle(d).transform === 'none' ? 'ok' : 'moving';
        }),
      { timeout: 10_000 },
    )
    .toBe('ok');
}

/** The page is free again: no open modal, no dialog still displayed (no invisible scrim). */
async function expectNoModal(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        open: document.querySelectorAll('dialog[open]').length,
        modal: document.querySelectorAll(':modal').length,
        displayed: [...document.querySelectorAll('dialog')].filter(
          (d) => getComputedStyle(d).display !== 'none',
        ).length,
      })),
    )
    .toEqual({ open: 0, modal: 0, displayed: 0 });
}

interface Geometry {
  viewport: { w: number; h: number };
  rect: { top: number; bottom: number; left: number; right: number; height: number };
  innerHeight: number;
  transform: string;
  display: string;
  hitInside: boolean;
  closeVisible: boolean;
  closeInViewport: boolean;
  closeHit: boolean;
  tabbarCovered: boolean | 'none';
  focusInside: boolean;
  overflowX: string[];
  docOverflow: boolean;
  docOffenders: string[];
}

/** Everything the acceptance criteria measure, taken in the page. */
const geometry = (page: Page): Promise<Geometry> =>
  page.evaluate(() => {
    const d = document.querySelector<HTMLDialogElement>('dialog.overlay[open]');
    if (!d) throw new Error('no open dialog');
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = d.getBoundingClientRect();
    const inner = d.querySelector('.overlay-inner')?.getBoundingClientRect();
    const close = d.querySelector<HTMLElement>('button[aria-label="Schließen"]');
    const cr = close?.getBoundingClientRect();
    const center = (b: DOMRect) => [b.left + b.width / 2, b.top + b.height / 2] as const;
    const at = (x: number, y: number) => document.elementFromPoint(x, y);
    const inside = at(...(inner ? center(inner) : center(r)));
    const closeEl = cr ? at(...center(cr)) : null;
    const tab = document.querySelector('.tabbar')?.getBoundingClientRect();
    const tabHit = tab ? at(...center(tab)) : null;
    const overflowX = [...d.querySelectorAll<HTMLElement>('*')]
      .filter((el) => !el.closest('.toast-host') && el.getClientRects().length > 0)
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 2 && (b.left < -0.5 || b.right > w + 0.5);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName}.${el.className}`);
    return {
      viewport: { w, h },
      rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height },
      innerHeight: inner?.height ?? 0,
      transform: getComputedStyle(d).transform,
      display: getComputedStyle(d).display,
      hitInside: Boolean(inside && inside !== d && d.contains(inside)),
      closeVisible: Boolean(cr && cr.width > 0 && cr.height > 0),
      closeInViewport: Boolean(cr && cr.top >= -0.5 && cr.bottom <= h + 0.5 && cr.left >= -0.5),
      closeHit: Boolean(close && closeEl && close.contains(closeEl)),
      tabbarCovered: tab ? !(tabHit && tabHit.closest('.tabbar')) : 'none',
      focusInside: d.contains(document.activeElement),
      overflowX,
      docOverflow: document.documentElement.scrollWidth > w + 1,
      docOffenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((el) => !d.contains(el) && el.getClientRects().length > 0)
        .filter((el) => getComputedStyle(el).position !== 'fixed')
        .filter((el) => el.getBoundingClientRect().right > w + 1)
        .slice(0, 5)
        .map(
          (el) =>
            `${el.tagName}.${el.className} right=${Math.round(el.getBoundingClientRect().right)}`,
        ),
    };
  });

/** M01 to M03 and M09/M10 as measurements of one open dialog. */
function expectVisibleAndInside(g: Geometry, s: Scenario) {
  // M01: a panel, not only a backdrop. The collapsed sheet of the bug had height 0.
  expect(g.display).not.toBe('none');
  expect(g.rect.height, 'dialog has a height').toBeGreaterThan(150);
  expect(g.innerHeight, 'content box has a height').toBeGreaterThan(100);
  expect(g.transform, 'no transform left over from the entry animation').toBe('none');
  expect(g.hitInside, 'content is what a tap hits at the sheet centre').toBe(true);
  // M02: fully inside the visual viewport, anchored to the bottom edge.
  expect(g.rect.top).toBeGreaterThanOrEqual(-0.5);
  expect(g.rect.left).toBeGreaterThanOrEqual(-0.5);
  expect(g.rect.right).toBeLessThanOrEqual(g.viewport.w + 0.5);
  expect(g.rect.bottom).toBeLessThanOrEqual(g.viewport.h + 0.5);
  expect(g.rect.bottom).toBeGreaterThanOrEqual(g.viewport.h - 1);
  if (s.kind === 'sheet') {
    // A sheet stops at 88 % of the screen: the backdrop stays visible above it.
    expect(g.rect.height).toBeLessThanOrEqual(g.viewport.h * 0.88 + 1);
  } else {
    expect(g.rect.top).toBeLessThanOrEqual(0.5);
  }
  // M03: the close control is shown, on screen and what a tap on it hits.
  expect(g.closeVisible).toBe(true);
  expect(g.closeInViewport).toBe(true);
  expect(g.closeHit).toBe(true);
  // Above the tab bar (top layer): the bar is not what a tap on its place hits.
  expect(g.tabbarCovered).not.toBe(false);
  // M10: nothing sticks out sideways.
  expect(g.overflowX).toEqual([]);
  expect(g.docOverflow, JSON.stringify(g.docOffenders)).toBe(false);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const s of SCENARIOS) {
      // M01, M02, M03, M10, M12 (every check runs in both themes) and M11 (axe).
      test(`M01-M03, M10-M12: ${s.id} is visible, inside the screen, closable, accessible`, async ({
        page,
      }) => {
        await s.open(page);
        await expect(dialogOf(page, s)).toBeVisible();
        await settle(page);
        const g = await geometry(page);
        expectVisibleAndInside(g, s);
        expect(g.focusInside, 'focus moved into the dialog').toBe(true);

        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        const serious = result.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => ({
            rule: v.id,
            targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
          }));
        expect(serious).toEqual([]);
      });
    }
  });
}

test.describe('behaviour', () => {
  for (const s of SCENARIOS) {
    test(`M06, M07: ${s.id} closes and reopens, no stale backdrop after repeated use`, async ({
      page,
    }) => {
      await s.open(page);
      await expect(dialogOf(page, s)).toBeVisible();
      await settle(page);
      for (let round = 0; round < 3; round += 1) {
        await dialogOf(page, s).getByRole('button', { name: 'Schließen' }).first().tap();
        await expect(dialogOf(page, s)).toBeHidden();
        await expectNoModal(page);
        // The page answers again: a tap on the tab bar place hits the bar, not an invisible scrim.
        // (The harness page lives outside the shell: it has no bar, so test the page body.)
        const hit = await page.evaluate(() => {
          const el = document.querySelector('.tabbar') ?? document.querySelector('main');
          if (!el) return false;
          const b = el.getBoundingClientRect();
          const top = document.elementFromPoint(b.left + 20, b.top + Math.min(b.height / 2, 20));
          return Boolean(top && el.contains(top));
        });
        expect(hit, 'nothing invisible covers the page').toBe(true);
        // Reopen the way the scenario opened it.
        await s.open(page);
        await expect(dialogOf(page, s)).toBeVisible();
        await settle(page);
        expectVisibleAndInside(await geometry(page), s);
      }
    });

    test(`M03: ${s.id} returns the focus to its trigger`, async ({ page }) => {
      test.skip(!s.id.startsWith('Harness'), 'the harness trigger is a real button');
      await s.open(page);
      await expect(dialogOf(page, s)).toBeVisible();
      await settle(page);
      await dialogOf(page, s).getByRole('button', { name: 'Schließen' }).first().tap();
      await expectNoModal(page);
      const label = await page.evaluate(() => document.activeElement?.textContent?.trim());
      expect(label).toBe(s.name);
    });
  }

  for (const s of SCENARIOS.filter((x) => x.inApp)) {
    test(`M05: ${s.id}: the browser's Back closes it, Forward reopens it`, async ({ page }) => {
      await s.open(page);
      await expect(dialogOf(page, s)).toBeVisible();
      await settle(page);
      await page.goBack();
      await expect(page).not.toHaveURL(/panel=/);
      await expect(dialogOf(page, s)).toBeHidden();
      await expectNoModal(page);
      await page.goForward();
      await expect(page).toHaveURL(/panel=/);
      await expect(dialogOf(page, s)).toBeVisible();
      await settle(page);
      expectVisibleAndInside(await geometry(page), s);
      // The close button steps back through history as well.
      await dialogOf(page, s).getByRole('button', { name: 'Schließen' }).first().tap();
      await expect(page).not.toHaveURL(/panel=/);
      await expectNoModal(page);
    });
  }

  for (const s of SCENARIOS.filter((x) => x.kind === 'sheet')) {
    test(`M04: ${s.id}: a tap on the backdrop closes, a tap inside does not`, async ({ page }) => {
      await s.open(page);
      await expect(dialogOf(page, s)).toBeVisible();
      await settle(page);
      const { top, w } = await page.evaluate(() => {
        const d = document.querySelector<HTMLElement>('dialog.overlay[open]');
        return { top: d?.getBoundingClientRect().top ?? 0, w: window.innerWidth };
      });
      expect(top, 'there is a backdrop above the sheet to tap').toBeGreaterThan(20);
      // Inside: the title area of the sheet.
      await page.touchscreen.tap(w / 2, top + 80);
      await expect(dialogOf(page, s)).toBeVisible();
      // On the backdrop.
      await page.touchscreen.tap(w / 2, top / 2);
      await expect(dialogOf(page, s)).toBeHidden();
      await expectNoModal(page);
    });
  }

  test('M08: the sheet scrolls, the page behind does not; the page keeps its place after closing', async ({
    page,
    browserName,
  }) => {
    const s = SCENARIOS.find((x) => x.name === 'Formulardialog') as Scenario;
    await page.goto('/dev/panels');
    // The harness is a lazy route: scrolling before its tall spacer exists clamps to 0 (seen on
    // Linux WebKit). Wait for the page, then scroll until the position holds.
    await expect(page.getByRole('button', { name: 'Formulardialog' })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          window.scrollTo(0, 300);
          return window.scrollY;
        }),
      )
      .toBe(300);
    await page.getByRole('button', { name: 'Formulardialog' }).tap();
    await expect(dialogOf(page, s)).toBeVisible();
    await settle(page);

    const body = page.locator('dialog.overlay[open] .bk-body');
    const m = await body.evaluate((el) => ({
      scrollable: el.scrollHeight > el.clientHeight + 20,
      overflowY: getComputedStyle(el).overflowY,
    }));
    expect(m.scrollable, 'long content scrolls inside the sheet').toBe(true);
    expect(m.overflowY).toBe('auto');
    // Scroll the sheet to its end. A wheel gesture exists only in Chromium (mobile WebKit has no
    // mouse wheel, and no touch-swipe API either): there the chaining to the page is exercised for
    // real, in WebKit the contract is checked as CSS (page locked, scroller contains overscroll).
    if (browserName === 'chromium') {
      await body.hover();
      await page.mouse.wheel(0, 3000);
      await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(200);
    } else {
      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
    }
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    // (The Playwright WebKit build has no overscroll-behavior; Safari 16+ has. The page lock below
    // is what holds there too.)
    if (await page.evaluate(() => CSS.supports('overscroll-behavior', 'contain'))) {
      expect(
        await body.evaluate((el) => getComputedStyle(el).getPropertyValue('overscroll-behavior-y')),
      ).toBe('contain');
    }
    expect(await page.evaluate(() => window.scrollY), 'page behind stayed put').toBe(300);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).overflowY),
      'page scroll is locked while the sheet is open',
    ).toBe('hidden');
    // Both the last input and the sticky save control remain reachable inside the sheet.
    const lastInside = await page.evaluate(() => {
      const d = document.querySelector('dialog.overlay[open]') as HTMLElement;
      const b = d.querySelector('.bk-foot button')?.getBoundingClientRect();
      const input = [...d.querySelectorAll('input')].at(-1)?.getBoundingClientRect();
      const r = d.getBoundingClientRect();
      return Boolean(
        b &&
        input &&
        b.bottom <= r.bottom + 0.5 &&
        b.top >= r.top &&
        input.bottom <= r.bottom &&
        input.top >= r.top,
      );
    });
    expect(lastInside, 'the last control is reachable').toBe(true);

    await dialogOf(page, s).getByRole('button', { name: 'Schließen' }).first().tap();
    await expectNoModal(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(300);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).overflowY),
    ).not.toBe('hidden');
  });

  test('M09: the sheet respects the bottom safe area and keeps its last control above it', async ({
    page,
  }) => {
    const s = SCENARIOS[0] as Scenario;
    await s.open(page);
    await expect(dialogOf(page, s)).toBeVisible();
    await settle(page);
    // Playwright cannot simulate a home-indicator inset, so the contract is checked in the CSS:
    // the sheet pads its bottom by env(safe-area-inset-bottom), the full-screen dialog its top.
    // The measured behaviour on a device with an inset is on the owner's checklist.
    const rules = await page.evaluate(() => {
      const found: Record<string, string> = {};
      const walk = (list: CSSRuleList) => {
        for (const rule of list) {
          if (rule instanceof CSSStyleRule) {
            if (rule.selectorText === '.sheet-bottom' && rule.style.paddingBottom)
              found['sheet'] = rule.style.paddingBottom;
            if (rule.selectorText.includes('is-full') && rule.style.paddingTop)
              found['full'] = rule.style.paddingTop;
          } else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of document.styleSheets) {
        try {
          walk(sheet.cssRules);
        } catch {
          // cross-origin sheet
        }
      }
      return found;
    });
    expect(rules['sheet']).toContain('safe-area-inset-bottom');
    expect(rules['full']).toContain('safe-area-inset-top');
    const gap = await page.evaluate(() => {
      const d = document.querySelector('dialog.overlay[open]') as HTMLElement;
      const foot = d.querySelector('.bk-foot')?.getBoundingClientRect();
      const r = d.getBoundingClientRect();
      return foot ? r.bottom - foot.bottom : -1;
    });
    expect(gap, 'the footer buttons end inside the sheet').toBeGreaterThanOrEqual(0);
  });

  test('Esc closes the dialog (where a keyboard exists)', async ({ page }) => {
    const s = SCENARIOS.find((x) => x.name === 'Formulardialog') as Scenario;
    await s.open(page);
    await expect(dialogOf(page, s)).toBeVisible();
    await settle(page);
    await page.keyboard.press('Escape');
    await expect(dialogOf(page, s)).toBeHidden();
    await expectNoModal(page);
  });

  test('the content does not depend on the entry animation (reduced motion)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const s of SCENARIOS) {
      await s.open(page);
      await expect(dialogOf(page, s)).toBeVisible();
      await settle(page);
      expectVisibleAndInside(await geometry(page), s);
    }
  });

  test('landscape: sheet and full-screen dialog stay inside the screen and closable', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // iPhone 13 landscape: 844 x 390 minus Safari's bars. Below 768 px wide it is still the phone
    // layout (750), at 844 the desktop layout (side panel, centred dialogs).
    for (const size of [
      { width: 750, height: 340 },
      { width: 844, height: 340 },
    ]) {
      await page.setViewportSize(size);
      // At 844 px the shell is the desktop one (no floating button, no phone header).
      for (const s of size.width < 768
        ? SCENARIOS
        : SCENARIOS.filter((x) => x.id.startsWith('Harness'))) {
        await s.open(page);
        await expect(dialogOf(page, s)).toBeVisible();
        await settle(page);
        const g = await geometry(page);
        const label = `${s.id} @ ${size.width}x${size.height}`;
        expect(g.rect.height, label).toBeGreaterThan(100);
        expect(g.rect.top, label).toBeGreaterThanOrEqual(-0.5);
        expect(g.rect.bottom, label).toBeLessThanOrEqual(g.viewport.h + 0.5);
        expect(g.rect.right, label).toBeLessThanOrEqual(g.viewport.w + 0.5);
        expect(g.closeInViewport, label).toBe(true);
        expect(g.closeHit, label).toBe(true);
        expect(g.docOverflow, `${label} ${JSON.stringify(g.docOffenders)}`).toBe(false);
        await dialogOf(page, s).getByRole('button', { name: 'Schließen' }).first().tap();
        await expectNoModal(page);
      }
    }
  });

  test('flow: Reports, profile, Settings, Anlageklassen, panel, close, reopen, Back, forward', async ({
    page,
  }) => {
    await app(page, '/reports');
    await page.locator('.m-profile summary').tap();
    await page.getByRole('link', { name: 'Profil und Einstellungen' }).tap();
    await expect(page).toHaveURL(/\/einstellungen$/);
    await page.goto('/einstellungen/anlageklassen');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    // The shared primitive on this page: the capture sheet opens, closes, reopens, Back closes.
    const s = SCENARIOS[0] as Scenario;
    await page.getByRole('link', { name: 'Buchung erfassen' }).tap();
    await expect(dialogOf(page, s)).toBeVisible();
    await settle(page);
    expectVisibleAndInside(await geometry(page), s);
    await dialogOf(page, s).getByRole('button', { name: 'Schließen' }).first().tap();
    await expectNoModal(page);
    await page.getByRole('link', { name: 'Buchung erfassen' }).tap();
    await expect(dialogOf(page, s)).toBeVisible();
    await page.goBack();
    await expectNoModal(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/einstellungen$/);
    await expectNoModal(page);
    await page.goForward();
    await expect(page).toHaveURL(/anlageklassen/);
    await expectNoModal(page);
  });
});
