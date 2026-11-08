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
      const save = dialog.getByRole('button', { name: 'Speichern', exact: true });
      await expect(save).toBeDisabled();
      await expect(dialog.getByRole('button', { name: 'Fertig', exact: true })).toHaveCount(0);
      if (width === 390) {
        await expect(save).toHaveAccessibleDescription('Jede Zeile braucht einen Betrag.');
        await expect(dialog.locator('#booking-save-reason')).toHaveClass('bk-save-hint');
        await expect(dialog.getByRole('button', { name: 'Abbrechen', exact: true })).toHaveCount(0);
        await expect(dialog.locator('.bk-foot')).toHaveCount(0);
        await expect(dialog.getByRole('button', { name: /^Markierung/ })).toHaveCount(0);
        await dialog.locator('.kmore > summary').click();
        await expect(dialog.getByLabel('Markierung', { exact: true })).toHaveCount(0);
        await dialog.locator('.kmore > summary').click();
        await expect(dialog.locator('.bk-body .bk-form-actions')).toContainText(
          'Speichern und neu',
        );
        await expect(save).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      } else {
        await expect(dialog.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Markierung: keine' })).toBeVisible();
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
        const close = header.getByRole('button', { name: 'Schließen', exact: true });
        const heading = header.getByRole('heading');
        const left = (await heading.boundingBox())!;
        const right = (await close.boundingBox())!;
        expect(left.x + left.width).toBeLessThanOrEqual(right.x);
        for (const name of ['Schließen', 'Datei anhängen', 'Foto aufnehmen']) {
          const icon = header.getByRole('button', { name, exact: true });
          await expect(icon).toBeVisible();
          const box = (await icon.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        }
        const kinds = dialog.getByRole('group', { name: 'Art der Buchung' });
        const kindBox = (await kinds.boundingBox())!;
        expect(kindBox.y + kindBox.height).toBeLessThanOrEqual((await amount.boundingBox())!.y);
        await expect(dialog.locator('.bk-cols')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(save).toBeEnabled();
        await expect(save).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await page.setViewportSize({ width, height: 430 });
        await save.scrollIntoViewIfNeeded();
        const before = (await save.boundingBox())!.y;
        const scrolled = await dialog.locator('.bk-body').evaluate((el) => el.scrollTop);
        expect(scrolled).toBeGreaterThan(0);
        await dialog.locator('.bk-body').evaluate((el) => {
          el.scrollTop = 0;
        });
        expect((await save.boundingBox())!.y).toBeGreaterThan(before);
        await page.setViewportSize({ width, height: 900 });
        await close.click();
        await expect(
          dialog.getByRole('alertdialog', { name: 'Eingaben verwerfen?' }),
        ).toBeVisible();
        await dialog.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
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
    const done = dialog.getByRole('button', { name: 'Buchung speichern', exact: true });
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

for (const width of [320, 390, 767]) {
  test(`amount fits while typing and kind bubble slides at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?panel=buchung');
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    const amount = dialog.getByLabel('Betrag', { exact: true });
    await page.evaluate(() => document.fonts.ready);
    await amount.fill('');
    for (const digit of '760123456789') {
      await amount.pressSequentially(digit);
      await expect
        .poll(() =>
          amount.evaluate((el: HTMLInputElement) => ({
            scroll: el.scrollLeft,
            fits: el.scrollWidth <= el.clientWidth,
          })),
        )
        .toEqual({ scroll: 0, fits: true });
    }
    await expect(amount).toHaveValue('7601234567,89');
    await amount.fill('123456789012345678901234567890,12');
    await expect.poll(() => amount.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await amount.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(
      44,
    );
    expect(
      await dialog.locator('.bk-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await amount.fill('12,50+3,25');
    await expect.poll(() => amount.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const kinds = dialog.getByRole('group', { name: 'Art der Buchung' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const bubble = () =>
      kinds.evaluate((el) => {
        const style = getComputedStyle(el, '::before');
        return {
          x: new DOMMatrixReadOnly(style.transform).m41,
          duration: style.transitionDuration,
        };
      });
    expect((await bubble()).duration).toBe('0.2s');
    await kinds.getByRole('button', { name: 'Einnahme' }).click();
    await expect(kinds.getByRole('button', { name: 'Einnahme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const segmentWidth = (await kinds.boundingBox())!.width / 3;
    await expect.poll(async () => Math.round((await bubble()).x)).toBe(Math.round(segmentWidth));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await kinds.getByRole('button', { name: 'Umbuchung' }).click();
    expect((await bubble()).duration).toBe('0s');
    expect(Math.round((await bubble()).x)).toBe(Math.round(segmentWidth * 2));
    for (const button of await kinds.getByRole('button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
    await amount.fill('');
    await expect(
      dialog.getByRole('button', { name: 'Buchung speichern', exact: true }),
    ).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
  });
}

test('keyboard check saves a valid phone draft and Undo restores it', async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await dialog.getByRole('button', { name: 'Einnahme', exact: true }).click();
  const amount = dialog.getByLabel('Betrag', { exact: true });
  await amount.fill('1,23');
  await page.setViewportSize({ width: 390, height: 430 });
  const save = dialog.getByRole('button', { name: 'Buchung speichern', exact: true });
  await expect(save).toBeEnabled();
  await expect(save).toBeInViewport({ ratio: 1 });
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/bookings') && r.request().method() === 'POST',
  );
  if (isMobile) await save.tap();
  else await save.click();
  expect((await response).ok()).toBe(true);
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Rückgängig' })).toBeVisible();
});
