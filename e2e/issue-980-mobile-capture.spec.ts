import { expect, sampleTest as test } from './sample';
import { expectScreenshot } from './visual';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const theme of ['light', 'dark'] as const) {
  test(`mobile inset capture keeps inline suggestions bounded in ${theme}`, async ({
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
    const bounded = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
        page.viewportSize()!.width,
      );
      expect(
        await dialog.locator('.bk-body').evaluate((el) => el.scrollWidth === el.clientWidth),
      ).toBe(true);
      const list = dialog.getByRole('listbox');
      await expect(list).toHaveCSS('position', 'static');
      const box = (await list.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(box.height).toBeLessThanOrEqual(220);
      const input = dialog.locator('input[aria-expanded="true"]');
      const row = (await input.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(row.y + row.height);
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
    await expect(amount).toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');
    await expect(payee).toHaveAttribute('placeholder', 'Empfänger wählen');
    await expect(category).toHaveAttribute('placeholder', 'Kategorie wählen');
    await expect(save).toBeDisabled();
    await expect(dialog.getByText('Jede Zeile braucht einen Betrag.')).toHaveCount(0);
    await screenshot('empty');
    await payee.tap();
    await payee.fill('Muster');
    await bounded();
    await expect(payee).toHaveCSS('outline-style', 'none');
    await screenshot('payee');
    await page.setViewportSize({ width: 375, height: 844 });
    await bounded();
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.getByRole('listbox').getByRole('option').last().click();
    await category.tap();
    await category.fill('e');
    await bounded();
    await screenshot('category');
    await page.setViewportSize({ width: 900, height: 844 });
    await expect(dialog.locator('.is-capture-inline')).toHaveCount(0);
    await category.focus();
    await expect(dialog.getByRole('listbox')).toHaveCSS('position', 'fixed');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog.locator('.is-capture-inline')).toHaveCount(2);
    await category.focus();
    await bounded();
    // A reduced viewport models the space left by the keyboard; focus must keep results open.
    await page.setViewportSize({ width: 375, height: 430 });
    await bounded();
    const listBox = (await dialog.getByRole('listbox').boundingBox())!;
    const bodyBox = (await dialog.locator('.bk-body').boundingBox())!;
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(bodyBox.y + bodyBox.height + 1);
    await dialog.getByRole('listbox').getByRole('option').first().click();
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
