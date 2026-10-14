import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { sampleTest as test, expect } from './sample';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: contrast roles cover forms, positive fills and tinted metadata`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/?monat=2026-09');
    await expect(page.getByTestId('heute-lead-value')).toBeVisible();
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const ratios = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const rgb = (value: string) => {
        // The browser bundle minifies white to #fff; unit tests read six-digit source tokens.
        const hex =
          value.length === 4
            ? value
                .slice(1)
                .split('')
                .map((v) => v + v)
                .join('')
            : value.slice(1);
        return hex.match(/../g)!.map((v) => parseInt(v, 16));
      };
      const lum = (color: number[]) =>
        color.reduce((sum, channel, i) => {
          const s = channel / 255;
          return (
            sum +
            [0.2126, 0.7152, 0.0722][i]! * (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)
          );
        }, 0);
      const ratio = (a: string, b: string) => {
        const x = lum(rgb(root.getPropertyValue(a).trim()));
        const y = lum(rgb(root.getPropertyValue(b).trim()));
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      return {
        border: ratio('--rule-strong', '--surface'),
        positive: ratio('--good', '--surface'),
        text: ratio('--ink-3', '--surface-2'),
        positiveText: ratio('--on-good', '--good'),
      };
    });
    expect(ratios.border).toBeGreaterThanOrEqual(3);
    expect(ratios.positive).toBeGreaterThanOrEqual(3);
    expect(ratios.text).toBeGreaterThanOrEqual(4.5);
    expect(ratios.positiveText).toBeGreaterThanOrEqual(4.5);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    const dir = 'docs/evidence/contrast-tokens-q1';
    mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: `${dir}/${info.project.name}-${theme}-today.png`,
      animations: 'disabled',
    });
    await page.goto('/konten/buchungen');
    const row = page.locator('.ktable tbody tr[data-booking]').first();
    await expect(row).toBeVisible();
    await row.hover();
    const metadata = await row.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        meta: style.getPropertyValue('--ink-3').trim(),
        stronger: style.getPropertyValue('--ink-2').trim(),
      };
    });
    expect(metadata.meta).toBe(metadata.stronger);
    if (info.project.name === 'desktop') await page.keyboard.press('n');
    else await page.getByRole('link', { name: 'Buchung erfassen', exact: true }).click();
    const form = page.getByRole('dialog');
    await expect(form).toBeVisible();
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const fields = await form.locator('input, select, button').evaluateAll((elements) =>
      elements
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => {
          const box = el.getBoundingClientRect();
          return { width: box.width, height: box.height, type: el.getAttribute('type') };
        }),
    );
    if (info.project.name !== 'desktop')
      expect(fields.filter((field) => field.width < 44 || field.height < 44)).toEqual([]);
    await page.screenshot({
      path: `${dir}/${info.project.name}-${theme}-capture.png`,
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(form).toHaveCount(0);
  });
}
