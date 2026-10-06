import { RULE_CODES, DEFAULT_ACTIVE_RULE_COUNT, CHECKLIST_DEFS } from '@budget/domain';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { SAMPLE_URL, sampleTest as test, expect as baseExpect } from './sample';
import type { RuleBook } from '../apps/web/src/rules/api';
import { expectScreenshot } from './visual';

/**
 * Einstellungen › Regelwerk on the seeded sample server (17.09.2026). The sample server is shared by
 * every spec and both viewports, so the write test runs once (desktop) and undoes what it writes.
 */

// Both viewport projects run in parallel against the one sample server, and some tests here write
// (and undo) the rule book that the others read and compare as screenshots. A directory is the lock
// (mkdir is atomic): the tests of this file run one after the other across both projects.
const LOCK = 'test-results/.rules-spec-lock';
test.beforeEach(async () => {
  // Waiting for the lock counts against the test's time.
  test.setTimeout(240_000);
  mkdirSync('test-results', { recursive: true });
  for (;;) {
    try {
      mkdirSync(LOCK);
      return;
    } catch {
      // A lock left behind by a crashed worker expires after two minutes.
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 120_000) rmSync(LOCK, { recursive: true });
      } catch {
        /* released meanwhile */
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
});
test.afterEach(async ({ page }) => {
  // A failed write test must not leave the shared rule book changed.
  const patch = (path: string, data: object) =>
    page.request.patch(`/api/rules/${path}`, { data, headers: { origin: SAMPLE_URL } });
  try {
    await patch('R17', { enabled: false, params: { targetBp: 2500 } });
    await patch('R15', { enabled: true });
    await patch('R02', { params: { minMonths: 3 } });
    await patch('checklist/S1-1', { confirmed: false });
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
});

// A loaded machine answers slowly; the rule book is derived from the whole ledger.
const expect = baseExpect.configure({ timeout: 15_000 });

const toast = (page: Page) => page.locator('.toast.is-open');
const violations = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));

interface Check {
  counts: { ok: number; warn: number; bad: number; total: number };
  stage: { stage: number };
}

