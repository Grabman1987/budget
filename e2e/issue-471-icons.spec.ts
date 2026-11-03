import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, sampleTest as test } from './sample';
import { showPortfolioAnalysis } from './wealth-navigation';
import { redesignLoaded } from './ledger-helpers';

async function expectVisibleIconScale(page: Page) {
  if (new URL(page.url()).pathname === '/plan/monat')
    await expect(page.locator('.month-overview-head')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const redesign = document.querySelector('.app[data-budget-redesign="1"]') !== null;
        const redesignScales: Array<[string, number, number]> = [
          ['.area-page-menu > summary > .lucide-chevron-down', 16, 2],
          ['.wealth-investment > summary > .lucide-plus', 16, 2],
          ['.plan-reference-filters > summary > .lucide-chevron-down', 14, 2],
          ['.year-reference-metric > summary > .lucide-chevron-down', 14, 2],
          ['.year-reference-period > button > .lucide-chevron-left', 16, 2],
          ['.year-reference-period > button > .lucide-chevron-right', 16, 2],
          ['.year-reference-context > summary > .lucide-info', 16, 2],
          ['.year-chart-reference-extra > summary > .lucide-table-2', 16, 2],
          ['.wealth-next-icon > .lucide-scale', 17, 2],
          ['.wealth-freedom > .lucide-flag', 15, 2],
          ['.hv-net-delta > :is(.lucide-arrow-up, .lucide-arrow-down, .lucide-minus)', 14, 2],
        ];
        return Array.from(document.querySelectorAll<SVGSVGElement>('svg.lucide'))
          .filter(
            (icon) =>
              icon.isConnected &&
              icon.getClientRects().length > 0 &&
              getComputedStyle(icon).visibility !== 'hidden',
          )
          .flatMap((icon) => {
            const style = getComputedStyle(icon);
            const width = Number.parseFloat(style.width);
            const height = Number.parseFloat(style.height);
            const stroke = Number.parseFloat(style.strokeWidth);
            // Only these new components use the compact/default Lucide scale.
            // Every unchanged glyph keeps the original exact size/stroke checks in ON too.
            const adapted = redesign && redesignScales.find(([selector]) => icon.matches(selector));
            const expectedStroke = adapted ? adapted[2] : width === 16 ? 1.75 : 1.5;
            const expectedSize = adapted ? width === adapted[1] : [16, 20, 24].includes(width);
            return expectedSize && height === width && stroke === expectedStroke
              ? []
              : [
                  `${icon.getAttribute('class')}: ${style.width} × ${style.height}, stroke ${style.strokeWidth}`,
                ];
          });
      }),
    )
    .toEqual([]);
}

