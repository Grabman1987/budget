/** Synthetic gallery proof only. The caller owns artifacts, browser, auth, server and cleanup. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { MIN_TARGET_PX } from '../../e2e/ledger-helpers';

export interface GalleryProofOptions {
  origin: string;
  storageState: string;
  mode: 'off' | 'on';
  outputDir: string;
}

const ROLES =
  'rule rule-strong warning warning-soft line primary ink-2 good red raised ground'.split(' ');
const rgb = (value: string): number[] => {
  if (value.startsWith('#')) {
    const hex =
      value.length === 4 ? [...value.slice(1)].map((x) => x + x).join('') : value.slice(1);
    return hex.match(/../g)!.map((x) => parseInt(x, 16));
  }
  return Array.from(value.matchAll(/[\d.]+/g), (match) => Number(match[0])).slice(0, 3);
};
const color = (value: string) => `rgb(${rgb(value).join(', ')})`;
function contrast(a: string, b: string) {
  const lum = (v: string) =>
    rgb(v).reduce((sum, channel, i) => {
      const x = channel / 255;
      return (
        sum +
        [0.2126, 0.7152, 0.0722][i]! * (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
      );
    }, 0);
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

async function styles(target: Locator) {
  return target.evaluate((element, roles) => {
    const s = getComputedStyle(element);
    return {
      roles: Object.fromEntries(roles.map((r) => [r, s.getPropertyValue(`--${r}`).trim()])),
      color: s.color,
      background: s.backgroundColor,
      border: s.borderBottomColor,
      shadow: s.boxShadow,
      font: s.fontFamily,
      fontSize: s.fontSize,
      loaded: document.fonts.check(`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`),
    };
  }, ROLES);
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0.5);
}

async function interactions(page: Page, expectedRule: string) {
  const field = page.getByRole('textbox', { name: 'Empfänger', exact: true });
  await field.focus();
  await field.press('Tab');
  const next = page.getByRole('textbox', { name: 'Kategorie', exact: true });
  await expect(next).toBeFocused();
  await next.press('Shift+Tab');
  await expect(field).toBeFocused();
  const focused = await styles(field);
  expect(focused.border).toBe(color(focused.roles.line!));
  expect(focused.shadow).not.toBe('none');
  const register = page.getByRole('button', { name: 'Jahr', exact: true });
  await register.click();
  await expect(register).toHaveAttribute('aria-pressed', 'true');

  const trigger = page.getByRole('button', { name: 'Eingabedialog öffnen', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Kontostand prüfen', exact: true });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (el) => el instanceof HTMLDialogElement && el.open && el.matches(':modal'),
    ),
  ).toBe(true);
  const input = dialog.getByRole('textbox', { name: 'Saldo laut Bank', exact: true });
  await input.focus();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(input).toBeFocused();
  const floating = await styles(dialog);
  expect(floating.roles.rule).toBe(expectedRule);
  expect(floating.shadow).not.toBe('none');
  expect(floating.shadow).not.toBe((await styles(page.locator('.titleblock'))).shadow);
  expect(contrast(floating.color, floating.background)).toBeGreaterThanOrEqual(4.5);
  await noOverflow(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  const row = page.getByText('12 Buchungen im Posteingang', { exact: true });
  await page.getByRole('button', { name: 'Öffnen', exact: true }).first().click();
  await expect(row).toBeHidden();
  const toast = page.locator('.toast.is-open');
  await expect(toast).toBeVisible();
  const toastStyle = await styles(toast.locator('.toast-body'));
  expect(toastStyle.roles.rule).toBe(expectedRule);
  expect(toastStyle.shadow).toBe(floating.shadow);
  expect(contrast(toastStyle.color, toastStyle.background)).toBeGreaterThanOrEqual(4.5);
  const undo = toast.getByRole('button', { name: 'Rückgängig', exact: true });
  await undo.click();
  await expect(row).toBeVisible();
  await expect(toast).toBeHidden();

  const chart = page.locator('.chart-interactive').filter({ has: page.getByTestId('chart-lines') });
  await chart.focus();
  await chart.press('ArrowRight');
  const tooltip = page.locator('.chart-tooltip');
  await expect(tooltip).toBeVisible();
  expect(await tooltip.evaluate((el) => el.parentElement === document.body)).toBe(true);
  const portal = await styles(tooltip);
  expect(portal.roles.rule).toBe(expectedRule);
  expect(portal.border).toBe(color(portal.roles['rule-strong']!));
  expect(contrast(portal.color, portal.background)).toBeGreaterThanOrEqual(4.5);
  await chart.press('Escape');
  await expect(tooltip).toBeHidden();
}

async function gallery(browser: Browser, options: GalleryProofOptions, widths: readonly number[]) {
  mkdirSync(options.outputDir, { recursive: true });
  for (const width of widths)
    for (const theme of ['light', 'dark'] as const) {
      const dark = theme === 'dark',
        on = options.mode === 'on';
      const context = await browser.newContext({
        baseURL: options.origin,
        storageState: options.storageState,
        serviceWorkers: 'block',
        viewport: { width, height: width === 1440 ? 900 : 844 },
        isMobile: width < 768,
        hasTouch: width < 768,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      try {
        const page = await context.newPage();
        await page.goto('/dev/bauteile');
        await expect(page.getByTestId('chart-lines')).toBeVisible();
        await expect(page.getByTestId('chart-classes')).toBeVisible();
        await page.getByRole('button', { name: dark ? 'Dunkel' : 'Hell', exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('.app')).toHaveCount(0);
        const marker = page.locator('[data-budget-redesign]');
        await expect(marker).toHaveCount(on ? 1 : 0);
        if (on) await expect(marker).toHaveAttribute('data-budget-redesign', '1');
        const field = page.getByRole('textbox', { name: 'Empfänger', exact: true });
        const sample = await styles(field);
        const expectedRule = on ? (dark ? '#1f4d7c' : '#d3deec') : dark ? '#25557a' : '#d6dfed';
        expect(color(sample.roles.rule!)).toBe(color(expectedRule));
        expect(color(sample.roles['rule-strong']!)).toBe(color(dark ? '#4987bc' : '#6786ac'));
        expect(sample.border).toBe(color(sample.roles['rule-strong']!));
        expect(sample.background).toBe(color(dark ? '#0f3b60' : '#ffffff'));
        expect(sample.font).toContain('Archivo');
        expect(sample.fontSize).toBe(width < 768 ? '16px' : '15px');
        expect(sample.loaded).toBe(true);
        const stamp = await styles(page.locator('.stamp').first());
        expect(stamp.font).toContain('Barlow Semi Condensed');
        expect(stamp.loaded).toBe(true);
        await expect(page.locator('#farben .head')).toHaveCSS(
          'border-bottom-color',
          color(expectedRule),
        );
        expect(color(sample.roles.line!)).toBe(color(dark ? '#d2ecff' : '#1747a6'));
        const primary = await styles(page.getByRole('button', { name: 'Buchung', exact: true }));
        expect(primary.background).toBe(color(dark ? '#d0f4ff' : '#1747a6'));
        expect(primary.color).toBe(color(dark ? '#0b3152' : '#ffffff'));
        expect(contrast(primary.color, primary.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(sample.border, sample.background)).toBeGreaterThanOrEqual(3);
        await expect(page.locator('#kette-frei .plot-line').first()).toHaveCSS(
          'animation-name',
          'none',
        );

        const states = page.getByRole('group', { name: 'Budgetzustände', exact: true });
        if (on) {
          expect(color(sample.roles.warning!)).toBe(color(dark ? '#ffd37a' : '#8a5300'));
          expect(color(sample.roles['warning-soft']!)).toBe(color(dark ? '#473d2b' : '#fff3d6'));
          for (const [label, glyph, role] of [
            ['Ziel erfüllt', 'lucide-check', 'primary'],
            ['Offen', 'lucide-chart-pie', 'warning'],
            ['Überzogen', 'lucide-credit-card', 'red'],
            ['Mehr als Ziel', 'lucide-arrow-up', 'good'],
            ['Null / pausiert', 'lucide-minus', 'ink-2'],
          ]) {
            const mark = states.getByText(label!, { exact: true });
            await expect(mark).toBeVisible();
            await expect(mark.locator(`svg.${glyph}`)).toHaveAttribute('aria-hidden', 'true');
            const markStyle = await styles(mark);
            expect(markStyle.color).toBe(color(sample.roles[role!]!));
            expect(contrast(markStyle.color, sample.roles.ground!)).toBeGreaterThanOrEqual(4.5);
          }
          const booking = page.getByRole('group', { name: 'Buchungsstatus', exact: true });
          for (const [label, glyph] of [
            ['vorgemerkt', 'booking-status-pending'],
            ['bestätigt', 'lucide-check-check'],
            ['geprüft', 'lucide-lock'],
          ])
            await expect(
              booking.getByText(label!, { exact: true }).locator(`svg.${glyph}`),
            ).toBeVisible();
        } else {
          await expect(states).toHaveCount(0);
          expect(sample.roles.warning).toBe('');
          expect(sample.roles['warning-soft']).toBe('');
        }
        if (width < 768) {
          const targets = await page
            .locator('button, input, select, [role="switch"]')
            .evaluateAll((elements) =>
              elements
                .filter((el) => el.getClientRects().length && !el.closest('dialog:not([open])'))
                .map((el) => ({
                  width: el.getBoundingClientRect().width,
                  height: el.getBoundingClientRect().height,
                })),
            );
          for (const target of targets) {
            expect(target.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
            expect(target.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          }
        }
        await noOverflow(page);
        const filename = `gallery-${browser.browserType().name()}-${options.mode}-${theme}-${width}.png`;
        await page.screenshot({
          path: join(options.outputDir, filename),
          fullPage: true,
          animations: 'disabled',
        });
        const list = page.getByRole('region', { name: 'Alle Spalten der Stückliste', exact: true });
        if (await list.evaluate((element) => element.scrollWidth > element.clientWidth + 0.5)) {
          await list.focus();
          await expect(list).toBeFocused();
          await list.press('ArrowRight');
          await expect
            .poll(() => list.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          await list.screenshot({
            path: join(options.outputDir, filename.replace('.png', '-table-scrolled.png')),
            animations: 'disabled',
          });
        }
        await interactions(page, sample.roles.rule!);
      } finally {
        await context.close();
      }
    }
}

/** 1440/390 reference views plus 320 CSS-pixel reflow, never a true-zoom claim. */
export async function verifyRedesignGallery(
  browser: Browser,
  options: GalleryProofOptions,
): Promise<void> {
  await gallery(browser, options, [1440, 390, 320]);
}

/** Root supplies its existing Linux WebKit instance; this does not launch a browser or runner. */
export async function verifyRedesignGalleryPhone(
  browser: Browser,
  options: GalleryProofOptions,
): Promise<void> {
  expect(browser.browserType().name()).toBe('webkit');
  await gallery(browser, options, [390, 320]);
}