test('violations lead with values, thresholds and correction links; disabled rules are collapsed', async ({
  page,
}) => {
  await page.goto('/einstellungen/regelwerk');
  const r02 = page.locator('#rw-violated').locator('..').locator('[data-rule-code="R02"]');
  await expect(r02).toContainText('Ist: 2,5 Monate');
  await expect(r02).toContainText('Schwelle: min. 3, Ziel 6 Monate');
  const book = (await (await page.request.get('/api/rules')).json()) as RuleBook;
  for (const rule of book.rules) {
    const row = page.locator(`[data-rule-code="${rule.code}"]`);
    if (!rule.enabled) {
      await expect(
        page.locator('.rw-disabled').locator(`[data-rule-code="${rule.code}"]`),
      ).toHaveCount(1);
      await expect(row).toBeHidden();
      continue;
    }
    const group =
      rule.latest?.status === 'bad' ? 'violated' : rule.latest?.status === 'ok' ? 'met' : 'pending';
    await expect(
      page.locator(`#rw-${group}`).locator('..').locator(`[data-rule-code="${rule.code}"]`),
    ).toHaveCount(1);
    if (rule.latest?.status === 'bad') {
      await expect(row).toContainText(`Ist: ${rule.latest.valueText}`);
      await expect(row.getByRole('link')).toBeVisible();
      await expect(row).toContainText('Schwelle:');
    }
  }
  await expect(page.locator('.rw-disabled')).not.toHaveAttribute('open');
  await expect(page.locator('.rw-sec').first()).toHaveAttribute('aria-labelledby', 'rl-title');
  const fix = r02.getByRole('link', { name: 'Im Plan aufstocken' });
  await expect(fix).toHaveAttribute('href', '/plan/monat');
  await fix.click();
  await expect(page).toHaveURL(/\/plan\/monat/);
  await page.goBack();
  await expect(r02).toBeVisible();
  const summary = page.locator('.rw-disabled > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('switch', { name: /^R17 / })).toBeVisible();
  await expect(page.locator('.rw-disabled')).toHaveAttribute('open', '');
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
});

test('stages and rules show the rule book, axe clean in both themes', async ({ page }, info) => {
  await page.goto('/einstellungen/regelwerk');
  await expect(page.getByRole('heading', { name: 'Stufen', level: 2 })).toBeVisible();
  await expect(page.getByText('aktuell Stufe 2 · automatisch nach Nettovermögen')).toBeVisible();
  await expect(
    page.getByText(`${DEFAULT_ACTIVE_RULE_COUNT} von ${RULE_CODES.length} aktiv`),
  ).toBeVisible();
  // Three stage columns, current one marked; counts follow the registered definitions.
  await expect(page.locator('.rw-stage')).toHaveCount(3);
  await expect(page.locator('.rw-stage.is-cur')).toContainText('Aufbau');
  await expect(page.locator('.rw-stage li')).toHaveCount(CHECKLIST_DEFS.length);
  await expect(page.locator('.rw-rules > li')).toHaveCount(RULE_CODES.length);
  for (const code of RULE_CODES) {
    const row = page.locator(`[data-rule-code="${code}"]`);
    await expect(row.locator('.rw-pos')).toHaveText(code);
    await expect(row.locator('.rw-explanation')).not.toBeEmpty();
  }
  await expect(page.locator('.rw-stage .rw-pos', { hasText: 'S1-1' })).toHaveText('S1-1');
  await expect(page.locator('.rw-stage .rw-pos', { hasText: 'S1-2' })).toHaveText('S1-2');
  await expect(page.locator('.rw-rules > li', { hasText: 'R02' })).toContainText(
    'min. 3, Ziel 6 Monate',
  );
  // Items the app cannot compute carry a confirmation; items of a rule do not.
  await expect(page.getByRole('checkbox', { name: 'erledigt' })).toHaveCount(
    CHECKLIST_DEFS.filter((c) => c.ruleCode === null).length,
  );

  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  expect(await violations(page), 'light').toEqual([]);
  await expectScreenshot(page, 'regelwerk-light.png', { fullPage: true });
  if (process.platform !== 'linux')
    await page.screenshot({ path: info.outputPath('regelwerk-light-viewport.png') });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  expect(await violations(page), 'dark').toEqual([]);
  await expectScreenshot(page, 'regelwerk-dark.png', { fullPage: true });
  if (process.platform !== 'linux')
    await page.screenshot({ path: info.outputPath('regelwerk-dark-viewport.png') });
});

test('the threshold panel shows status and next step and is axe clean', async ({ page }) => {
  await page.goto('/einstellungen/regelwerk');
  const opener = page.getByRole('button', { name: 'Einstellen R02 Notgroschen' });
  await opener.click();
  const panel = page.getByRole('dialog', { name: 'R02 Notgroschen' });
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveClass(/\bpanel\b/);
  await expect(panel).toContainText('2,5 Monate');
  await expect(panel).toContainText('verletzt');
  await expect(panel).toContainText('Nächster Schritt');
  await expect(panel.getByLabel('Mindestens')).toHaveValue('3');
  await expect(panel.getByLabel('Ziel')).toHaveValue('6');
  expect(await violations(page), 'panel').toEqual([]);
  // A value outside the range is refused before anything is sent.
  await panel.getByLabel('Mindestens').fill('5000');
  await expect(panel.getByRole('alert')).toContainText('Zwischen 0 und 1200');
  await expect(panel.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(opener).toBeFocused();
});

test('phone: switches and buttons are 44 px targets', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'phone layout only');
  await page.goto('/einstellungen/regelwerk');
  await expect(
    page.getByText(`${DEFAULT_ACTIVE_RULE_COUNT} von ${RULE_CODES.length} aktiv`),
  ).toBeVisible();
  await page.locator('.rw-disabled > summary').click();
  const heights = await page
    .locator('.rw-rules .switch, .rw-rules .btn, .rw-stage .switch')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(40);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(43.5);
  // Stage blocks are stacked.
  const tops = await page
    .locator('.rw-stage')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(tops[0]).toBeLessThan(tops[1]!);
  expect(tops[1]).toBeLessThan(tops[2]!);
});

