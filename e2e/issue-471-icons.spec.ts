import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';

test('icon sizes, swatches and disclosure carets use their rendered styles', async ({ page }) => {
  await page.goto('/plan/monat?monat=2026-09');
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
  const returnSummary = page.getByTestId('portfolio-return');
  await expect(returnSummary.locator('svg.lucide-info')).toBeVisible();
  expect(await returnSummary.evaluate((el) => getComputedStyle(el, '::before').maskImage)).not.toBe(
    'none',
  );
});

test('labelled booking status and capture caret remain usable on phone and desktop', async ({
  page,
  isMobile,
}) => {
  await page.goto('/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(dialog).toBeVisible();
  const status = dialog.getByRole('button', { name: 'Vorgemerkt', exact: true });
  await expect(status).toHaveText('Vorgemerkt');
  await expect(status).toHaveAttribute('aria-pressed', 'false');
  if (isMobile) {
    const bounds = await status.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
  }
  await status.click();
  await expect(status).toHaveText('Bestätigt');
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  await status.click();
  await expect(status).toHaveAttribute('aria-pressed', 'false');

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
  }
});
