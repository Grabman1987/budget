import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { sampleTest as test, expect } from './sample';

/**
 * Collapsible report sections (#640, split from #552): every framed report section has a
 * disclosure button, the collapsed state is remembered per report, and the page works without
 * storage. One month report (Einnahmen) and one table report (Jahresansicht) on the sample server.
 */
test.describe.configure({ timeout: 90_000 });

const MONTH = '/reports/einnahmen?monat=2026-08';
const TABLE = '/reports/jahresansicht';
const NOTE_FIRST = '/reports/sparquote'; // its main section starts with a note, not the head

const sections = (page: Page) =>
  page.locator('main section:has(> .section-toggle), main section:has(> * > .section-toggle)');
const toggles = (page: Page) => page.locator('main .section-toggle');

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(toggles(page).first()).toBeVisible({ timeout: 20_000 });
}

async function reload(page: Page) {
  await page.reload();
  await expect(toggles(page).first()).toBeVisible({ timeout: 45_000 }); // the ledger read can be slow on a busy machine
}

for (const [label, path] of [
  ['month report Einnahmen', MONTH],
  ['table report Sparquote (note before the head)', NOTE_FIRST],
  ['table report Jahresansicht', TABLE],
] as const) {
  test(`${label}: collapses a section, shows it again and remembers it after a reload`, async ({
    page,
  }) => {
    await open(page, path);
    const first = toggles(page).first();
    // What the first section shows below its heading.
    const body = sections(page)
      .first()
      .locator(':scope > :not([data-section-head], .section-toggle)')
      .locator('visible=true');
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(body).not.toHaveCount(0);

    await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await expect(body).toHaveCount(0);
    // The heading stays; the other sections are untouched.
    await expect(sections(page).first().getByRole('heading').first()).toBeVisible();
    const count = await toggles(page).count();
    for (let i = 1; i < count; i += 1)
      await expect(toggles(page).nth(i)).toHaveAttribute('aria-expanded', 'true');

    await reload(page);
    await expect(toggles(page).first()).toHaveAttribute('aria-expanded', 'false');
    await expect(toggles(page).first()).toBeVisible();
    await expect(body).toHaveCount(0);

    await toggles(page).first().click();
    await expect(toggles(page).first()).toHaveAttribute('aria-expanded', 'true');
    await expect(body).not.toHaveCount(0);
    await reload(page);
    await expect(toggles(page).first()).toHaveAttribute('aria-expanded', 'true');
  });
}

test('the state is kept per report', async ({ page }) => {
  await open(page, MONTH);
  await toggles(page).first().click();
  await open(page, TABLE);
  for (const button of await toggles(page).all())
    await expect(button).toHaveAttribute('aria-expanded', 'true');
});

test('the state is kept per page, not per report: Gehalt and Gehalt-Historie do not collide', async ({
  page,
}) => {
  await open(page, '/reports/gehalt?monat=2026-09');
  await toggles(page).first().click();
  await expect(toggles(page).first()).toHaveAttribute('aria-expanded', 'false');
  await open(page, '/reports/gehalt/historie?monat=2026-09');
  for (const button of await toggles(page).all())
    await expect(button).toHaveAttribute('aria-expanded', 'true');
});

test('a toggle is described by its section heading', async ({ page }) => {
  await open(page, MONTH);
  const heading = await sections(page).first().getByRole('heading').first().innerText();
  await expect(toggles(page).first()).toHaveAccessibleDescription(heading);
});

test('Enter and Space toggle the focused disclosure button', async ({ page }) => {
  await open(page, MONTH);
  const first = toggles(page).first();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-expanded', 'true');
});

test('without storage the report still renders expanded and toggles', async ({ page }) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new Error('storage blocked');
    };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
  });
  await open(page, MONTH);
  for (const button of await toggles(page).all())
    await expect(button).toHaveAttribute('aria-expanded', 'true');
  await toggles(page).first().click();
  await expect(toggles(page).first()).toHaveAttribute('aria-expanded', 'false');
});

test('Axe is clean in light and dark, the toggle is a 44 px target on the phone', async ({
  page,
}, info) => {
  await open(page, MONTH);
  await toggles(page).first().click();
  const phone = (page.viewportSize()?.width ?? 1440) < 768;
  if (phone) {
    const box = await toggles(page).first().boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  // Print shows every section in full and no toggle.
  await page.emulateMedia({ media: 'print' });
  await expect(toggles(page).first()).toBeHidden();
  await expect(
    sections(page)
      .first()
      .locator(':scope > :not([data-section-head], .section-toggle)')
      .locator('visible=true'),
  ).not.toHaveCount(0);
  await page.emulateMedia({ media: 'screen' });
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (scheme === 'light') {
      mkdirSync('docs/evidence/issue-552b-report-sections', { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        path: `docs/evidence/issue-552b-report-sections/${info.project.name}-collapsed.png`,
      });
    }
  }
});
