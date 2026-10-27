import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

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

test('inspector discloses month figures and reuses category writes, quick values and undo', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  const month = '2026-10';
  const send = async (method: 'POST' | 'PUT', path: string, data: unknown) => {
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
  const { group } = await send('POST', '/categories/groups', { name: 'Mustergruppe' });
  const ids: string[] = [];
  for (const name of ['Musterziel', 'Musterreserve']) {
    const { category } = await send('POST', '/categories', {
      name,
      groupId: group.id,
      class: 'need',
      kind: 'variable',
      stage: 2,
      target: { validFrom: month, target: { kind: 'monthly', amountCents: 10_001 } },
    });
    ids.push(category.id);
  }
  await send('POST', '/expected', {
    name: 'Musterzahlung',
    kind: 'outflow',
    accountId: account.id,
    categoryId: ids[0],
    amountCents: 101,
    rhythm: 'monthly',
    dueDay: 20,
    startDate: `${month}-20`,
  });
  await page.goto(`/plan/monat?monat=${month}`);
  const inspector = page.getByRole('complementary', { name: 'Plan-Inspektor' });
  await expect(inspector.locator('.inspector-section')).toHaveCount(5);
  await expect(inspector.locator('.inspector-section[open]')).toHaveCount(2);
  await expect(inspector.locator('.inspector-section[open] > summary')).toHaveText([
    'Monatsaufstellung',
    '50/30/20',
  ]);
  await expect(page.getByText('Monatsdetails', { exact: true })).toHaveCount(0);
  const split = inspector.locator('summary').filter({ hasText: '50/30/20' });
  await expect(inspector.locator('.sb-note').first()).toBeVisible();
  await split.focus();
  await page.keyboard.press('Enter');
  await expect(inspector.locator('.sb-note').first()).not.toBeVisible();
  await page.keyboard.press('Enter');
  await expect(inspector.locator('.sb-note').first()).toBeVisible();
  const category = page.getByRole('button', { name: 'Musterziel', exact: true });
  await category.click();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-10$/);
  await expect(inspector.getByRole('heading', { name: 'Musterziel' })).toBeVisible();
  await expect(inspector.getByText('fehlt 100,01 €')).toBeVisible();
  await expect(inspector.getByRole('progressbar', { name: 'Zielfortschritt' })).toHaveAttribute(
    'value',
    '0',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(inspector.getByText(/erwartet.*Musterzahlung.*1,01 €/)).toBeVisible();
  const writes: { path: string; body: unknown }[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && /\/api\/budget\//.test(request.url()))
      writes.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
  });
  const toast = page.locator('.toast.is-open');
  const phone = info.project.name !== 'desktop';
  const assigned = page
    .locator('.prow', { hasText: 'Musterziel' })
    .locator(phone ? '.phone-assigned' : '.assign-btn');
  await inspector.getByLabel('Zugewiesen', { exact: true }).fill('10+0,01');
  await inspector.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  await expect(assigned).toHaveText(phone ? 'Zugewiesen 10,01 €' : '10,01 €');
  expect(writes[0]).toEqual({
    path: `/api/budget/${month}/assigned`,
    body: { items: [{ categoryId: ids[0], assignedCents: 1001 }] },
  });
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned).toHaveText(phone ? 'Zugewiesen ≈ 100,01 €' : '≈ 100,01 €');
  await inspector.getByRole('button', { name: /^Ziele / }).click();
  await expect(assigned).toHaveText(phone ? 'Zugewiesen 100,01 €' : '100,01 €');
  expect(writes[1]).toEqual({
    path: `/api/budget/${month}/quick-assign`,
    body: { mode: 'target', categoryIds: [ids[0]] },
  });
  await expect(inspector.getByText('Ziel finanziert.')).toBeVisible();
  await inspector.getByText('Geld verschieben', { selector: 'summary' }).click();
  await inspector.getByLabel('Nach', { exact: true }).selectOption(ids[1]!);
  await inspector.getByLabel('Betrag', { exact: true }).fill('0,01');
  await inspector.getByRole('button', { name: 'Verschieben', exact: true }).click();
  await expect(assigned).toHaveText(phone ? 'Zugewiesen 100,00 €' : '100,00 €');
  expect(writes[2]).toEqual({
    path: `/api/budget/${month}/move`,
    body: { fromId: ids[0], toId: ids[1], amountCents: 1 },
  });
  // The toast of the move must have replaced the one of "Ziel" before Rückgängig is clicked.
  await expect(toast).toContainText('verschoben');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assigned).toHaveText(phone ? 'Zugewiesen 100,01 €' : '100,01 €');
  await toast.getByRole('button', { name: 'Wiederholen' }).focus();
  await page.keyboard.press('Escape');
  await expect(toast).not.toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    if (info.project.name === 'mobile') {
      const targets = await inspector
        .locator('button, input, select, summary, a')
        .evaluateAll((elements) =>
          elements
            .filter((e) => e.getBoundingClientRect().height > 0)
            .map((e) => ({ text: e.textContent, height: e.getBoundingClientRect().height })),
        );
      expect(targets.filter((target) => target.height < 44)).toEqual([]);
    }
    await inspector.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await inspector.screenshot({
      path: info.outputPath(`inspector-category-${theme}.png`),
      // A tall element crop can include the shell's offscreen fixed skip link.
      style: '.skip-link { visibility: hidden; }',
    });
  }
  await inspector.locator('summary').filter({ hasText: 'Kategorie-Aktionen' }).click();
  await inspector.getByRole('button', { name: 'Umbenennen / Ziel ändern' }).click();
  const form = page.getByRole('dialog', { name: 'Kategorie', exact: true });
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Musterziel');
  await page.keyboard.press('Escape');
  await expect(form).not.toBeVisible();
  await expect(inspector.getByRole('heading', { name: 'Musterziel' })).toBeVisible();
  await inspector.getByRole('button', { name: 'Ausblenden', exact: true }).click();
  await expect(inspector.getByRole('button', { name: 'Einblenden', exact: true })).toBeVisible();
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(inspector.getByRole('button', { name: 'Ausblenden', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(category).toBeFocused();
  if (page.viewportSize()!.width < 768) {
    await enterPhoneSelection(page);
    for (const [index, id] of ids.entries()) {
      const control = page.locator(`.pname[data-category-id="${id}"]`);
      await expect(control).toContainText(index === 0 ? 'Musterziel' : 'Musterreserve');
      await control.click();
      await expect(control).toHaveAttribute('aria-pressed', 'true');
    }
    await expectPhoneSelectionTargets(page);
  } else {
    await page.getByRole('checkbox', { name: 'Musterziel auswählen' }).check();
    await page.getByRole('checkbox', { name: 'Musterreserve auswählen' }).check();
  }
  await expect(inspector.getByRole('heading', { name: '2 Kategorien ausgewählt' })).toBeVisible();
  await inspector.getByRole('button', { name: /^Ziele / }).click();
  await expect(toast).toContainText('1 Kategorie zugewiesen');
  expect(writes[3]).toEqual({
    path: `/api/budget/${month}/quick-assign`,
    body: { mode: 'target', categoryIds: ids },
  });
  // Phone mode persists until explicitly ended; desktop keeps its original outside-click check.
  if (page.viewportSize()!.width < 768) await exitPhoneSelection(page);
  // Any toolbar control outside the selection is an outside click: Optionen ▾ (opened, then closed).
  const optionen = page.locator('.plan-menu summary', { hasText: 'Optionen' });
  await optionen.click();
  await optionen.click();
  await expect(inspector.locator('.inspector-section[open]')).toHaveCount(2);
  await expect(inspector.locator('.inspector-section[open] > summary')).toHaveText([
    'Monatsaufstellung',
    '50/30/20',
  ]);
  if (info.project.name === 'desktop') {
    const main = await page.locator('.plan-main').boundingBox();
    const side = await inspector.boundingBox();
    expect(side!.width).toBe(320);
    expect(side!.x).toBeGreaterThanOrEqual(main!.x + main!.width);
    await page.setViewportSize({ width: 1179, height: 900 });
  }
  const main = await page.locator('.plan-main').boundingBox();
  const side = await inspector.boundingBox();
  expect(side!.y).toBeGreaterThanOrEqual(main!.y + main!.height);
  await inspector.getByRole('button', { name: 'Monatsüberblick einklappen', exact: true }).click();
  await expect(inspector.locator('.insp-list').first()).not.toBeVisible();
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    inspector.getByRole('button', { name: 'Monatsüberblick ausklappen', exact: true }),
  ).toBeVisible();
  await inspector.getByRole('button', { name: 'Monatsüberblick ausklappen', exact: true }).click();
  await expect(inspector.locator('.insp-list').first()).toBeVisible();
  await inspector.screenshot({ path: info.outputPath('inspector-month.png') });
});
