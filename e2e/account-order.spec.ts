import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test } from './isolated-ledger';
import { toast, openLedgerFilters } from './ledger-helpers';

/**
 * The owner's account order: edit mode in the sidebar (desktop) and in Konten › Übersicht (also
 * the phone), drag by pointer, ↑ / ↓ buttons, arrow keys, "Rückgängig", persistence, and the same
 * order in the selects.
 */

const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

async function seed(request: APIRequestContext, origin: string, tag: string) {
  const json = async (path: string, data: unknown) => {
    const response = await request.post(`${origin}/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
  };
  for (const name of NAMES)
    await json('/accounts', {
      name: `${name} ${tag}`,
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 100_00,
    });
  await json('/accounts', {
    name: `Karte ${tag}`,
    type: 'credit_card',
    openingDate: '2026-09-01',
    openingBalanceCents: 0,
  });
}

/** Names of the accounts of this test in the order the table lists them. */
const tableOrder = async (page: Page, tag: string) =>
  (await page.locator('.ktable .krow .kname').allInnerTexts())
    .filter((t) => t.endsWith(tag) && !t.startsWith('Karte'))
    .map((t) => t.replace(` ${tag}`, ''));

const sidebarOrder = async (page: Page, tag: string) =>
  (await page.locator('.acct-tree .acct-name').allInnerTexts())
    .filter((t) => t.endsWith(tag))
    .map((t) => t.replace(` ${tag}`, ''));

const rowOf = (page: Page, name: string, tag: string): Locator =>
  page.locator('.ktable .krow', { has: page.getByRole('link', { name: `${name} ${tag}` }) });

async function dragBy(page: Page, grip: Locator, dy: number) {
  const box = (await grip.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy / 2, { steps: 4 });
  await page.mouse.move(x, y + dy, { steps: 6 });
  await page.mouse.up();
}

test('Konten › Übersicht: reorder by buttons and drag, undo, persistence, selects', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  test.setTimeout(120_000);
  const tag = `T${info.project.name}${info.retry}${info.repeatEachIndex}`;
  await seed(request, isolatedLedger.origin, tag);
  await page.goto('/konten');
  await expect(page.getByTestId('net-worth')).toBeVisible();
  expect(await tableOrder(page, tag)).toEqual(NAMES);

  await page.getByRole('button', { name: 'Reihenfolge ändern', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fertig' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The first account cannot go up, the last cannot go down (of the group, not of the list).
  await expect(page.getByRole('button', { name: `Alpha ${tag} nach oben` })).toBeDisabled();
  await expect(page.getByRole('button', { name: `Delta ${tag} nach unten` })).toBeDisabled();

  // One step down with the button, focus stays on it.
  const down = page.getByRole('button', { name: `Alpha ${tag} nach unten` });
  await down.click();
  await expect(toast(page)).toContainText('Reihenfolge der Konten gespeichert.');
  await expect.poll(() => tableOrder(page, tag)).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta']);
  await expect(down).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Position 2 von 4' })).toBeAttached();

  // Undo restores the old order.
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect.poll(() => tableOrder(page, tag)).toEqual(NAMES);

  // Drag Alpha below Charlie by pointer: two rows down.
  const grip = page.getByRole('button', { name: new RegExp(`^Alpha ${tag} verschieben`) });
  const rowHeight = (await rowOf(page, 'Bravo', tag).boundingBox())!.height;
  await dragBy(page, grip, rowHeight * 2 + 4);
  await expect.poll(() => tableOrder(page, tag)).toEqual(['Bravo', 'Charlie', 'Alpha', 'Delta']);
  await expect(toast(page)).toContainText('Reihenfolge der Konten gespeichert.');

  // Arrow keys on the grip.
  const delta = page.getByRole('button', { name: new RegExp(`^Delta ${tag} verschieben`) });
  await delta.focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => tableOrder(page, tag)).toEqual(['Bravo', 'Charlie', 'Delta', 'Alpha']);
  await expect(delta).toBeFocused();

  // The groups keep their order; the card stays in Kreditkarten.
  await expect(page.locator('.kgroup .grp-title')).toHaveText(['Budget-Konten', 'Kreditkarten']);

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
  }

  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByRole('button', { name: 'Reihenfolge ändern', exact: true })).toBeVisible();

  // Persisted, and the same order in the account select.
  await page.reload();
  await expect.poll(() => tableOrder(page, tag)).toEqual(['Bravo', 'Charlie', 'Delta', 'Alpha']);
  await page.goto('/konten/buchungen');
  await openLedgerFilters(page);
  const options = page
    .getByLabel('Konto', { exact: true })
    .locator('optgroup')
    .first()
    .locator('option');
  await expect
    .poll(async () =>
      (await options.evaluateAll((els) => els.map((el) => el.textContent ?? '')))
        .filter((t) => t.includes(tag))
        .map((t) => t.split(' ')[0]),
    )
    .toEqual(['Bravo', 'Charlie', 'Delta', 'Alpha']);
});

test('sidebar: pencil on hover, edit mode with keyboard and drag', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  test.skip(info.project.name === 'mobile', 'The sidebar is a desktop element');
  test.setTimeout(120_000);
  const tag = `S${info.project.name}${info.retry}${info.repeatEachIndex}`;
  await seed(request, isolatedLedger.origin, tag);
  await page.goto('/konten');
  await expect(page.locator('.acct-tree .acct-group-title').first()).toBeVisible();
  expect(await sidebarOrder(page, tag)).toEqual([...NAMES, 'Karte']);

  const group = page.locator('.acct-group', { hasText: 'Budget-Konten' });
  const pencil = group.getByRole('button', {
    name: 'Reihenfolge der Konten in Budget-Konten ändern',
  });
  await expect(pencil).toHaveCSS('opacity', '0');
  await group.locator('.acct-group-bar').hover();
  await expect(pencil).toHaveCSS('opacity', '1');
  await pencil.click();
  await expect(page.getByRole('button', { name: 'Fertig' })).toBeVisible();

  // Keyboard: ↑ / ↓ buttons.
  await page.getByRole('button', { name: `Charlie ${tag} nach oben` }).click();
  await expect(toast(page)).toContainText('Reihenfolge der Konten gespeichert.');
  await expect
    .poll(() => sidebarOrder(page, tag))
    .toEqual(['Alpha', 'Charlie', 'Bravo', 'Delta', 'Karte']);

  // Drag Alpha two rows down.
  const grip = page.getByRole('button', { name: new RegExp(`^Alpha ${tag} verschieben`) });
  const item = page.locator('.acct-item', { hasText: `Bravo ${tag}` });
  const rowHeight = (await item.boundingBox())!.height;
  await dragBy(page, grip, rowHeight * 2 + 4);
  await expect
    .poll(() => sidebarOrder(page, tag))
    .toEqual(['Charlie', 'Bravo', 'Alpha', 'Delta', 'Karte']);

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page })
      .include('.sidebar')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
  }
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(
    page.locator('.acct-tree').getByRole('link', { name: new RegExp(`^Alpha ${tag}`) }),
  ).toBeVisible();
});

test('phone: a touch drag on the grip reorders and does not scroll', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Touch input is the phone project');
  test.setTimeout(120_000);
  const tag = `P${info.project.name}${info.retry}${info.repeatEachIndex}`;
  await seed(request, isolatedLedger.origin, tag);
  await page.goto('/konten');
  await page.getByRole('button', { name: 'Reihenfolge ändern', exact: true }).click();
  const grip = page.getByRole('button', { name: new RegExp(`^Bravo ${tag} verschieben`) });
  await grip.scrollIntoViewIfNeeded();
  const box = (await grip.boundingBox())!;
  const rowHeight = (await rowOf(page, 'Charlie', tag).boundingBox())!.height;
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', at: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y: at }],
    });
  await touch('touchStart', y);
  for (let step = 1; step <= 8; step += 1) await touch('touchMove', y + (rowHeight * 2 * step) / 8);
  await touch('touchEnd', y);
  await expect.poll(() => tableOrder(page, tag)).toEqual(['Alpha', 'Charlie', 'Delta', 'Bravo']);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});
