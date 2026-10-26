import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, sampleTest as test } from './sample';

async function expectVisibleIconScale(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<SVGSVGElement>('svg.lucide'))
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
            const expected = width === 16 ? 1.75 : 1.5;
            return [16, 20, 24].includes(width) && height === width && stroke === expected
              ? []
              : [
                  `${icon.getAttribute('class')}: ${style.width} × ${style.height}, stroke ${style.strokeWidth}`,
                ];
          }),
      ),
    )
    .toEqual([]);
}

async function expectStatusContentInsideButton(status: Locator) {
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
      dialog: rect(dialog),
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  for (const content of [bounds.icon, bounds.label]) {
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

  await page.locator('.inspector-section > summary').filter({ hasText: '50/30/20' }).click();
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
  await expectVisibleIconScale(page);
  const status = dialog.locator('button.bk-status');
  await expect(status).toHaveAccessibleName('Vorgemerkt');
  await expect(status).toHaveText('Vorgemerkt');
  await expect(status).toHaveAttribute('aria-pressed', 'false');
  await expectStatusContentInsideButton(status);
  if (isMobile) {
    const bounds = await status.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
  }
  await status.click();
  await expect(status).toHaveAccessibleName('Bestätigt');
  await expect(status).toHaveText('Bestätigt');
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  await expectStatusContentInsideButton(status);
  await status.click();
  await expect(status).toHaveAccessibleName('Vorgemerkt');
  await expect(status).toHaveText('Vorgemerkt');
  await expect(status).toHaveAttribute('aria-pressed', 'false');
  await expectStatusContentInsideButton(status);

  const more = dialog.locator('details.kmore');
  const caret = more.locator('.disclosure-chevron');
  expect(await caret.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  await more.locator('summary').click();
  await expect(more).toHaveAttribute('open', '');
  expect(await caret.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
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
