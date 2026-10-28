import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { sampleTest as test, expect } from './sample';

/**
 * Report frame (#552): one period control (segment with step buttons and a range popover) in a
 * 64 px head on desktop, the first section inside the first viewport, trend line as a switch.
 */
test.describe.configure({ timeout: 90_000 });

const SAMPLE = ['ausgaben', 'kategorien', 'cashflow', 'sparquote', 'vermoegen'] as const;
const phone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
const period = (page: Page) => page.getByRole('group', { name: 'Zeitraum', exact: true });
/** Heading of the first report section. */
const firstHeading = (page: Page) =>
  page
    .locator('main section')
    .filter({ has: page.getByRole('heading') })
    .first()
    .getByRole('heading')
    .first();
const rangeButton = (page: Page) => page.getByRole('button', { name: 'Zeitraum wählen' });

for (const id of SAMPLE) {
  test(`${id}: one period control, head of 64 px, first section in the first viewport`, async ({
    page,
  }) => {
    await page.goto(`/reports/${id}`);
    const first = firstHeading(page);
    await expect(first).toBeVisible({ timeout: 30_000 });
    // One control: the preset segment. The dropdown and the trend checkbox are not on the page.
    await expect(period(page)).toHaveCount(1);
    // Canonical Cashflow has its project filter; the category template has its category picker.
    await expect(page.getByRole('combobox')).toHaveCount(
      id === 'cashflow' || id === 'kategorien' ? 1 : 0,
    );
    await expect(page.getByRole('checkbox', { name: 'Trendlinie' })).toHaveCount(0);
    await expect(rangeButton(page)).toBeVisible();
    if (phone(page)) return;
    const head = (await page.locator('.titleblock').first().boundingBox())!;
    expect(head.height).toBe(64);
    const box = (await first.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    // Everything in the head stays inside its frame.
    const fits = await page
      .locator('.titleblock')
      .first()
      .evaluate((header) => {
        const frame = header.getBoundingClientRect();
        return [...header.querySelectorAll<HTMLElement>('h1, p, button, .tb-value')].every(
          (node) => {
            const inner = node.getBoundingClientRect();
            return inner.left >= frame.left - 0.5 && inner.right <= frame.right + 0.5;
          },
        );
      });
    expect(fits).toBe(true);
  });
}

test('presets, step buttons and the range popover work on one control', async ({ page }) => {
  await page.goto('/reports/cashflow');
  await expect(period(page)).toBeVisible();
  await period(page).getByRole('button', { name: '3M', exact: true }).click();
  await expect(period(page).getByRole('button', { name: '3M', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // 3 months ending last month (today is 17.09.2026): one step back moves the whole window.
  await page.getByRole('button', { name: 'Voriger Zeitraum' }).click();
  await expect(page).toHaveURL(/zeitraum=2026-03\.\.2026-05/);
  await page.getByRole('button', { name: 'Nächster Zeitraum' }).click();
  await expect(page).toHaveURL(/zeitraum=2026-06\.\.2026-08/);
  await expect(page.getByRole('button', { name: 'Nächster Zeitraum' })).toBeDisabled();

  // The popover carries the nine calendar ranges, a custom range and the trend switch.
  const button = rangeButton(page);
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const select = page.getByLabel('Zeitraum-Schnellauswahl', { exact: true });
  await expect(select.locator('option')).toHaveCount(9);
  await select.selectOption('custom');
  await page.getByLabel('Von', { exact: true }).fill('2026-01');
  await page.getByLabel('Bis', { exact: true }).fill('2026-04');
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(page).toHaveURL(/zeitraum=2026-01\.\.2026-04/);
  await expect(select).toBeHidden(); // choosing closes the popover

  // Escape closes it and returns the focus; clicking elsewhere closes it too.
  await button.click();
  await expect(select).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(select).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await page.locator('main h2').first().dispatchEvent('pointerdown'); // the popover may cover it
  await expect(select).toBeHidden();

  // The trend line is a switch in the popover and stays after a reload.
  await button.click();
  const trend = page.getByRole('switch', { name: 'Trendlinie' });
  await expect(trend).toHaveAttribute('aria-checked', 'false');
  await trend.click();
  await expect(page).toHaveURL(/trend=true/);
  await page.reload();
  await rangeButton(page).click();
  await expect(page.getByRole('switch', { name: 'Trendlinie' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

for (const id of SAMPLE) {
  test(`${id}: Axe is clean in light and dark, no horizontal scroll, touch targets on the phone`, async ({
    page,
  }, info) => {
    mkdirSync('docs/evidence/issue-552-report-frame', { recursive: true });
    await page.goto(`/reports/${id}`);
    await expect(firstHeading(page)).toBeVisible({ timeout: 30_000 });
    if (phone(page)) {
      for (const button of await page.locator('.titleblock').first().getByRole('button').all()) {
        const box = (await button.boundingBox())!;
        const name = (await button.getAttribute('aria-label')) ?? (await button.innerText());
        expect(box.width, `${id} ${name}`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${id} ${name}`).toBeGreaterThanOrEqual(44);
      }
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      animations: 'disabled',
      clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 360 },
      path: `docs/evidence/issue-552-report-frame/${info.project.name}-${id}-head.png`,
    });
    await rangeButton(page).click();
    await expect(page.getByLabel('Zeitraum-Schnellauswahl', { exact: true })).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('main')
        .analyze();
      expect(
        result.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
        ),
        `${id} ${scheme} ${info.project.name}`,
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (id === 'cashflow')
        await page.screenshot({
          animations: 'disabled',
          path: `docs/evidence/issue-552-report-frame/${info.project.name}-${scheme}-popover.png`,
        });
    }
  });
}

// Reports with their own control in the head (plain Segmented, calendar select): the 64 px rule
// must neither squeeze nor clip it, and the page must not scroll sideways.
for (const id of ['projekte', 'finanzcheck', 'jahresansicht', 'gesamtuebersicht'] as const) {
  test(`${id}: its own head control keeps its width`, async ({ page }) => {
    test.skip(phone(page), 'desktop head layout');
    await page.goto(`/reports/${id}`);
    await expect(page.locator('.titleblock .tb-field').first()).toBeVisible({ timeout: 30_000 });
    const squeezed = await page
      .locator('.titleblock .tb-field')
      .evaluateAll((cells) =>
        cells
          .filter((cell) => cell.querySelector('.seg, select'))
          .filter((cell) => cell.scrollWidth > cell.clientWidth + 1),
      );
    expect(squeezed).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
