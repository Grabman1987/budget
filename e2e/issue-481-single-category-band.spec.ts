import AxeBuilder from '@axe-core/playwright';
import { expect, type Browser, type Page } from '@playwright/test';
import { sampleTest, SAMPLE_NOW, SAMPLE_URL } from './sample';
import { STORAGE_STATE_SAMPLE } from '../playwright.config';
import { test } from './isolated-ledger';
import { writeFileSync } from 'node:fs';
import { cents, formatEuro } from '@budget/domain';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';

/** Phone-only equivalents for the owner-approved explicit selection controls. */
async function enterPhoneSelection(page: Page) {
  const options = page.locator('details.plan-menu').filter({
    has: page.locator('summary', { hasText: 'Optionen' }),
  });
  await options.locator('summary').click();
  await options.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Kategorienauswahl', exact: true })).toBeVisible();
}
async function exitPhoneSelection(page: Page) {
  const bar = page.getByRole('region', { name: 'Kategorienauswahl', exact: true });
  await bar.getByRole('button', { name: 'Auswahl beenden', exact: true }).click();
  await expect(bar).toHaveCount(0);
}
async function expectPhoneSelectionTargets(page: Page) {
  const categories = page.locator('.ptable .pname:visible');
  const toggles = page.locator('.ptable .plan-select-toggle:visible');
  expect(await categories.count()).toBeGreaterThan(0);
  const headings = page.locator('.ptable .group-heading:visible');
  expect(await headings.count()).toBeGreaterThan(0);
  await expect(toggles).toHaveCount(await headings.count());
  for (const heading of await headings.all())
    await expect(heading.locator('.plan-select-toggle')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: /^Alle Kategorien auswählen · \d+\/\d+$/ }),
  ).toHaveCount(1);
  for (const controls of [categories, toggles]) {
    for (let index = 0; index < (await controls.count()); index++) {
      const bounds = (await controls.nth(index).boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
  }
}

/** Measure the separate parent and first category at their original compact limits. */
async function expectCompactBandContents(page: Page, phone: boolean) {
  const bands = await page.locator('.ptable-zero .pgroup:not(.psingle)').evaluateAll((rows) =>
    rows.map((row) => {
      const child = row.nextElementSibling!;
      if (!child.matches('.prow:not(.psingle)')) throw new Error('Missing separate first category');
      const boxes = (selector: string, scope: Element = child) =>
        Array.from(scope.querySelectorAll(selector), (element) =>
          element.getBoundingClientRect(),
        ).filter((box) => box.width > 0 && box.height > 0);
      const category = boxes(
        '.col-name > .plan-select, .pname, .spending-status, .spending-bar, .col-assign, .col-act, .col-avail',
      );
      const parent = boxes('.group-heading, .col-num', row);
      // Financial controls can protrude beyond their inline wrapper's line box.
      const categoryControls = boxes(
        '.col-assign :is(button, input, label), .col-avail :is(button, input, label), .spending-bar .pbar-tick',
      );
      const parentControls = boxes('.group-heading :is(button, input, label)', row);
      const height = (items: DOMRect[]) =>
        Math.max(...items.map((box) => box.bottom)) - Math.min(...items.map((box) => box.top));
      const name = child.querySelector('.pname')!.getBoundingClientRect();
      const status = child.querySelector('.spending-status')!.getBoundingClientRect();
      return {
        id: row.id,
        categoryCount: category.length,
        parentCount: parent.length,
        categoryHeight: height([...category, ...categoryControls]),
        parentHeight: height([...parent, ...parentControls]),
        wholeHeight: child.getBoundingClientRect().bottom - row.getBoundingClientRect().top,
        parentBottom: row.getBoundingClientRect().bottom,
        childTop: child.getBoundingClientRect().top,
        nameRight: name.right,
        statusLeft: status.left,
      };
    }),
  );
  expect(bands.length).toBeGreaterThan(0);
  for (const band of bands) {
    expect(band.categoryCount, band.id).toBe(phone ? 5 : 7);
    expect(band.parentCount, band.id).toBe(4);
    expect(band.parentBottom, band.id).toBeLessThanOrEqual(band.childTop);
    expect(band.categoryHeight, JSON.stringify(band)).toBeLessThanOrEqual(phone ? 76 : 40);
    expect(band.parentHeight, JSON.stringify(band)).toBeLessThanOrEqual(phone ? 76 : 36);
    expect(band.wholeHeight, JSON.stringify(band)).toBeLessThanOrEqual(phone ? 152 : 76);
    if (!phone) expect(band.nameRight, band.id).toBeLessThanOrEqual(band.statusLeft);
  }
}

/** Check actual on-screen inherited ink, which full-page Axe can miss off viewport. */
async function expectOnscreenParentInk(page: Page, selectedIndices?: readonly number[]) {
  const bands = page.locator('.ptable-zero .pgroup:not(.psingle)');
  const results = [];
  const indices =
    selectedIndices ?? Array.from({ length: await bands.count() }, (_, index) => index);
  for (const index of indices) {
    const band = bands.nth(index);
    const toggle = band.locator('.grp-toggle');
    await toggle.evaluate((element) =>
      element.scrollIntoView({ behavior: 'instant', block: 'center' }),
    );
    await expect(toggle).toBeInViewport({ ratio: 1 });
    const ink = await page.evaluate(() => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue('--ink')
        .trim()
        .slice(1);
      const hex = value.length === 3 ? Array.from(value, (digit) => digit + digit).join('') : value;
      return `rgb(${[0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
    });
    await expect(toggle).toHaveCSS('color', ink);
    await expect(toggle.locator('.grp-title')).toHaveCSS('color', ink);
    await expect(toggle.locator('svg')).toHaveCSS('color', ink);
    const id = await band.getAttribute('id');
    const axe = await new AxeBuilder({ page }).include(`[id="${id}"]`).analyze();
    expect(axe.violations, id!).toEqual([]);
    const incomplete = axe.incomplete.filter((rule) => rule.id === 'color-contrast');
    const reasons = incomplete.flatMap((rule) =>
      rule.nodes.flatMap((node) =>
        [...node.any, ...node.all, ...node.none].map((check) => ({
          message: check.message,
          key: (check.data as { messageKey?: string } | null)?.messageKey,
        })),
      ),
    );
    const coverage = {
      passed: axe.passes.some((rule) => rule.id === 'color-contrast'),
      incomplete: incomplete.length,
      inapplicable: axe.inapplicable.some((rule) => rule.id === 'color-contrast'),
      reasons,
    };
    // Axe cannot resolve the background behind .main's pseudo element here.
    // Record that real limitation; unknown incomplete reasons still fail closed.
    if (coverage.incomplete > 0) {
      expect(reasons.length, id!).toBeGreaterThan(0);
      expect(
        reasons.every((reason) => reason.key === 'pseudoContent'),
        id!,
      ).toBe(true);
    }
    expect(coverage.passed || reasons.length > 0, id!).toBe(true);
    const contrast = await toggle.evaluate((button) => {
      const channels = (value: string) => {
        const match = value.match(
          /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
        );
        if (!match) throw new Error(`Unknown computed color: ${value}`);
        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        if (alpha === 0) return null;
        if (alpha !== 1) throw new Error(`Non-opaque computed color: ${value}`);
        const rgb = match.slice(1, 4).map(Number);
        if (rgb.some((value) => !Number.isFinite(value) || value < 0 || value > 255))
          throw new Error(`Invalid computed color: ${value}`);
        return rgb;
      };
      // WCAG relative luminance in sRGB; no rounded ratios or tolerance adjustment.
      const luminance = (rgb: number[]) =>
        rgb
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index]!, 0);
      return [button, button.querySelector('.grp-title')!, button.querySelector('svg')!].map(
        (element) => {
          const foreground = channels(getComputedStyle(element).color);
          if (!foreground) throw new Error('Transparent parent foreground');
          let background: number[] | null = null;
          let backgroundCss = '';
          for (
            let ancestor: Element | null = element;
            ancestor;
            ancestor = ancestor.parentElement
          ) {
            const style = getComputedStyle(ancestor);
            if (Number(style.opacity) !== 1)
              throw new Error(`Non-opaque parent ancestor: ${ancestor.className}`);
            backgroundCss = style.backgroundColor;
            background = channels(backgroundCss);
            if (background) break;
          }
          if (!background) throw new Error('No opaque painted ancestor for parent');
          const a = luminance(foreground),
            b = luminance(background);
          return {
            element: element.tagName,
            foreground: getComputedStyle(element).color,
            background: backgroundCss,
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          };
        },
      );
    });
    for (const value of contrast)
      expect(value.ratio, JSON.stringify({ id, ...value })).toBeGreaterThanOrEqual(4.5);
    results.push({ id, ink, contrast, axeColorContrast: coverage });
  }
  return results;
}

async function resetCaptureScroll(page: Page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
}

sampleTest(
  'sample ledger: separate group headings, current-baseline reduction and visual/accessibility evidence',
  async ({ page, browser }, info) => {
    sampleTest.setTimeout(90_000);
    await page.goto('/plan/monat?monat=2026-09');
    const response = await page.request.get('/api/budget/2026-09');
    expect(response.ok()).toBe(true);
    const data = (await response.json()) as BudgetMonthView;
    const visible = data.categories.filter((c: { hiddenAt: string | null }) => !c.hiddenAt);
    const singles = data.groups.filter(
      (g: { id: string }) =>
        visible.filter((c: { groupId: string }) => c.groupId === g.id).length === 1,
    );
    const bandGroups = data.groups.filter((g) => visible.some((c) => c.groupId === g.id));
    const multiple = bandGroups.filter((g) => !singles.includes(g));
    const table = page.locator('.ptable-zero');
    await expect(table.locator('.psingle')).toHaveCount(singles.length);
    await expect(table.locator('.pgroup:not(.psingle)')).toHaveCount(multiple.length);
    await expect(table.locator('.prow:not(.is-empty)')).toHaveCount(visible.length);
    await page.evaluate(() => document.fonts.ready);
    await expectCompactBandContents(page, page.viewportSize()!.width < 768);
    expect(singles).toHaveLength(11);
    const oldRows = data.groups.length + visible.length;
    const newRows = oldRows - singles.length;
    await expect(table.locator('tbody > tr:not(.pgroup-gap)')).toHaveCount(newRows);
    const measurements = {
      groups: data.groups.length,
      categories: visible.length,
      singles: singles.length,
      combinedGroups: singles.length,
      separateMultiParents: multiple.length,
      oldRows,
      newRows,
      reductionPercent: (100 * (oldRows - newRows)) / oldRows,
      browserVersion: browser.version(),
      viewport: page.viewportSize(),
      physicalTableHeightPx: (await table.boundingBox())!.height,
    };
    expect(oldRows).toBe(55);
    expect(newRows).toBe(44);
    expect(measurements.reductionPercent).toBe(20);
    writeFileSync(
      info.outputPath(`${info.project.name}-rows.json`),
      JSON.stringify(measurements, null, 2) + '\n',
    );
    await info.attach('sample-row-reduction', {
      body: JSON.stringify(measurements, null, 2),
      contentType: 'application/json',
    });
    for (const group of singles) {
      const band = page.locator(`[id="grp-${group.id}"]`);
      await expect(band).toHaveClass(/psingle/);
      await expect(band.locator('.pname')).toContainText(group.name);
      await expect(band.locator('.spending-status')).not.toBeEmpty();
      await expect(band.locator('.spending-bar')).toHaveCount(1);
      const bounds = await band.evaluate((row) => ({
        bottom: row.getBoundingClientRect().bottom,
        barBottom: row.querySelector('.spending-bar')!.getBoundingClientRect().bottom,
      }));
      expect(bounds.barBottom).toBeLessThanOrEqual(bounds.bottom);
      await expect(band.locator('.col-avail .pill')).toHaveCount(1);
      await expect(
        band.getByRole('button', { name: `Kategorie in ${group.name} anlegen`, exact: true }),
      ).toHaveCount(1);
    }
    for (const group of multiple) {
      const band = page.locator(`[id="grp-${group.id}"]`);
      await expect(band.locator('.grp-toggle')).toHaveAccessibleName(`Gruppe ${group.name}`);
      const categories = visible.filter((category) => category.groupId === group.id);
      const summaries = data.summary.envelopes.filter((value) =>
        categories.some((category) => category.id === value.categoryId),
      );
      const totals = band.locator('.col-num');
      await expect(totals).toHaveCount(3);
      const expected = ['assignedCents', 'activityCents', 'availableCents'] as const;
      for (const [index, key] of expected.entries()) {
        const value = summaries.reduce((sum, row) => sum + row[key], 0);
        await expect(totals.nth(index)).toContainText(formatEuro(cents(value)));
      }
      await expect(band.locator('.pname')).toHaveCount(0);
      const firstChild = band.locator('xpath=following-sibling::tr[1]');
      await expect(firstChild).toHaveClass(/prow/);
      await expect(firstChild.locator('.pname')).toHaveCount(1);
      await expect(firstChild.locator('.spending-status')).not.toBeEmpty();
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      const parentInk = await expectOnscreenParentInk(page);
      await info.attach(`parent-ink-${theme}`, {
        body: JSON.stringify(parentInk),
        contentType: 'application/json',
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      if (info.project.name !== 'desktop') {
        const targets = await table
          .locator('.psingle button, .psingle .plan-select')
          .evaluateAll((elements) =>
            elements
              .filter((e) => e.getBoundingClientRect().height > 0)
              .map((e) => ({
                text: e.textContent,
                width: e.getBoundingClientRect().width,
                height: e.getBoundingClientRect().height,
              })),
          );
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.filter((t) => t.width < 44 || t.height < 44)).toEqual([]);
        await enterPhoneSelection(page);
        await expectPhoneSelectionTargets(page);
        await exitPhoneSelection(page);
      }
      await resetCaptureScroll(page);
      await page.screenshot({ path: info.outputPath(`sample-${theme}.png`), fullPage: true });
      if (
        (info.project.name === 'desktop' && theme === 'light') ||
        (info.project.name !== 'desktop' && theme === 'dark')
      ) {
        await page.screenshot({
          path: info.outputPath(`${info.project.name}-${theme}.png`),
          fullPage: true,
        });
      }
    }
  },
);

test('band selection, shortcuts, cent writes/undo and transition to two categories', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  const month = '2026-10';
  const send = async (method: string, path: string, data: unknown) => {
    const response = await page.request.fetch(`/api${path}`, {
      method,
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await send('POST', '/accounts', {
    name: 'Musterkonto',
    type: 'checking',
    openingDate: `${month}-01`,
    openingBalanceCents: 100_000,
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Musterband' });
  const { category } = await send('POST', '/categories', {
    name: 'Musterposten',
    groupId: group.id,
    class: 'need',
    stage: 2,
    target: { validFrom: month, target: { kind: 'monthly', amountCents: 10_001 } },
  });
  const { group: reserveGroup } = await send('POST', '/categories/groups', {
    name: 'Musterreserve',
  });
  const { category: reserve } = await send('POST', '/categories', {
    name: 'Reserve',
    groupId: reserveGroup.id,
    class: 'want',
  });
  await page.goto(`/plan/monat?monat=${month}`);
  const band = page.locator(`[id="grp-${group.id}"]`);
  await expect(band).toHaveClass(/psingle/);
  const name = band.locator('.pname');
  await expect(name).toHaveAccessibleName('Musterband · Musterposten');
  const inspector = page.getByRole('complementary', { name: 'Plan-Inspektor' });
  await name.focus();
  await page.keyboard.press('Enter');
  await expect(inspector.getByRole('heading', { name: 'Musterposten' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(name).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(band.getByRole('button', { name: 'Kategorie in Musterband anlegen' })).toBeFocused();
  await page.keyboard.press('c');
  const dialog = page.getByRole('dialog', { name: 'Kategorie anlegen', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill('cg');
  await expect(page.getByRole('dialog', { name: 'Gruppe anlegen' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await name.focus();
  await page.keyboard.press('g');
  await expect(page.getByRole('dialog', { name: 'Gruppe anlegen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Alle einklappen', exact: true }).click();
  await expect(name).toBeVisible();
  if (page.viewportSize()!.width < 768) {
    await enterPhoneSelection(page);
    await name.click();
    await expect(page.locator(`.pname[data-category-id="${category.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  } else {
    await page.getByRole('checkbox', { name: 'Musterposten auswählen', exact: true }).check();
  }
  await expect(name).toHaveAttribute('aria-pressed', 'true');
  if (page.viewportSize()!.width < 768) {
    await expect(
      page.getByRole('button', { name: /^Alle Kategorien auswählen · \d+\/\d+$/ }),
    ).toHaveAttribute('aria-pressed', 'mixed');
    await expectPhoneSelectionTargets(page);
    await exitPhoneSelection(page);
  } else {
    await expect(
      page.getByRole('checkbox', { name: 'Alle Kategorien auswählen', exact: true }),
    ).toHaveJSProperty('indeterminate', true);
  }
  await band.locator('.spending-status').click();
  await expect(inspector.getByRole('heading', { name: 'Musterposten' })).toBeVisible();
  const writes: { path: string; body: unknown }[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && /\/api\/budget\//.test(r.url()))
      writes.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() });
  });
  const assigned = band.locator(
    info.project.name === 'desktop' ? '.assign-btn' : '.phone-assigned',
  );
  const toast = page.locator('.toast.is-open');
  await inspector.getByLabel('Zugewiesen', { exact: true }).fill('1000,01');
  await inspector.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await expect(inspector.getByText(/Höchstens 1\.000,00 € zuweisen\./)).toBeVisible();
  expect(writes).toEqual([]);
  await inspector.getByLabel('Zugewiesen', { exact: true }).fill('10+0,01');
  await inspector.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  expect(writes[0]).toEqual({
    path: `/api/budget/${month}/assigned`,
    body: { items: [{ categoryId: category.id, assignedCents: 1001 }] },
  });
  await expect(assigned).toContainText('10,01 €');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned).toContainText('100,01 €');
  await inspector.getByRole('button', { name: 'Ziel', exact: true }).click();
  await expect(assigned).toHaveText(
    info.project.name === 'desktop' ? '100,01 €' : 'Zugewiesen 100,01 €',
  );
  expect(writes[1]).toEqual({
    path: `/api/budget/${month}/quick-assign`,
    body: { mode: 'target', categoryIds: [category.id] },
  });
  await inspector.getByText('Geld verschieben', { selector: 'summary' }).click();
  await inspector.getByLabel('Nach', { exact: true }).selectOption(reserve.id);
  await inspector.getByLabel('Betrag', { exact: true }).fill('0,01');
  await inspector.getByRole('button', { name: 'Verschieben', exact: true }).click();
  expect(writes[2]).toEqual({
    path: `/api/budget/${month}/move`,
    body: { fromId: category.id, toId: reserve.id, amountCents: 1 },
  });
  await expect(assigned).toContainText('100,00 €');
  await expect(toast).toContainText('verschoben');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned).toContainText('100,01 €');
  // Overspending uses the same cover endpoint; no row-specific mutation implementation.
  await send('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    categoryId: category.id,
    date: `${month}-02`,
    amountCents: -10_002,
  });
  await page.reload();
  await expect(band).toHaveClass(/is-over/);
  await band.getByRole('button', { name: 'Musterposten decken' }).click();
  await inspector.getByRole('button', { name: 'Decken · 0,01 €', exact: true }).click();
  expect(writes[3]).toEqual({
    path: `/api/budget/${month}/cover`,
    body: { categoryId: category.id, fromId: null },
  });
  await expect(band).not.toHaveClass(/is-over/);
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(band).toHaveClass(/is-over/);
  await page.keyboard.press('Escape');
  await band.getByRole('button', { name: 'Kategorie in Musterband anlegen', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Gruppe', { exact: true })).toHaveValue(group.id);
  await dialog.getByLabel('Name', { exact: true }).fill('Zweiter Musterposten');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(band).toHaveClass(/pgroup/);
  await expect(band).not.toHaveClass(/psingle/);
  await expect(band.locator('.pname')).toHaveCount(0);
  await expect(band.locator('.grp-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.prow', { hasText: 'Zweiter Musterposten' })).toHaveCount(1);
  await expect(page.locator('.prow', { hasText: 'Musterposten' })).toHaveCount(2);
  const expandedData = (await (
    await page.request.get(`/api/budget/${month}`)
  ).json()) as BudgetMonthView;
  const sibling = expandedData.categories.find((value) => value.name === 'Zweiter Musterposten')!;
  await send('PUT', `/budget/${month}/assigned`, {
    items: [{ categoryId: sibling.id, assignedCents: 29 }],
  });
  await send('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    categoryId: sibling.id,
    date: `${month}-03`,
    amountCents: -7,
  });
  await page.reload();
  const totals = band.locator('.col-num');
  const firstCategory = page
    .locator(`.pname[data-category-id="${category.id}"]`)
    .locator('xpath=ancestor::tr');
  await expect(totals.nth(0)).toContainText('100,30 €');
  await expect(totals.nth(1)).toContainText('−100,09 €');
  await expect(totals.nth(2)).toContainText('0,21 €');
  await expect(firstCategory.locator('.col-assign')).toContainText('100,01 €');
  await expect(firstCategory.locator('.col-avail')).toContainText('−0,01 €');
  // Parent summaries never inspect the first category; the category button still does.
  await expect(
    inspector.getByRole('heading', { name: 'Musterposten', exact: true }),
  ).not.toBeVisible();
  for (let index = 0; index < 3; index++) {
    await totals.nth(index).click();
    await expect(
      inspector.getByRole('heading', { name: 'Musterposten', exact: true }),
    ).not.toBeVisible();
  }
  await firstCategory.locator('.pname').click();
  await expect(inspector.getByRole('heading', { name: 'Musterposten', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  if (page.viewportSize()!.width < 768) {
    await enterPhoneSelection(page);
    const groupSelection = band.getByRole('button', {
      name: /^Gruppe Musterband auswählen · \d+\/\d+$/,
    });
    await groupSelection.click();
    await expect(page.locator(`.pname[data-category-id="${category.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator(`.pname[data-category-id="${sibling.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator(`.pname[data-category-id="${category.id}"]`)).toContainText(
      'Musterposten',
    );
    await expect(page.locator(`.pname[data-category-id="${sibling.id}"]`)).toContainText(
      'Zweiter Musterposten',
    );
    await expectPhoneSelectionTargets(page);
    const groupToggle = band.locator('.grp-toggle');
    await groupToggle.focus();
    await page.keyboard.press('Space');
    await expect(groupToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(groupToggle).toBeFocused();
    await expect(
      page.locator(`.ptable-zero [data-category-id="${category.id}"]`),
    ).not.toBeVisible();
    await expect(page.locator(`.pname[data-category-id="${sibling.id}"]`)).not.toBeVisible();
    await expect(groupSelection).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(groupToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(groupToggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(groupToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(groupToggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(groupToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(groupToggle).toBeFocused();
    await expect(groupSelection).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(`.pname[data-category-id="${category.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator(`.pname[data-category-id="${sibling.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await exitPhoneSelection(page);
  } else {
    const groupSelection = band.getByRole('checkbox', {
      name: 'Gruppe Musterband auswählen',
      exact: true,
    });
    await groupSelection.check();
    await expect(
      page.getByRole('checkbox', { name: 'Musterposten auswählen', exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'Zweiter Musterposten auswählen', exact: true }),
    ).toBeChecked();
    const groupToggle = band.locator('.grp-toggle');
    await groupToggle.focus();
    await page.keyboard.press('Space');
    await expect(groupToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(groupToggle).toBeFocused();
    await expect(
      page.locator(`.ptable-zero [data-category-id="${category.id}"]`),
    ).not.toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: 'Zweiter Musterposten auswählen', exact: true }),
    ).not.toBeVisible();
    await expect(groupSelection).toBeChecked();
    await page.keyboard.press('Space');
    await expect(groupToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(groupToggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(groupToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(groupToggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(groupToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(groupToggle).toBeFocused();
    await expect(groupSelection).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'Zweiter Musterposten auswählen', exact: true }),
    ).toBeChecked();
  }
  if (info.project.name === 'desktop') {
    const options = page
      .locator('details.plan-menu')
      .filter({ has: page.locator('summary', { hasText: 'Optionen' }) });
    await options.locator('summary').click();
    await options.getByRole('button', { name: '2 Monate', exact: true }).click();
    await expect(page.locator('.ptable-multi .prow')).toHaveCount(3);
    await expect(page.locator('.ptable-multi .psingle')).toHaveCount(0);
    await page.getByRole('button', { name: 'Alle einklappen', exact: true }).click();
    await expect(page.locator('.ptable-multi .prow')).toHaveCount(0);
  }
});

// Each independent desktop concern keeps the default 30s budget.
async function withDesktopSample(browser: Browser, run: (desktop: Page) => Promise<void>) {
  const context = await browser.newContext({
    baseURL: SAMPLE_URL,
    storageState: STORAGE_STATE_SAMPLE,
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  try {
    const desktop = await context.newPage();
    await desktop.clock.setFixedTime(new Date(SAMPLE_NOW));
    await desktop.goto('/plan/monat?monat=2026-09');
    await expect(desktop.locator('.ptable-zero .pgroup:not(.psingle)')).toHaveCount(8);
    await desktop.evaluate(() => document.fonts.ready);
    await run(desktop);
  } finally {
    await context.close();
  }
}

// Use actual desktop contexts even in the iPhone engine project.
const parentBatches = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
] as const;
for (const theme of ['light', 'dark'] as const) {
  for (const indices of parentBatches) {
    sampleTest(
      `desktop ${theme} parent ink stays readable on screen (${indices[0]}–${indices[3]})`,
      async ({ browser }, info) => {
        await withDesktopSample(browser, async (desktop) => {
          await desktop.evaluate((value) => {
            document.documentElement.dataset['theme'] = value;
          }, theme);
          expect(parentBatches.flat()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
          const parentInk = await expectOnscreenParentInk(desktop, indices);
          expect(parentInk).toHaveLength(4);
          writeFileSync(
            info.outputPath(`desktop-${theme}-parent-ink-${indices[0]}-${indices[3]}.json`),
            JSON.stringify(
              {
                engine: browser.browserType().name(),
                browserVersion: browser.version(),
                theme,
                configuredDesktopFlags: { isMobile: false, hasTouch: false },
                selectedIndices: indices,
                parentInk,
              },
              null,
              2,
            ) + '\n',
          );
        });
      },
    );
  }

  sampleTest(
    `desktop ${theme} group labels stay inside their controls at 1440 pixels`,
    async ({ browser }, info) => {
      await withDesktopSample(browser, async (desktop) => {
        await desktop.evaluate((value) => {
          document.documentElement.dataset['theme'] = value;
        }, theme);
        await expectCompactBandContents(desktop, false);
        const bands = desktop.locator('.ptable-zero .pgroup:not(.psingle)');
        let truncatedLabels = 0;
        for (let index = 0; index < (await bands.count()); index++) {
          const band = bands.nth(index);
          const title = (await band.locator('.grp-title').textContent())!;
          await expect(band.locator('.grp-toggle')).toHaveAccessibleName(`Gruppe ${title}`);
          const geometry = await band.evaluate((row) => {
            const title = row.querySelector<HTMLElement>('.grp-title')!;
            const toggle = row.querySelector<HTMLElement>('.grp-toggle')!;
            const add = row.querySelector<HTMLElement>('.group-heading .plan-add')!;
            const selection = row.querySelector<HTMLElement>('.group-heading > .plan-select')!;
            const rect = title.getBoundingClientRect();
            const text = document.createRange();
            text.selectNodeContents(title);
            const fullText = text.getBoundingClientRect();
            const style = getComputedStyle(title);
            return {
              labelLeft: rect.left,
              labelRight: rect.right,
              labelWidth: rect.width,
              textRight: fullText.right,
              toggleLeft: toggle.getBoundingClientRect().left,
              toggleRight: toggle.getBoundingClientRect().right,
              addLeft: add.getBoundingClientRect().left,
              addRight: add.getBoundingClientRect().right,
              selectionLeft: selection.getBoundingClientRect().left,
              selectionRight: selection.getBoundingClientRect().right,
              clipsText: ['hidden', 'clip'].includes(style.overflowX),
              textOverflow: style.textOverflow,
            };
          });
          if (['Wohnen', 'Kredite', 'Abos'].includes(title))
            expect(geometry.textRight, title).toBeLessThanOrEqual(geometry.labelRight);
          expect(geometry.labelWidth, title).toBeGreaterThan(0);
          expect(geometry.labelRight, title).toBeLessThanOrEqual(geometry.toggleRight);
          expect(geometry.toggleRight, title).toBeLessThanOrEqual(geometry.addLeft);
          expect(geometry.selectionRight, title).toBeLessThanOrEqual(geometry.toggleLeft);
          if (geometry.textRight > geometry.labelRight) {
            truncatedLabels++;
            expect(geometry.clipsText, title).toBe(true);
            expect(geometry.textOverflow, title).toBe('ellipsis');
          }
          const paintedRight = geometry.clipsText
            ? Math.min(geometry.textRight, geometry.labelRight)
            : geometry.textRight;
          expect(paintedRight, title).toBeLessThanOrEqual(geometry.addLeft);
          expect(geometry.selectionRight, title).toBeLessThanOrEqual(geometry.labelLeft);
        }
        // Standalone headings may fit long labels; validate their real clipping state.
        expect(await bands.locator('.grp-title', { hasText: 'Versicherungen' }).count()).toBe(1);
        expect(truncatedLabels).toBeLessThanOrEqual(await bands.count());
        expect(
          await desktop.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(1440);
        expect(
          (await new AxeBuilder({ page: desktop }).include('main').analyze()).violations,
        ).toEqual([]);
        await resetCaptureScroll(desktop);
        await desktop.screenshot({ path: info.outputPath(`desktop-${theme}.png`), fullPage: true });
        const measurements = await desktop.locator('.ptable-zero').evaluate((table) => ({
          tableHeight: table.getBoundingClientRect().height,
          viewport: { width: innerWidth, height: innerHeight },
          observedTouchPoints: navigator.maxTouchPoints,
          observedCoarsePointer: matchMedia('(pointer: coarse)').matches,
          documentWidth: document.documentElement.scrollWidth,
          fontsStatus: document.fonts.status,
        }));
        expect(measurements.observedTouchPoints).toBe(0);
        expect(measurements.observedCoarsePointer).toBe(false);
        writeFileSync(
          info.outputPath(`desktop-${theme}-metrics.json`),
          JSON.stringify(
            {
              engine: browser.browserType().name(),
              browserVersion: browser.version(),
              theme,
              configuredDesktopFlags: { isMobile: false, hasTouch: false },
              oldRows: 55,
              newRows: 44,
              reductionPercent: (100 * (55 - 44)) / 55,
              ...measurements,
            },
            null,
            2,
          ) + '\n',
        );
      });
    },
  );
}

for (const theme of ['light', 'dark'] as const) {
  sampleTest(
    `narrow desktop ${theme} bands keep labels, bounds and right-edge actions`,
    async ({ browser }, info) => {
      await withDesktopSample(browser, async (desktop) => {
        await desktop.evaluate((value) => {
          document.documentElement.dataset['theme'] = value;
        }, theme);
        const measurements = [];
        for (const width of [768, 1180, 1439]) {
          await desktop.setViewportSize({ width, height: 900 });
          await expectCompactBandContents(desktop, false);
          const labels = await desktop
            .locator('.ptable-zero .pgroup:not(.psingle)')
            .evaluateAll((rows) =>
              rows.map((row) => {
                const title = row.querySelector<HTMLElement>('.grp-title')!;
                const range = document.createRange();
                range.selectNodeContents(title);
                const rect = (selector: string) => {
                  const box = row.querySelector(selector)!.getBoundingClientRect();
                  return {
                    left: box.left,
                    right: box.right,
                    top: box.top,
                    bottom: box.bottom,
                    width: box.width,
                  };
                };
                return {
                  name: title.textContent!,
                  textRight: range.getBoundingClientRect().right,
                  title: rect('.grp-title'),
                  add: rect('.group-heading .plan-add'),
                  selection: rect('.group-heading > .plan-select'),
                  category: (() => {
                    const box = row
                      .nextElementSibling!.querySelector('.pname')!
                      .getBoundingClientRect();
                    return { width: box.width };
                  })(),
                  status: (() => {
                    const box = row
                      .nextElementSibling!.querySelector('.spending-status')!
                      .getBoundingClientRect();
                    return { width: box.width };
                  })(),
                };
              }),
            );
          expect(labels).toHaveLength(8);
          for (const label of labels) {
            const context = JSON.stringify({ width, theme, ...label });
            expect(label.title.width, context).toBeGreaterThan(0);
            expect(label.category.width, context).toBeGreaterThan(0);
            expect(label.status.width, context).toBeGreaterThan(0);
            expect(label.title.right, context).toBeLessThanOrEqual(label.add.left);
            const separateControls =
              label.add.right <= label.selection.left ||
              label.selection.right <= label.add.left ||
              label.add.bottom <= label.selection.top ||
              label.selection.bottom <= label.add.top;
            expect(separateControls, context).toBe(true);
            if (['Wohnen', 'Kredite', 'Abos'].includes(label.name))
              expect(label.textRight, context).toBeLessThanOrEqual(label.title.right);
          }
          expect(
            await desktop.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
          const scroll = desktop.locator('.pmulti-scroll:has(.ptable-zero)');
          await expect(scroll).toHaveCSS('overflow-x', 'auto');
          await scroll.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
          });
          const action = desktop.locator('.ptable-zero .col-avail button').first();
          await action.focus();
          await expect(action).toBeFocused();
          const reachability = await scroll.evaluate((element) => {
            const outer = element.getBoundingClientRect();
            const header = element.querySelector('thead th:last-child')!.getBoundingClientRect();
            const target = document.activeElement!.getBoundingClientRect();
            return {
              outerLeft: outer.left,
              outerRight: outer.right,
              headerRight: header.right,
              actionLeft: target.left,
              actionRight: target.right,
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth,
              scrollLeft: element.scrollLeft,
              documentWidth: document.documentElement.scrollWidth,
            };
          });
          const context = JSON.stringify({ width, theme, reachability });
          expect(reachability.headerRight, context).toBeLessThanOrEqual(reachability.outerRight);
          expect(reachability.actionLeft, context).toBeGreaterThanOrEqual(reachability.outerLeft);
          expect(reachability.actionRight, context).toBeLessThanOrEqual(reachability.outerRight);
          expect(reachability.documentWidth, context).toBeLessThanOrEqual(width);
          if (reachability.scrollWidth > reachability.clientWidth)
            expect(reachability.scrollLeft, context).toBeGreaterThan(0);
          measurements.push({ width, theme, labels, reachability });
          writeFileSync(
            info.outputPath(`responsive-${theme}-metrics.json`),
            JSON.stringify(measurements, null, 2) + '\n',
          );
          await action.evaluate((element) => element.blur());
          await scroll.evaluate((element) => {
            element.scrollLeft = 0;
          });
        }
      });
    },
  );
}
