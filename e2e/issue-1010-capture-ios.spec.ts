import { expect, sampleTest as test } from './sample';
import { MIN_TARGET_PX } from './ledger-helpers';

for (const width of [390, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`capture header at ${width}px in ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
      await page.goto('/?panel=buchung');
      const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
      await expect(dialog.locator('.bkform-redesign')).toBeVisible();
      if (width === 390) {
        const done = dialog.getByRole('button', { name: 'Fertig', exact: true });
        await expect(done).toBeDisabled();
        await expect(done).toHaveAccessibleDescription('Jede Zeile braucht einen Betrag.');
        await expect(dialog.locator('#booking-save-reason')).toBeInViewport({ ratio: 1 });
        await expect(dialog.getByRole('button', { name: 'Abbrechen', exact: true })).toHaveCount(1);
        await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toHaveCount(0);
        await expect(
          dialog.getByRole('button', { name: 'Speichern und neu', exact: true }),
        ).toBeVisible();
      } else {
        await expect(dialog.getByRole('button', { name: 'Fertig', exact: true })).toHaveCount(0);
        await expect(dialog.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeVisible();
        await expect(dialog.locator('#booking-save-reason')).toHaveCount(0);
      }
      const amount = dialog.getByLabel('Betrag', { exact: true });
      await amount.fill('12,50');
      await dialog.getByLabel('Empfänger', { exact: true }).fill('Musterladen');
      const category = dialog.getByLabel('Kategorie', { exact: true });
      await category.fill('Lebensmittel');
      await dialog
        .getByRole('option', { name: /^Lebensmittel/ })
        .first()
        .click();
      await amount.focus();
      if (width === 390) {
        const header = dialog.locator('.bk-editor-titlebar');
        const cancel = header.getByRole('button', { name: 'Abbrechen', exact: true });
        const done = header.getByRole('button', { name: 'Fertig', exact: true });
        const heading = header.getByRole('heading');
        const left = (await cancel.boundingBox())!;
        const middle = (await heading.boundingBox())!;
        const right = (await done.boundingBox())!;
        expect(left.x + left.width).toBeLessThanOrEqual(middle.x);
        expect(middle.x + middle.width).toBeLessThanOrEqual(right.x);
        for (const name of ['Markierung: keine', 'Datei anhängen', 'Foto aufnehmen']) {
          const icon = header.getByRole('button', { name, exact: true });
          await expect(icon).toBeVisible();
          const box = (await icon.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        }
      }
      await amount.focus();
      await page.screenshot({ path: info.outputPath(`capture-${width}-${theme}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`expression keys follow the mobile keyboard in ${theme}`, async ({
    page,
    isMobile,
  }, info) => {
    const width = 390;
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
    await page.goto('/?panel=buchung');
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    const amount = dialog.getByLabel('Betrag', { exact: true });
    await amount.fill('12,50');
    const done = dialog.getByRole('button', { name: 'Fertig', exact: true });
    const plus = dialog.getByRole('button', { name: 'Plus', exact: true });
    if (isMobile) await plus.tap();
    else await plus.click();
    await expect(amount).toBeFocused();
    await amount.pressSequentially('3,25');
    await expect(amount).toHaveValue('12,50+3,25');
    await expect(dialog.getByText(/= 15,75/)).toBeVisible();
    await page.setViewportSize({ width, height: 430 });
    const keys = dialog.getByRole('group', { name: 'Rechenzeichen', exact: true });
    await expect(keys).toBeInViewport({ ratio: 1 });
    const box = (await keys.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(430);
    await page.screenshot({ path: info.outputPath(`capture-${width}-${theme}-keyboard.png`) });
    await page.setViewportSize({ width, height: 900 });
    // iOS changes only the visual viewport when its keyboard opens and pans the page.
    await page.evaluate(() => {
      for (const [key, value] of Object.entries({ offsetTop: 40, height: 390 }))
        Object.defineProperty(visualViewport!, key, { configurable: true, value });
      visualViewport!.dispatchEvent(new Event('resize'));
      visualViewport!.dispatchEvent(new Event('scroll'));
    });
    await expect(dialog.locator('.bk-foot')).toBeHidden();
    await expect(done).toBeInViewport({ ratio: 1 });
    const pannedKeys = (await keys.boundingBox())!;
    expect(pannedKeys.y).toBeGreaterThanOrEqual(40);
    expect(pannedKeys.y + pannedKeys.height).toBeLessThanOrEqual(430);
    // Blurring the amount on pointerdown must not move the segment before click.
    const transfer = dialog.getByRole('button', { name: 'Umbuchung', exact: true });
    if (isMobile) await transfer.tap();
    else await transfer.click();
    await expect(dialog.getByLabel('Nach Konto', { exact: true })).toBeVisible();
    await expect(keys).toBeHidden();
    await expect(
      dialog.getByRole('button', { name: 'Speichern und neu', exact: true }),
    ).toBeVisible();
    await expect(dialog.locator('.kmore > summary')).toBeVisible();
    await dialog.getByRole('button', { name: 'Ausgabe', exact: true }).click();
    await amount.focus();
    await page.evaluate(() => {
      for (const key of ['offsetTop', 'height']) Reflect.deleteProperty(visualViewport!, key);
      visualViewport!.dispatchEvent(new Event('resize'));
    });
    const payee = dialog.getByLabel('Empfänger', { exact: true });
    if (isMobile) await payee.tap();
    else await payee.click();
    await expect(amount).toHaveValue('15,75');
    await expect(keys).toBeHidden();
  });
}
