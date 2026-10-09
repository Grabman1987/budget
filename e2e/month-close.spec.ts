import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test } from './isolated-ledger';

test('guided month close walks all five steps, undoes the whole plan and keeps an editable close marker', async ({
  page,
  isolatedLedger,
}, info) => {
  const screenshot = async (name: string) => {
    const toastAction = page.locator('.toast.is-open button');
    if (await toastAction.isVisible()) await toastAction.press('Escape');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(name), fullPage: true, animations: 'disabled' });
  };
  const expectNextClear = async () => {
    const next = await page.getByRole('button', { name: 'Weiter', exact: true }).boundingBox();
    const capture = await page.locator('.fab').boundingBox();
    expect(
      next &&
        capture &&
        (next.x + next.width <= capture.x ||
          next.y + next.height <= capture.y ||
          capture.y + capture.height <= next.y),
    ).toBe(true);
  };
  const write = async (method: string, path: string, data: unknown) => {
    const res = await page.request.fetch(`${isolatedLedger.origin}/api${path}`, {
      method,
      data,
      headers: { origin: isolatedLedger.origin },
    });
    expect(res.ok()).toBeTruthy();
    return res.json();
  };
  const { account } = await write('POST', '/accounts', {
    name: 'Musterkonto',
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 10000,
  });
  const { account: manual } = await write('POST', '/accounts', {
    name: 'Musteranlage',
    type: 'p2p',
    openingDate: '2026-09-01',
  });
  const { group } = await write('POST', '/categories/groups', { name: 'Mustergruppe' });
  const { category } = await write('POST', '/categories', {
    name: 'Musterbedarf',
    groupId: group.id,
    class: 'need',
  });
  await write('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-09-12',
    amountCents: -400,
    splits: [{ amountCents: -400 }],
  });
  await write('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-01',
    amountCents: -50,
    splits: [{ amountCents: -50 }],
  });
  await page.goto('/plan/monat?monat=2026-09');
  await page
    .getByRole('link', { name: 'Monatsabschluss starten oder fortsetzen', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Monatsabschluss · September 2026', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. Posteingang leeren' })).toBeVisible();
  await expect(page.getByTestId('inbox-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Zuordnen', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await editor.getByLabel('Kategorie', { exact: true }).fill('Musterbedarf');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByTestId('inbox-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2. Konten abgleichen' })).toBeVisible();
  await screenshot('month-close-accounts.png');
  if (info.project.name === 'mobile') await expectNextClear();
  await page.reload();
  await expect(page.getByRole('heading', { name: '2. Konten abgleichen' })).toBeVisible();
  await page.getByRole('button', { name: 'Kontostand prüfen', exact: true }).click();
  await page.getByLabel('Saldo laut Bank').fill('96');
  await page.getByRole('button', { name: /Festschreiben/ }).click();
  await page.getByRole('button', { name: 'Wert aktualisieren', exact: true }).click();
  await page.getByLabel('Wert in EUR').fill('125');
  await page.getByRole('button', { name: 'Wert speichern', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled();
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Weiter', exact: true }).scrollIntoViewIfNeeded();
    await expectNextClear();
  }
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: '3. Überzogenes ausgleichen' })).toBeVisible();
  await page.getByRole('button', { name: 'Geld verschieben', exact: true }).click();
  await screenshot('month-close-cover.png');
  await page.getByRole('button', { name: /Decken.*4,00/ }).click();
  await expect(page.getByText('Keine Kategorie ist überzogen.')).toBeVisible();
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Weiter', exact: true }).scrollIntoViewIfNeeded();
    await expectNextClear();
  }
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await screenshot(`month-close-${scheme}.png`);
  }
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4. Nächsten Monat planen' })).toBeVisible();
  await page.getByLabel('Plan für Musterbedarf').fill('95,50');
  await expect(page.getByTestId('close-plan-remaining')).toContainText('0,00');
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Plan übernehmen · alle', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled();
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect(page.getByTestId('close-plan-remaining')).toContainText('95,50');
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  await page.getByLabel('Plan für Musterbedarf').fill('95,50');
  await page.getByRole('button', { name: 'Plan übernehmen · alle', exact: true }).click();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await screenshot(`month-close-plan-${scheme}.png`);
  }
  if (info.project.name === 'mobile') await expectNextClear();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: '5. Rückblick' })).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Monats-One-Pager September 2026' }),
  ).toBeVisible();
  await expect(page.getByTestId('month-close-verdict')).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await screenshot(`month-close-review-${scheme}.png`);
  }
  await page.getByRole('button', { name: 'Monat abschließen', exact: true }).click();
  await expect(
    page.getByText('Abgeschlossen am 02.10.2026. Buchungen bleiben bearbeitbar.'),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Abgeschlossen am 02.10.2026. Buchungen bleiben bearbeitbar.'),
  ).toBeVisible();
  const state = await page.request.get(`${isolatedLedger.origin}/api/month-close/2026-09`);
  const result = await state.json();
  expect(result.state.currentStep).toBe(5);
  expect(result.state.closedOn).toBe('2026-10-02');
  expect(result.steps.map((s: { status: string }) => s.status)).toEqual([
    'done',
    'done',
    'done',
    'done',
    'done',
  ]);
  const ledger = await page.request.get(`${isolatedLedger.origin}/api/bookings`);
  expect((await ledger.json()).items).toHaveLength(2);
  expect(manual.id).toBeTruthy();
  expect(category.id).toBeTruthy();
  await page.goto('/plan/monat?monat=2026-09');
  await expect(
    page.getByRole('link', { name: 'Monatsabschluss starten oder fortsetzen', exact: true }),
  ).toBeVisible();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  else await page.keyboard.press('Control+k');
  await page
    .getByRole('listbox', { name: 'Suchergebnisse' })
    .getByRole('option', { name: /Monatsabschluss starten/ })
    .click();
  await expect(page.getByRole('heading', { name: '5. Rückblick' })).toBeVisible();
});
