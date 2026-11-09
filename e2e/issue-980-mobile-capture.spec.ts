import { expect, sampleTest as test } from './sample';
import { expectScreenshot } from './visual';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const theme of ['light', 'dark'] as const) {
  test(`mobile inset capture keeps overlay suggestions bounded in ${theme}`, async ({
    page,
  }, info) => {
    await page.addInitScript((value) => {
      localStorage.setItem('budget-theme', value);
    }, theme);
    await page.route('**/api/payees', (route) =>
      route.fulfill({
        json: {
          payees: Array.from({ length: 8 }, (_, index) => ({
            id: `capture-synthetic-${index}`,
            name: `Musterladen ${index} mit einem besonders langen Empfängernamen`,
            defaultCategoryId: null,
            systemKind: null,
          })),
        },
      }),
    );
    await page.goto('/?panel=buchung');
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    await expect(dialog.locator('.bkform-redesign')).toBeVisible();
    const amount = dialog.getByLabel('Betrag', { exact: true });
    const payee = dialog.getByLabel('Empfänger', { exact: true });
    const category = dialog.getByLabel('Kategorie', { exact: true });
    const save = dialog.getByRole('button', { name: 'Speichern', exact: true });
    const screenshot = async (state: string) => {
      await page.screenshot({ path: info.outputPath(`capture-${theme}-${state}.png`) });
      await expectScreenshot(page, `capture-${theme}-${state}.png`);
    };
    const bounded = async (mayOpenAbove = false) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
        page.viewportSize()!.width,
      );
      expect(
        await dialog.locator('.bk-body').evaluate((el) => el.scrollWidth === el.clientWidth),
      ).toBe(true);
      const list = dialog.getByRole('listbox');
      await expect(list).toHaveCSS('position', 'fixed');
      const box = (await list.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(box.height).toBeLessThanOrEqual(220);
      const input = dialog.locator('input[aria-expanded="true"]');
      const row = (await input.boundingBox())!;
      if (mayOpenAbove && box.y < row.y) expect(box.y + box.height).toBeLessThanOrEqual(row.y);
      else expect(box.y).toBeGreaterThanOrEqual(row.y + row.height);
      const card = (await dialog.locator('.bk-cols').boundingBox())!;
      expect(box.x).toBe(card.x);
      expect(box.width).toBe(card.width);
      const viewport = await page.evaluate(() => ({
        top: visualViewport!.offsetTop,
        bottom: visualViewport!.offsetTop + visualViewport!.height,
      }));
      expect(box.y).toBeGreaterThanOrEqual(viewport.top);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.bottom);
      await expect(input).toBeFocused();
      expect(
        await list
          .locator('.combo-option > span')
          .evaluateAll((spans) =>
            spans.every((span) => getComputedStyle(span).whiteSpace === 'nowrap'),
          ),
      ).toBe(true);
    };
    await expect(amount).toHaveAttribute('inputmode', 'decimal');
    await expect(amount).not.toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');
    await expect(payee).toHaveAttribute('placeholder', 'Empfänger wählen');
    await expect(category).toHaveAttribute('placeholder', 'Kategorie wählen');
    await expect(save).toBeDisabled();
    await expect(dialog.getByText('Jede Zeile braucht einen Betrag.')).toBeVisible();
    await screenshot('empty');
    const rowPositions = () =>
      dialog.locator('.bk-cols').evaluate((card) => {
        const top = card.getBoundingClientRect().top;
        return Array.from(card.querySelectorAll('.field-row')).map(
          (row) => row.getBoundingClientRect().top - top,
        );
      });
    await payee.tap();
    const beforePayee = await rowPositions();
    await payee.fill('Muster');
    expect(await rowPositions()).toEqual(beforePayee);
    await bounded();
    await expect(payee).toHaveCSS('outline-style', 'none');
    await screenshot('payee');
    await page.setViewportSize({ width: 375, height: 844 });
    await bounded();
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.getByRole('listbox').getByRole('option').last().click();
    const beforeCategory = await rowPositions();
    await category.tap();
    await category.fill('e');
    expect(await rowPositions()).toEqual(beforeCategory);
    await bounded();
    await screenshot('category');
    await page.setViewportSize({ width: 900, height: 844 });
    await expect(dialog.locator('.is-capture-overlay')).toHaveCount(0);
    await category.focus();
    await expect(dialog.getByRole('listbox')).toHaveCSS('position', 'fixed');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog.locator('.is-capture-overlay')).toHaveCount(2);
    await category.focus();
    await bounded();
    // A reduced viewport models the space left by the keyboard; focus must keep results open.
    await page.setViewportSize({ width: 375, height: 430 });
    await bounded(true);
    const listBox = (await dialog.getByRole('listbox').boundingBox())!;
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(430);
    // iOS pans the visual viewport independently of layout when the keyboard opens.
    await page.evaluate(() => {
      for (const [key, value] of Object.entries({ offsetTop: 40, height: 300 }))
        Object.defineProperty(visualViewport!, key, { configurable: true, value });
      visualViewport!.dispatchEvent(new Event('resize'));
      visualViewport!.dispatchEvent(new Event('scroll'));
    });
    await bounded(true);
    await dialog.getByRole('listbox').getByRole('option').first().click();
    await page.evaluate(() => {
      for (const key of ['offsetTop', 'height']) Reflect.deleteProperty(visualViewport!, key);
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await amount.tap();
    await amount.pressSequentially('1234');
    await expect(amount).toHaveValue('12,34');
    await amount.press('Backspace');
    await expect(amount).toHaveValue('1,23');
    await amount.pressSequentially('4');
    await payee.tap();
    await payee.press('Escape');
    await amount.tap();
    await expect(save).toBeEnabled();
    await expect(save).toHaveCSS('opacity', '1');
    await screenshot('filled');
    await amount.focus();
    await amount.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCSS('outline-style', 'solid');
  });
}