async function expectStatusContentInsideButton(status: Locator, redesigned: boolean) {
  const bounds = await status.evaluate((button) => {
    const icon = button.querySelector('svg');
    const label = button.querySelector('span');
    const dialog = button.closest('dialog, [role="dialog"]');
    if (!icon || !label || !dialog) throw new Error('Capture status content or dialog is missing');

    const rect = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    return {
      button: rect(button),
      icon: rect(icon),
      label: rect(label),
      labelDisplay: getComputedStyle(label).display,
      dialog: rect(dialog),
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  expect(bounds.icon.right - bounds.icon.left).toBe(16);
  if (redesigned) expect(bounds.labelDisplay).toBe('none');
  else expect(bounds.labelDisplay).not.toBe('none');
  for (const content of redesigned ? [bounds.icon] : [bounds.icon, bounds.label]) {
    expect(content.left).toBeGreaterThanOrEqual(bounds.button.left);
    expect(content.top).toBeGreaterThanOrEqual(bounds.button.top);
    expect(content.right).toBeLessThanOrEqual(bounds.button.right);
    expect(content.bottom).toBeLessThanOrEqual(bounds.button.bottom);
  }
  expect(bounds.button.left).toBeGreaterThanOrEqual(bounds.dialog.left);
  expect(bounds.button.right).toBeLessThanOrEqual(bounds.dialog.right);
  expect(bounds.button.left).toBeGreaterThanOrEqual(0);
  expect(bounds.button.right).toBeLessThanOrEqual(bounds.viewportWidth);
}

test('icon sizes, swatches and disclosure carets use their rendered styles', async ({
  page,
  isMobile,
}) => {
  await page.goto('/plan/monat?monat=2026-09');
  await expectVisibleIconScale(page);
  const planNavIcon = page.locator('a[href="/plan/monat"] svg:visible').first();
  await expect(planNavIcon).toBeVisible();
  const navStyle = await planNavIcon.evaluate((svg) => {
    const css = getComputedStyle(svg);
    return { width: css.width, stroke: css.strokeWidth };
  });
  expect(['16px', '20px', '24px']).toContain(navStyle.width);
  expect(navStyle.stroke).toBe(navStyle.width === '16px' ? '1.75px' : '1.5px');

  const splitDisclosure = page.locator('[data-overview-section="split"]');
  if (!(await splitDisclosure.evaluate((element) => element.hasAttribute('open'))))
    await splitDisclosure.locator(':scope > summary').click();
  await expect(splitDisclosure).toHaveAttribute('open', '');
  const classMarks = page.locator('.sb-legend');
  await expect(classMarks).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  for (const [kind, abbreviation] of [
    ['need', 'B'],
    ['want', 'W'],
    ['future', 'Z'],
  ] as const) {
    const swatch = classMarks.locator(`.sw-${kind}`);
    await expect(swatch).toBeVisible();
    await expect(swatch.locator('xpath=following-sibling::span[1]')).toHaveText(abbreviation);
    expect(await swatch.evaluate((el) => getComputedStyle(el).width)).toBe('12px');
  }

  const menu = page.locator('details.plan-menu', {
    has: page.locator('summary', { hasText: 'Optionen' }),
  });
  const chevron = menu.locator('summary .disclosure-chevron');
  const closed = await chevron.evaluate((el) => getComputedStyle(el).transform);
  expect(closed).not.toBe('none');
  await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');
  expect(await chevron.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  const selected = menu.locator('.plan-menu-selected:visible').first();
  await expect(selected).toBeVisible();
  expect(
    await selected.evaluate((svg) => ({
      width: getComputedStyle(svg).width,
      stroke: getComputedStyle(svg).strokeWidth,
    })),
  ).toEqual({ width: '16px', stroke: '1.75px' });
  await menu.locator('summary').click();

  await page.goto('/plan/jahr?monat=2026-09');
  await expectVisibleIconScale(page);
  if (await redesignLoaded(page)) await page.locator('.year-reference-context > summary').click();
  const infoSummary = page.locator('.year-instructions > summary').first();
  await expect(infoSummary.locator('svg.lucide-info')).toBeVisible();
  expect(await infoSummary.evaluate((el) => getComputedStyle(el, '::before').maskImage)).not.toBe(
    'none',
  );
  await infoSummary.click();
  await expect(infoSummary.locator('xpath=..')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.goto('/vermoegen/portfolio');
  await showPortfolioAnalysis(page);
  await page.getByRole('button', { name: 'Rendite %', exact: true }).click();
  await expectVisibleIconScale(page);
  const returnSummary = page.getByTestId('portfolio-return');
  await expect(returnSummary.locator('svg.lucide-info')).toBeVisible();
  expect(await returnSummary.evaluate((el) => getComputedStyle(el, '::before').maskImage)).not.toBe(
    'none',
  );

  if (isMobile) {
    await page.goto('/');
    const profileMenu = page.locator('details.m-profile');
    const avatar = profileMenu.locator(':scope > summary.avatar');
    await expect(profileMenu).toBeVisible();
    await expect(avatar).toBeVisible();
    const initials = (await avatar.textContent())?.trim() ?? '';
    expect(initials).not.toBe('');
    const avatarMarker = () =>
      avatar.evaluate((element) => getComputedStyle(element, '::before').maskImage);
    expect(await avatarMarker()).toBe('none');

    await avatar.click();
    await expect(profileMenu).toHaveAttribute('open', '');
    await expect(profileMenu.getByRole('link', { name: 'Profil und Einstellungen' })).toBeVisible();
    await expect(avatar).toHaveText(initials);
    expect(await avatarMarker()).toBe('none');

    await avatar.click();
    await expect(profileMenu).not.toHaveAttribute('open', '');
    await expect(avatar).toHaveText(initials);
    expect(await avatarMarker()).toBe('none');
  }
});

test('labelled booking status and capture caret remain usable on phone and desktop', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(dialog).toBeVisible();
  const redesigned = (await page.locator('[data-budget-redesign="1"]').count()) > 0;
  await expectVisibleIconScale(page);
  const status = dialog.locator('button.bk-status');
  await expect(status).toHaveAccessibleName('Vorgemerkt');
  await expect(status).toHaveText('Vorgemerkt');
  await expect(status).toHaveAttribute('aria-pressed', 'false');
  await expectStatusContentInsideButton(status, redesigned);
  if (isMobile) {
    const bounds = await status.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
  }
  await status.click();
  await expect(status).toHaveAccessibleName('Bestätigt');
  await expect(status).toHaveText('Bestätigt');
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  await expectStatusContentInsideButton(status, redesigned);
  await status.click();
  await expect(status).toHaveAccessibleName('Vorgemerkt');
  await expect(status).toHaveText('Vorgemerkt');
  await expect(status).toHaveAttribute('aria-pressed', 'false');
  await expectStatusContentInsideButton(status, redesigned);

  const more = dialog.locator('details.kmore');
  const caret = more.locator(redesigned ? '.lucide-ellipsis' : '.disclosure-chevron');
  if (redesigned) await expect(caret).toBeVisible();
  else expect(await caret.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  await more.locator('summary').click();
  await expect(more).toHaveAttribute('open', '');
  if (redesigned) await expect(caret).toBeVisible();
  else expect(await caret.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page }).include('dialog').analyze();
    expect(axe.violations.map((violation) => violation.id)).toEqual([]);
    if (
      (info.project.name === 'desktop' && scheme === 'light') ||
      (info.project.name === 'webkit-iphone' && scheme === 'dark')
    ) {
      await status.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`icons-471-capture-${scheme}.png`),
        fullPage: false,
      });
    }
  }
});

for (const [name, route] of [
  ['plan-month', '/plan/monat?monat=2026-09'],
  ['plan-year', '/plan/jahr?monat=2026-09'],
  ['portfolio', '/vermoegen/portfolio'],
] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${name} icons and page accessibility in ${scheme}`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      await expectVisibleIconScale(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const axe = await new AxeBuilder({ page }).include('main').analyze();
      expect(axe.violations.map((violation) => violation.id)).toEqual([]);
      if (
        (info.project.name === 'desktop' && scheme === 'light') ||
        (info.project.name === 'webkit-iphone' && scheme === 'dark')
      ) {
        await page.screenshot({
          path: info.outputPath(`icons-471-${name}-${scheme}.png`),
          fullPage: true,
        });
      }
    });
  }
}
