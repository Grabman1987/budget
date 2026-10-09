import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

test.setTimeout(120_000);

async function inspect(page: Page, name: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = page.locator('dialog[open]');
  if (await dialog.count()) {
    await dialog.evaluate((d) => d.getAnimations().forEach((a) => a.finish()));
    await expect(dialog).toHaveClass(/is-bare/);
    await expect(dialog).not.toHaveClass(/\bpanel\b/);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    if (page.viewportSize()!.width === 390) {
      const close = await dialog
        .getByRole('button', { name: 'Schließen', exact: true })
        .boundingBox();
      expect(close!.width).toBeGreaterThanOrEqual(44);
      expect(close!.height).toBeGreaterThanOrEqual(44);
    }
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
}

test('account forms cancel in their context; reconciliation writes only on confirmation and undoes', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const origin = isolatedLedger.origin;
  const response = await request.post(`${origin}/api/accounts`, {
    headers: { origin },
    data: {
      name: 'Giro Muster',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 10000,
    },
  });
  expect(response.ok()).toBe(true);
  const { account } = await response.json();
  await page.goto('/einstellungen/konten');
  const create = page.getByRole('button', { name: 'Konto anlegen', exact: true });
  await create.click();
  await inspect(page, 'account-create');
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Entwurf');
  await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();
  await expect(create).toBeFocused();
  const edit = page.getByRole('button', { name: 'Giro Muster bearbeiten' });
  await edit.click();
  await inspect(page, 'account-edit');
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await expect(page).toHaveURL(/\/einstellungen\/konten$/);
  await page.goto(`/konten/${account.id}`);
  let writes = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/reconcile')) writes++;
  });
  const opener = page.getByRole('button', { name: 'Kontostand prüfen', exact: true });
  await expect(opener).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await opener.click();
  await inspect(page, 'reconciliation');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Saldo laut Bank', { exact: true }).fill('99');
  await expect(dialog.getByText(/Es fehlt eine Ausgabe/)).toBeVisible();
  expect(writes).toBe(0);
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(opener).toBeFocused();
  await expect(page.getByTestId('account-balance')).toHaveText('100,00 €');
  await opener.click();
  await dialog.getByLabel('Saldo laut Bank', { exact: true }).fill('99');
  await dialog.getByRole('button', { name: /Differenz ausgleichen/ }).click();
  await expect(page.getByTestId('account-balance')).toHaveText('99,00 €');
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByTestId('account-balance')).toHaveText('100,00 €');
  await expect(page).toHaveURL(new RegExp(`/konten/${account.id}$`));
});

test('rule status direct links, browser back and return keep context; threshold cancel restores focus', async ({
  page,
}) => {
  await page.goto('/einstellungen/regelwerk?monat=2026-09');
  const opener = page.getByRole('link', { name: 'Einstellen R02 Notgroschen' });
  await opener.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  await opener.click();
  await expect(page).toHaveURL(/\/regelwerk\/R02\?monat=2026-09$/);
  await expect(page.getByRole('navigation', { name: 'Brotkrumen' })).toContainText(
    'R02 Notgroschen',
  );
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await inspect(page, 'rule-status');
  await page.goBack();
  await expect(page).toHaveURL(/\/regelwerk\?monat=2026-09$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
  await page.goForward();
  const edit = page.getByRole('link', { name: 'Schwellen bearbeiten', exact: true });
  await edit.click();
  await inspect(page, 'rule-threshold');
  await page.getByRole('dialog').getByLabel('Mindestens').fill('2');
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();
  await edit.click();
  await expect(page.getByRole('dialog').getByLabel('Mindestens')).toHaveValue('3');
  await page.goBack();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Zurück zum Regelwerk', exact: true }).click();
  await expect(page).toHaveURL(/\/regelwerk\?monat=2026-09$/);
  await page.goto('/einstellungen/regelwerk/R02?monat=2026-09&bearbeiten=true');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/regelwerk\/R02\?monat=2026-09$/);
  await page.getByRole('link', { name: 'Zurück zum Regelwerk', exact: true }).click();
  await expect(page).toHaveURL(/\/regelwerk\?monat=2026-09$/);
  await page.goto('/einstellungen/regelwerk/unknown-synthetic');
  await expect(page.getByText('Diese Regel ist nicht verfügbar.')).toBeVisible();
});

test('asset group and target dialogs retain dirty navigation and direct-link close', async ({
  page,
}) => {
  await page.goto('/einstellungen/anlageklassen');
  const opener = page.getByRole('link', { name: 'Gruppe anlegen', exact: true });
  await opener.click();
  await inspect(page, 'asset-group');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name der Gruppe').fill('Gruppe Entwurf');
  await page.goBack();
  await expect(dialog.getByRole('alert')).toContainText('Ungespeicherte Änderungen');
  await dialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(opener).toBeFocused();
  await page.goto('/einstellungen/anlageklassen?panel=sollquoten');
  await inspect(page, 'asset-targets');
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page).toHaveURL(/\/einstellungen\/anlageklassen$/);
});

test('target save blocks dismissal and retirement plus replacement undo as one group', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const origin = isolatedLedger.origin;
  const headers = { origin };
  const create = async (name: string) => {
    const response = await request.post(`${origin}/api/asset-classes`, { headers, data: { name } });
    expect(response.ok()).toBe(true);
    return (await response.json()).assetClass.id as string;
  };
  const retired = await create('Klasse Alpha');
  const kept = await create('Klasse Beta');
  const initial = await request.put(`${origin}/api/asset-classes/targets`, {
    headers,
    data: {
      validFrom: '2026-10-02',
      targets: [
        { assetClassId: retired, targetShareBp: 5000, bandBp: 0 },
        { assetClassId: kept, targetShareBp: 5000, bandBp: 0 },
      ],
    },
  });
  expect(initial.ok(), await initial.text()).toBe(true);
  await page.goto('/einstellungen/anlageklassen');
  await page
    .locator('.asset-class-table')
    .getByRole('link', { name: 'Klasse Alpha', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Ersatz-Sollversion und archivieren', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Im Sollmodell berücksichtigen · Klasse Alpha', { exact: true })
    .uncheck();
  await dialog.getByLabel('Klasse Beta · Soll (%)', { exact: true }).fill('100');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const pending = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/asset-classes/targets', async (route) => {
    if (route.request().method() === 'PUT') {
      arrived();
      await gate;
    }
    await route.continue();
  });
  await dialog
    .getByRole('button', { name: 'Sollversion speichern und archivieren', exact: true })
    .click();
  await pending;
  try {
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`panel=anlageklasse-archivieren&klasse=${retired}`));
  } finally {
    release();
  }
  const classForm = page.getByRole('dialog', { name: 'Klasse Alpha', exact: true });
  await expect(
    classForm.getByRole('button', { name: 'Wieder aktivieren', exact: true }),
  ).toBeVisible();
  await classForm.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const row = page
    .locator('.asset-class-table')
    .getByRole('row')
    .filter({ hasText: 'Klasse Alpha' });
  await expect(row).toContainText('Archiviert');
  const read = async () =>
    (await (await request.get(`${origin}/api/asset-classes/targets`)).json()).versions;
  expect((await read())[0].targets).toMatchObject([{ assetClassId: kept, targetShareBp: 10000 }]);
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row).toContainText('Aktiv · verwaltet');
  expect((await read())[0].targets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ assetClassId: retired, targetShareBp: 5000 }),
      expect.objectContaining({ assetClassId: kept, targetShareBp: 5000 }),
    ]),
  );
});