for (const width of [390, 1440]) {
  test(`choosing a known payee suggests its recent category at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && new URL(request.url()).pathname === '/api/bookings')
        writes.push(request.url());
    });
    await page.route('**/api/payees', (route) =>
      route.fulfill({
        json: {
          payees: [
            {
              id: 'capture-history',
              name: 'Musterladen Verlauf',
              defaultCategoryId: null,
              systemKind: null,
            },
            {
              id: 'capture-default',
              name: 'Musterladen Vorgabe',
              defaultCategoryId: 'cat-lebensmittel',
              systemKind: null,
            },
          ],
        },
      }),
    );
    await page.route('**/api/bookings?*', (route) => {
      if (new URL(route.request().url()).searchParams.get('payeeId') !== 'capture-history')
        return route.continue();
      return route.fulfill({
        json: {
          items: [
            {
              id: 'capture-history-booking',
              accountId: 'acc-giro',
              amountCents: -1234,
              transferId: null,
              splits: [
                {
                  categoryId: 'cat-lebensmittel',
                  amountCents: -1234,
                  contactId: null,
                  transferId: null,
                },
              ],
            },
          ],
          total: 1,
          nextCursor: null,
          sumCents: -1234,
        },
      });
    });
    await page.goto('/?panel=buchung');
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    const payee = dialog.getByRole('combobox', { name: 'Empfänger', exact: true });
    const category = dialog.getByRole('combobox', { name: 'Kategorie', exact: true });
    await payee.fill('Musterladen Verlauf');
    await expect(category).toHaveValue('');
    await dialog.getByRole('option', { name: 'Musterladen Verlauf', exact: true }).click();
    await expect(category).toHaveValue('Lebensmittel');
    await category.fill('Freizeit');
    await dialog
      .getByRole('listbox')
      .getByRole('option', { name: /^Freizeit/ })
      .first()
      .click();
    const chosen = await category.inputValue();
    await payee.fill('Musterladen Vorgabe');
    await payee.press('Enter');
    await expect(category).toHaveValue(chosen);
    expect(writes).toEqual([]);
  });
}
