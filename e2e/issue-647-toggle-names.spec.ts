import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

/**
 * #647 (follow-up of #640): every report section toggle has its own accessible name, the generic
 * action followed by the section title (aria-labelledby), so voice control can tell them apart.
 * One sample report (Einnahmen), Axe clean in light and dark.
 */
test.describe.configure({ timeout: 90_000 });

const MONTH = '/reports/einnahmen?monat=2026-08';
const ACTION = 'Abschnitt ein- oder ausklappen';

test('each section toggle is named by the action and its own section title', async ({
  page,
}, info) => {
  await page.goto(MONTH);
  const toggles = page.locator('main .section-toggle');
  await expect(toggles.first()).toBeVisible({ timeout: 20_000 });
  const count = await toggles.count();
  expect(count).toBeGreaterThan(1);

  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const toggle = toggles.nth(i);
    const title = (
      await toggle.evaluate((el) => {
        const id = el.getAttribute('aria-labelledby')!.split(' ')[1]!;
        return document.getElementById(id)!.innerText;
      })
    ).trim();
    expect(title).not.toBe('');
    await expect(toggle).toHaveAccessibleName(`${ACTION} ${title}`);
    names.push(`${ACTION} ${title}`);
  }
  expect(new Set(names).size, 'the names are pairwise distinct').toBe(count);
  await expect(page.getByRole('button', { name: names[0]!, exact: true })).toHaveCount(1);

  await page.evaluate(() => document.fonts.ready);
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
      `${scheme} ${info.project.name}`,
    ).toEqual([]);
  }
});
