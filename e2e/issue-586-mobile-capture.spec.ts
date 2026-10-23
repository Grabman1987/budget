import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function openCapture(page: Page) {
  await page.goto('/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Betrag', { exact: true })).toBeFocused();
  return dialog;
}

async function addManyLines(dialog: Locator) {
  await dialog.getByLabel('Betrag', { exact: true }).fill('120');
  await dialog.getByLabel('Empfänger', { exact: true }).fill('Musterladen mit mehreren Kategorien');
  for (let index = 0; index < 5; index++)
    await dialog.getByRole('button', { name: '+ Weitere Kategorie', exact: true }).click();
  for (let line = 1; line <= 6; line++) {
    await dialog.getByLabel(`Betrag ${line}`, { exact: true }).fill('20');
    await dialog.getByLabel(`Kategorie ${line}`, { exact: true }).fill('Essen');
    await dialog
      .getByRole('listbox')
      .getByRole('option', { name: /^Essen/ })
      .click();
  }
  await dialog.getByLabel('Notiz').fill('Musterbeleg\nErste Notizzeile\nZweite Notizzeile');
}

async function saveWithin(dialog: Locator, top: number, height: number) {
  const save = dialog.getByRole('button', { name: 'Speichern', exact: true });
  const bounds = (await save.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(top);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(top + height);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  // The visible action must also receive a touch at its centre, not be covered by scrolling rows.
  expect(
    await save.evaluate((el) => {
      const { x, y, width, height: buttonHeight } = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(x + width / 2, y + buttonHeight / 2));
    }),
  ).toBe(true);
}

test('capture keeps save visible with many lines, status, targets and both themes', async ({
  page,
  request,
  baseURL,
}, info) => {
  const accounts: Record<string, string> = {};
  for (const type of ['cash', 'checking']) {
    const response = await request.post('/api/accounts', {
      headers: { origin: baseURL! },
      data: {
        name: `Blatt Muster ${type} ${info.project.name} ${info.retry}`,
        type,
        openingDate: '2026-01-01',
        openingBalanceCents: 100000,
      },
    });
    expect(response.ok()).toBe(true);
    accounts[type] = ((await response.json()) as { account: { id: string } }).account.id;
  }
  const dialog = await openCapture(page);
  const phone = page.viewportSize()!.width === 390;
  for (const [type, status] of [
    ['cash', 'Bestätigt'],
    ['checking', 'Vorgemerkt'],
  ] as const) {
    await dialog.getByLabel('Bezahlt von', { exact: true }).selectOption(accounts[type]!);
    await expect(dialog.getByRole('button', { name: status, exact: true })).toHaveAttribute(
      'aria-pressed',
      String(type === 'cash'),
    );
  }
  await addManyLines(dialog);
  await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const height = await page.evaluate(() => window.visualViewport!.height);
    await saveWithin(dialog, 0, height);
    if (phone) {
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(390);
      expect(bounds.height).toBe(height);
      const small = await dialog
        .locator('button, input:not([aria-hidden="true"]), select, textarea, summary')
        .evaluateAll((els) =>
          els
            .filter((el) => el.getClientRects().length)
            .map((el) => el.getBoundingClientRect())
            .filter(({ width, height: h }) => width < 44 || h < 44)
            .map(({ width, height: h }) => ({ width, height: h })),
        );
      expect(small).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    expect(
      await dialog.locator('.bk-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    await page.screenshot({ path: info.outputPath(`capture-${theme}.png`) });
    // Scrolling the form and opening its additional fields cannot move the save action away.
    await dialog.locator('.bk-body').evaluate((el) => (el.scrollTop = 0));
    await saveWithin(dialog, 0, height);
    await dialog.getByLabel('Betrag 6', { exact: true }).fill('19');
    await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
    await saveWithin(dialog, 0, height);
    await dialog.getByLabel('Betrag 6', { exact: true }).fill('20');
  }
});

test('desktop card stays bounded and phone save follows keyboard-sized visual viewport', async ({
  page,
}) => {
  // Browser emulation cannot open a physical iPhone keyboard. Exercise native layout resize,
  // then explicitly simulate only its visual viewport resize/pan events and bounds.
  const dialog = await openCapture(page);
  if (page.viewportSize()!.width !== 390) {
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.width).toBe(960);
    expect(bounds.y).toBeGreaterThan(0);
    await saveWithin(dialog, 0, page.viewportSize()!.height);
    return;
  }
  await addManyLines(dialog);
  await page.setViewportSize({ width: 390, height: 430 });
  await saveWithin(dialog, 0, 430);
  await dialog.getByLabel('Notiz').focus();
  for (const [top, height] of [
    [0, 360],
    [80, 300],
    [120, 300],
  ]) {
    await page.evaluate(
      ({ visibleTop, visibleHeight }) => {
        const viewport = window.visualViewport!;
        Object.defineProperty(viewport, 'height', { configurable: true, value: visibleHeight });
        Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: visibleTop });
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
      },
      { visibleTop: top!, visibleHeight: height! },
    );
    await saveWithin(dialog, top!, height!);
    expect((await dialog.boundingBox())!.y).toBe(top);
    expect((await dialog.boundingBox())!.height).toBe(height);
    await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(dialog.getByRole('alertdialog')).toBeVisible();
    await saveWithin(dialog, top!, height!);
    await dialog.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
    await expect(dialog.getByLabel('Betrag', { exact: true })).toHaveValue('120,00');
  }
});
