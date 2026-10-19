import AxeBuilder from '@axe-core/playwright';
import { devices, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { sampleTest, SAMPLE_NOW, SAMPLE_URL } from './sample';
import { STORAGE_STATE_SAMPLE } from '../playwright.config';

async function paintedRoles(page: Page, phone: boolean) {
  return page.evaluate((isPhone) => {
    const rgb = (value: string) => {
      const match = value.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
      if (!match) throw new Error(`Unknown computed color: ${value}`);
      const alpha = match[4] === undefined ? 1 : Number(match[4]);
      if (alpha === 0) return null;
      if (alpha !== 1) throw new Error(`Nonopaque normal-text background: ${value}`);
      const channels = match.slice(1, 4).map(Number);
      if (channels.some((value) => !Number.isFinite(value) || value < 0 || value > 255))
        throw new Error(`Invalid computed color: ${value}`);
      return channels;
    };
    const token = (name: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value))
        throw new Error(`Unknown ${name}: ${value}`);
      const hex =
        value.length === 4 ? Array.from(value.slice(1), (x) => x + x).join('') : value.slice(1);
      return `rgb(${[0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
    };
    const visible = (selector: string) => {
      const element = Array.from(document.querySelectorAll(selector)).find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!element) throw new Error(`Missing visible role: ${selector}`);
      return element;
    };
    const luminance = (channels: number[]) =>
      channels
        .map((value) => {
          const c = value / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
    const selectors = isPhone
      ? ['.month-switch h1', '[data-testid="to-be-assigned"]', '.m-title-text']
      : [
          '.month-switch h1',
          '.ptable-zero .assign-btn:not(.is-ghost)',
          '.sidebar-foot .profile-text strong',
          '.insp-list dd',
        ];
    const normal = selectors.map((selector) => {
      const element = visible(selector),
        style = getComputedStyle(element),
        rect = element.getBoundingClientRect();
      const foreground = rgb(style.color);
      if (!foreground) throw new Error(`Transparent normal foreground: ${selector}`);
      let background: number[] | null = null;
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const current = getComputedStyle(ancestor);
        if (Number(current.opacity) !== 1)
          throw new Error(`Nonopaque normal ancestor: ${selector}`);
        background = rgb(current.backgroundColor);
        if (background) break;
      }
      if (!background) throw new Error(`No opaque normal background: ${selector}`);
      const a = luminance(foreground),
        b = luminance(background);
      return {
        selector,
        color: style.color,
        textFill: style.getPropertyValue('-webkit-text-fill-color'),
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        inViewport:
          rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
      };
    });
    const semantic = [
      ['.ptable-zero .spending-status:not(.neg-alert)', '--ink-3'],
      ['.ptable-zero .pill.is-good', '--on-good-soft'],
      ['.ptable-zero .pill.is-bad', '--red'],
    ].map(([selector, name]) => {
      const style = getComputedStyle(visible(selector!));
      return {
        selector,
        expected: token(name!),
        color: style.color,
        textFill: style.getPropertyValue('-webkit-text-fill-color'),
      };
    });
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      storedTheme: localStorage.getItem('budget-theme'),
      expectedInk: token('--ink'),
      expectedGround: token('--ground'),
      bodyColor: getComputedStyle(document.body).color,
      rootColor: getComputedStyle(document.getElementById('root')!).color,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      normal,
      semantic,
      viewport: { width: innerWidth, height: innerHeight },
      scrollY,
      documentWidth: document.documentElement.scrollWidth,
    };
  }, phone);
}

const THEME_ROLES = {
  light: {
    ink: 'rgb(11, 27, 51)',
    ground: 'rgb(242, 245, 249)',
    semantic: ['rgb(77, 106, 137)', 'rgb(27, 86, 50)', 'rgb(196, 42, 31)'],
  },
  dark: {
    ink: 'rgb(238, 246, 252)',
    ground: 'rgb(11, 49, 82)',
    semantic: ['rgb(143, 180, 209)', 'rgb(168, 230, 192)', 'rgb(255, 139, 123)'],
  },
} as const;

for (const profile of ['desktop', 'phone'] as const) {
  sampleTest(
    `${profile}: reduced motion retains normal ink and semantic colors through real theme transitions`,
    async ({ browser }, info) => {
      const phone = profile === 'phone';
      const context = await browser.newContext({
        ...(phone
          ? devices['iPhone 13']
          : { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false }),
        baseURL: SAMPLE_URL,
        storageState: STORAGE_STATE_SAMPLE,
        colorScheme: 'light',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      try {
        await context.addInitScript(() => localStorage.removeItem('budget-theme'));
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date(SAMPLE_NOW));
        await page.goto('/plan/monat?monat=2026-09');
        await expect(page.locator('.ptable-zero')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        for (const theme of ['dark', 'light'] as const) {
          if (phone) {
            const menu = page.locator('.m-profile');
            const summary = menu.locator('summary');
            const summaryBox = await summary.boundingBox();
            expect(summaryBox!.width).toBeGreaterThanOrEqual(44);
            expect(summaryBox!.height).toBeGreaterThanOrEqual(44);
            await summary.tap();
            await expect(menu).toHaveJSProperty('open', true);
            const control = menu.getByRole('button', {
              name: theme === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
              exact: true,
            });
            const controlBox = await control.boundingBox();
            expect(controlBox!.width).toBeGreaterThanOrEqual(44);
            expect(controlBox!.height).toBeGreaterThanOrEqual(44);
            await control.tap();
            await summary.tap();
            await expect(menu).toHaveJSProperty('open', false);
          } else {
            const control = page
              .locator('.sidebar-foot')
              .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true });
            await control.click();
            await expect(control).toHaveAttribute('aria-pressed', String(theme === 'dark'));
          }
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          expect(await page.evaluate(() => localStorage.getItem('budget-theme'))).toBe(theme);
          const expected = THEME_ROLES[theme];
          let beforeCapture = await paintedRoles(page, phone);
          // Require actual inherited text, surfaces and semantic roles before the first capture.
          // The previous universal positive duration left native color transitions pending.
          await expect
            .poll(async () => {
              beforeCapture = await paintedRoles(page, phone);
              return (
                beforeCapture.theme === theme &&
                beforeCapture.storedTheme === theme &&
                beforeCapture.expectedInk === expected.ink &&
                beforeCapture.expectedGround === expected.ground &&
                beforeCapture.bodyColor === expected.ink &&
                beforeCapture.rootColor === expected.ink &&
                beforeCapture.bodyBackground === expected.ground &&
                beforeCapture.normal.every(
                  (role) =>
                    role.inViewport &&
                    role.color === expected.ink &&
                    role.textFill === expected.ink &&
                    role.ratio >= 4.5,
                ) &&
                beforeCapture.semantic.every(
                  (role, index) =>
                    role.color === expected.semantic[index] &&
                    role.textFill === expected.semantic[index] &&
                    role.expected === expected.semantic[index],
                )
              );
            })
            .toBe(true);
          // A normal viewport capture is the observed screen, not a repaint workaround.
          await page.screenshot({ path: info.outputPath(`${profile}-${theme}.png`) });
          const afterCapture = await paintedRoles(page, phone);
          expect(afterCapture.expectedInk).toBe(expected.ink);
          expect(afterCapture.expectedGround).toBe(expected.ground);
          expect(afterCapture.bodyColor).toBe(afterCapture.expectedInk);
          expect(afterCapture.rootColor).toBe(afterCapture.expectedInk);
          expect(afterCapture.bodyBackground).toBe(afterCapture.expectedGround);
          expect(afterCapture.scrollY).toBe(0);
          expect(afterCapture.documentWidth).toBeLessThanOrEqual(afterCapture.viewport.width);
          for (const role of afterCapture.normal) {
            expect(role.inViewport, role.selector).toBe(true);
            expect(role.color, role.selector).toBe(afterCapture.expectedInk);
            expect(role.textFill, role.selector).toBe(afterCapture.expectedInk);
            expect(role.ratio, role.selector).toBeGreaterThanOrEqual(4.5);
          }
          for (const [index, role] of afterCapture.semantic.entries()) {
            expect(role.expected, role.selector).toBe(expected.semantic[index]);
            expect(role.color, role.selector).toBe(role.expected);
            expect(role.textFill, role.selector).toBe(role.expected);
            expect(role.color, role.selector).not.toBe(afterCapture.expectedInk);
          }
          expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
          writeFileSync(
            info.outputPath(`${profile}-${theme}.json`),
            JSON.stringify(
              {
                engine: browser.browserType().name(),
                browserVersion: browser.version(),
                profile,
                theme,
                configured: {
                  viewport: phone ? devices['iPhone 13'].viewport : { width: 1440, height: 900 },
                  isMobile: phone,
                  hasTouch: phone,
                },
                beforeCapture,
                afterCapture,
              },
              null,
              2,
            ) + '\n',
          );
        }
      } finally {
        await context.close();
      }
    },
  );
}