test('R15 off changes the Finanz-Check counts, R02 minimum 3 → 2 flips its status, both undone', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'writes to the shared sample server once');
  const check = async () =>
    (await (await page.request.get('/api/rules/check', { maxRetries: 2 })).json()) as Check;
  const before = await check();
  await page.goto('/einstellungen/regelwerk');
  await expect(
    page.getByText(`${DEFAULT_ACTIVE_RULE_COUNT} von ${RULE_CODES.length} aktiv`),
  ).toBeVisible();

  // R15 (Spekulativer Anteil, verletzt in the sample) off: one rule less in the Finanz-Check.
  const r15 = page.getByRole('switch', { name: 'R15 Spekulativer Anteil', includeHidden: true });
  await expect(r15).toBeChecked();
  await r15.click();
  await expect(toast(page)).toContainText('R15 Spekulativer Anteil: aus');
  await expect(r15).not.toBeChecked();
  await expect(page.locator('.rw-disabled [data-rule-code="R15"]')).toHaveCount(1);
  await expect(
    page.getByText(`${DEFAULT_ACTIVE_RULE_COUNT - 1} von ${RULE_CODES.length} aktiv`),
  ).toBeVisible();
  const off = await check();
  expect(off.counts.total).toBe(before.counts.total - 1);
  expect(off.counts.bad).toBe(before.counts.bad - 1);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(r15).toBeChecked();
  await expect(
    page.getByText(`${DEFAULT_ACTIVE_RULE_COUNT} von ${RULE_CODES.length} aktiv`),
  ).toBeVisible();
  expect(await check()).toEqual(before);

  // R02: minimum from 3 to 2 months turns "verletzt" into "Warnung".
  await page.getByRole('button', { name: 'Einstellen R02 Notgroschen' }).click();
  const panel = page.getByRole('dialog', { name: 'R02 Notgroschen' });
  await expect(panel).toContainText('verletzt');
  await panel.getByLabel('Mindestens').fill('2');
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(toast(page)).toContainText('R02 Notgroschen: Schwelle gespeichert.');
  await expect(panel).toContainText('Warnung');
  await expect(
    page.locator('#rw-pending').locator('..').locator('[data-rule-code="R02"]'),
  ).toHaveCount(1);
  await expect(panel.getByLabel('Mindestens')).toHaveValue('2');
  const flipped = await check();
  expect(flipped.counts.bad).toBe(before.counts.bad - 1);
  expect(flipped.counts.warn).toBe(before.counts.warn + 1);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(panel).toContainText('verletzt');
  await expect(
    page.locator('#rw-violated').locator('..').locator('[data-rule-code="R02"]'),
  ).toHaveCount(1);
  await expect(panel.getByLabel('Mindestens')).toHaveValue('3');
  expect(await check()).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Einstellen R02 Notgroschen' })).toBeFocused();
  await expect(page.locator('.rw-rules > li', { hasText: 'R02' })).toContainText(
    'min. 3, Ziel 6 Monate',
  );
});

test('an item the app cannot compute is confirmed and reopened by the owner', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'writes to the shared sample server once');
  const checklist = async () =>
    (
      (await (await page.request.get('/api/rules/check', { maxRetries: 2 })).json()) as {
        checklist: { done: number };
      }
    ).checklist.done;
  const before = await checklist();
  await page.goto('/einstellungen/regelwerk');
  const box = page.getByRole('checkbox', { name: 'erledigt' }).first();
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(toast(page)).toContainText('erledigt');
  await expect(box).toBeChecked();
  expect(await checklist()).toBe(before + 1);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(box).not.toBeChecked();
  expect(await checklist()).toBe(before);
});

test('book rules start disabled, toggle and threshold edit are undoable', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'shared sample writes once');
  await page.goto('/einstellungen/regelwerk');
  await page.locator('.rw-disabled > summary').click();
  const row = page.locator('.rw-rules > li').filter({ hasText: 'R17' });
  const toggle = row.getByRole('switch');
  await expect(toggle).not.toBeChecked();
  for (const code of ['R17', 'R18', 'R19', 'R20', 'R21', 'R22'])
    await expect(page.locator('.rw-rules > li').filter({ hasText: code })).toBeVisible();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(
    page.getByText(`${DEFAULT_ACTIVE_RULE_COUNT + 1} von ${RULE_CODES.length} aktiv`),
  ).toBeVisible();
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(toggle).not.toBeChecked();
  await row.getByRole('button', { name: /Einstellen/ }).click();
  const panel = page.getByRole('dialog', { name: /^R17 / });
  await panel.getByLabel('Ziel Bruttoquote').fill('26');
  await panel.getByRole('button', { name: 'Speichern' }).click();
  await expect(panel.getByLabel('Ziel Bruttoquote')).toHaveValue('26');
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(panel.getByLabel('Ziel Bruttoquote')).toHaveValue('25');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Geburtsmonat und Jahr')).toHaveValue('');

  // Saving and undoing private inputs must refresh the form as well as the stored rows.
  const inputs = page.locator('section', {
    has: page.getByRole('heading', { name: 'Daten für die Buchregeln' }),
  });
  const before = await (await page.request.get('/api/rules/inputs')).json();
  await inputs.getByLabel('Beitragsmonat', { exact: true }).fill('2026-08');
  await inputs.getByLabel('Arbeitgeberbeitrag Pensionskasse', { exact: true }).fill('23');
  await inputs.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(inputs.getByRole('table')).toContainText('23,00');
  await expect(inputs.getByLabel('Beitragsmonat', { exact: true })).toHaveValue('');
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(inputs.getByRole('table')).toHaveCount(0);
  await expect(inputs.getByLabel('Arbeitgeberbeitrag Pensionskasse', { exact: true })).toHaveValue(
    '',
  );
  expect(await (await page.request.get('/api/rules/inputs')).json()).toEqual(before);
});
