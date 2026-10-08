import AxeBuilder from '@axe-core/playwright';
import { inboxItem, insertTracked, openDatabase } from '@budget/db';
import { expect, test, type Page } from '@playwright/test';
import { DB_MAIN, MAIN_URL } from '../playwright.config';

test('actual inbox: confirm, categorize, resolve warning, undo and keyboard panel', async ({
  page,
  request,
}, info) => {
  const tag = `Inbox ${info.project.name} r${info.retry}`;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${MAIN_URL}/api${path}`, {
      headers: { origin: MAIN_URL },
      data,
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const account = await post('/accounts', {
    name: tag,
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 10000,
  });
  const booking = await post('/bookings', {
    type: 'booking',
    accountId: account.account.id,
    date: '2026-09-01',
    amountCents: -1200,
    status: 'pending',
    splits: [{ amountCents: -1200 }],
  });
  const warningId = `inbox-warning-${info.project.name}-${info.retry}`;
  const { db, close } = openDatabase(DB_MAIN);
  try {
    insertTracked(
      db,
      inboxItem,
      {
        id: warningId,
        kind: 'stale_value',
        title: `Quelle ${tag}`,
        detail: 'Die synthetische Quelle ist wieder verfügbar.',
        refType: 'fx',
        refId: 'synthetic-fx',
      },
      { actor: 'e2e' },
    );
  } finally {
    close();
  }
  const countResponse = page.waitForResponse(
    (response) => response.url() === `${MAIN_URL}/api/inbox/count` && response.ok(),
  );
  await page.goto('/konten/posteingang');
  const count = (await (await countResponse).json()).count;
  const inboxTrigger = page
    .locator(info.project.name === 'mobile' ? '.m-head' : '.topbar')
    .getByRole('link', { name: /Posteingang, \d+ offen/ });
  await expect(inboxTrigger).toHaveAttribute('aria-label', `Posteingang, ${count} offen`);
  const row = page.getByTestId('inbox-row').filter({ hasText: tag }).filter({ hasText: '12,00' });
  await expect(row).toContainText('vorgemerkt');
  await row.getByRole('button', { name: 'Bestätigen', exact: true }).click();
  await expect(row).not.toContainText('vorgemerkt');
  await expect(row).toBeVisible(); // Confirmation alone does not categorize.
  await inboxTrigger.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Posteingang', exact: true });
  await expect(panel).toBeVisible();
  await panel
    .getByTestId('inbox-row')
    .filter({ hasText: tag })
    .filter({ hasText: '12,00' })
    .getByRole('button', { name: 'Zuordnen' })
    .click();
  const editor = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(editor).toBeVisible();
  await expect(panel).toBeHidden();
  await editor.getByLabel('Kategorie', { exact: true }).fill('Essen');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(panel).toBeVisible();
  await expect(
    panel.getByTestId('inbox-row').filter({ hasText: tag }).filter({ hasText: '12,00' }),
  ).toHaveCount(0);
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(
    panel.getByTestId('inbox-row').filter({ hasText: tag }).filter({ hasText: '12,00' }),
  ).toBeVisible();
  await page.locator('.toast.is-open').getByRole('button', { name: 'Wiederholen' }).click();
  await expect(
    panel.getByTestId('inbox-row').filter({ hasText: tag }).filter({ hasText: '12,00' }),
  ).toHaveCount(0);
  const warning = panel.getByTestId('inbox-row').filter({ hasText: `Quelle ${tag}` });
  // Accessibility scans must not consume the short undo/redo toast lifetime.
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate(() => document.fonts.ready);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
    await page.screenshot({
      path: info.outputPath(`inbox-${info.project.name}-${theme}.png`),
      fullPage: true,
    });
  }
  const resolve = warning.getByRole('button', { name: 'Als erledigt markieren' });
  await expect(resolve).toHaveClass(/btn-ghost/);
  await expect(resolve).not.toHaveClass(/btn-alert/);
  await resolve.click();
  await expect(warning).toHaveCount(0);
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(warning).toBeVisible();
  await page.locator('.toast.is-open').getByRole('button', { name: 'Wiederholen' }).click();
  await expect(warning).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(inboxTrigger).toBeFocused();
  await page.goto('/konten');
  await inboxTrigger.click();
  await expect(panel).toBeVisible();
  await panel.getByRole('link', { name: 'Alle Aufgaben anzeigen' }).click();
  await expect(page).toHaveURL(/\/konten\/posteingang$/);
  await expect(panel).toBeHidden();
  // Own synthetic fixtures only; no shared ledger assumptions or real data.
  const deleted = await request.delete(`${MAIN_URL}/api/bookings/${booking.id}`, {
    headers: { origin: MAIN_URL },
  });
  expect(deleted.ok()).toBeTruthy();
});

test('empty and failed inbox count never present a fabricated nine', async ({ page }) => {
  await page.route('**/api/inbox/count', (route) => route.fulfill({ json: { count: 0 } }));
  await page.route('**/api/inbox', (route) =>
    route.fulfill({ json: { asOf: '2026-09-17', count: 0, entries: [] } }),
  );
  await page.goto('/konten/posteingang');
  await expect(page.getByText('Posteingang leer.', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Posteingang, 0 offen', exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.unroute('**/api/inbox/count');
  await page.route('**/api/inbox/count', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.reload();
  await expect(
    page
      .getByRole('link', { name: 'Posteingang, Anzahl noch nicht verfügbar' })
      .filter({ visible: true }),
  ).toBeVisible();
});

test('a long queue draws in pages of 100 rows and keeps the group count', async ({ page }) => {
  const entries = Array.from({ length: 130 }, (_, i) => ({
    type: 'stored',
    id: `long-${i}`,
    kind: 'revision',
    title: `Synthetische Aufgabe ${i}`,
    detail: null,
    refType: null,
    refId: null,
    urgent: false,
    createdAt: '2026-09-01T10:00:00.000Z',
  }));
  await page.route('**/api/inbox/count', (route) => route.fulfill({ json: { count: 130 } }));
  await page.route('**/api/inbox', (route) =>
    route.fulfill({ json: { asOf: '2026-09-17', count: 130, entries } }),
  );
  await page.goto('/konten/posteingang');
  await expect(page.getByTestId('inbox-row')).toHaveCount(100);
  await expect(page.locator('.kgcount')).toHaveText('130');
  await page
    .getByRole('button', { name: /Weitere anzeigen \(30 von 130 noch verborgen\)/ })
    .click();
  await expect(page.getByTestId('inbox-row')).toHaveCount(130);
  await expect(page.getByRole('button', { name: /Weitere anzeigen/ })).toHaveCount(0);
});

test.describe('Posteingang dialog', () => {
  const isPhone = (info: { project: { name: string } }) => info.project.name === 'mobile';
  const trigger = (page: Page, info: { project: { name: string } }) =>
    page.locator(isPhone(info) ? '.m-head' : '.topbar').getByRole('link', { name: /^Posteingang/ });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/inbox/count', (route) => route.fulfill({ json: { count: 2 } }));
    await page.route('**/api/inbox', (route) =>
      route.fulfill({ json: { asOf: '2026-09-17', count: 0, entries: [] } }),
    );
  });

  test('opens as a large centred dialog (desktop) or a full-screen sheet (phone)', async ({
    page,
  }, info) => {
    await page.goto('/konten');
    await trigger(page, info).click();
    await expect(page).toHaveURL(/\/konten\?panel=posteingang$/);
    const dialog = page.getByRole('dialog', { name: 'Posteingang', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-labelledby', /.+/);
    // Modal: the page behind is inert (showModal).
    expect(await dialog.evaluate((el) => el.matches(':modal'))).toBe(true);
    await expect(dialog.locator('.panel-head .count')).toHaveText(/^2/);
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    if (!box || !viewport) return;
    if (isPhone(info)) {
      expect(Math.round(box.x)).toBe(0);
      expect(Math.round(box.y)).toBe(0);
      expect(Math.round(box.width)).toBe(viewport.width);
      expect(Math.round(box.height)).toBe(viewport.height);
    } else {
      expect(Math.round(box.width)).toBe(Math.min(960, viewport.width - 48));
      expect(box.height).toBeLessThanOrEqual(viewport.height * 0.85 + 1);
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
      expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2);
    }
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
  });

  test('Esc and the close button close it and focus returns to the trigger', async ({
    page,
  }, info) => {
    await page.goto('/konten');
    const opener = trigger(page, info);
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Posteingang', exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/konten$/);
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Schließen' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/konten$/);
  });

  test('a click on the backdrop closes it (desktop)', async ({ page }, info) => {
    test.skip(isPhone(info), 'the phone sheet has no backdrop');
    await page.goto('/konten?panel=posteingang');
    const dialog = page.getByRole('dialog', { name: 'Posteingang', exact: true });
    await expect(dialog).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/konten$/);
  });

  test('focus stays inside while tabbing and the head stays when the body scrolls', async ({
    page,
  }, info) => {
    await page.goto('/konten');
    await trigger(page, info).click();
    const dialog = page.getByRole('dialog', { name: 'Posteingang', exact: true });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    const head = dialog.locator('.panel-head');
    await dialog.locator('.panel-body').evaluate((el) => {
      const filler = document.createElement('div');
      filler.style.height = '3000px';
      el.append(filler);
      el.scrollTop = 1500;
    });
    // The dialog grows to its maximum and the body scrolls inside; the head stays at the top.
    const box = await dialog.boundingBox();
    const after = await head.boundingBox();
    expect(Math.round((after?.y ?? -1) - (box?.y ?? 0))).toBeLessThanOrEqual(1);
    expect(await dialog.locator('.panel-body').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeInViewport();
  });
});
