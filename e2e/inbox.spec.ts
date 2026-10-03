import AxeBuilder from '@axe-core/playwright';
import { inboxItem, insertTracked, openDatabase } from '@budget/db';
import { expect, test } from '@playwright/test';
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
  await warning.getByRole('button', { name: 'Als erledigt markieren' }).click();
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
