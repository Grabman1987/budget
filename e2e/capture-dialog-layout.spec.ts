import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('capture rows, native calendar and dropdowns keep the draft on desktop and 390px', async ({
  page,
  request,
  baseURL,
}, info) => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const tag = info.project.name;
  const { account } = await post('/accounts', {
    name: `Dialog Muster ${tag}`,
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { contact } = await post('/contacts', { name: `Kontakt Beispiel ${tag}` });
  const { payee } = await post('/payees', {
    name: `Dialogladen Muster ${tag}`,
    defaultCategoryId: 'e2e-essen',
  });
  await page.goto(`/?panel=buchung&konto=${account.id}`);
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(dialog).toBeVisible();
  const amount = dialog.getByLabel('Betrag', { exact: true });
  const date = dialog.getByLabel('Datum', { exact: true });
  const discard = dialog.getByRole('alertdialog');
  await amount.fill('19,99');
  await dialog.getByLabel('Bezahlt von').selectOption(account.id);
  const status = dialog.locator('.bk-status');
  const accountBox = (await dialog.getByLabel('Bezahlt von').boundingBox())!;
  const statusBox = (await status.boundingBox())!;
  expect(statusBox.x).toBeGreaterThan(accountBox.x + accountBox.width);
  expect(Math.abs(statusBox.y - accountBox.y)).toBeLessThan(2);
  const pending = await status.evaluate((el) => getComputedStyle(el).backgroundColor);
  await status.click();
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  expect(await status.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(pending);
  await dialog.getByRole('button', { name: 'Gestern' }).click();
  await dialog.getByRole('button', { name: 'Heute', exact: true }).click();
  await date.click(); // The real user gesture invokes the native picker.
  await page.keyboard.press('Escape'); // Dismiss the picker, keeping the dirty dialog.
  await expect(discard).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Kalender öffnen' }).click();
  await page.keyboard.press('Escape');
  await expect(discard).toHaveCount(0);
  await dialog.getByLabel('Datum im Kalender').fill('2026-10-02');
  await expect(date).toHaveValue('02.10.2026');
  for (const text of ['1.10.2026', '1.10.26', '01.10.', '1.10.']) {
    await date.fill(text);
    await date.press('Tab');
    const year = text.endsWith('26')
      ? '2026'
      : new Date().toLocaleDateString('en', { year: 'numeric', timeZone: 'Europe/Vienna' });
    await expect(date).toHaveValue(`01.10.${year}`);
  }
  await dialog.getByLabel('Wiederholen').selectOption('monthly');
  const dateBox = (await date.boundingBox())!;
  const repeatBox = (await dialog.getByLabel('Wiederholen').boundingBox())!;
  expect(repeatBox.x).toBeGreaterThan(dateBox.x + dateBox.width);
  expect(Math.abs(dateBox.y - repeatBox.y)).toBeLessThan(2);
  await dialog.getByLabel('Wiederholen').selectOption('');
  const receiver = dialog.getByLabel('Empfänger');
  await receiver.fill(payee.name.slice(0, -3));
  await dialog.getByRole('option', { name: new RegExp(payee.name) }).click();
  const category = dialog.getByLabel('Kategorie', { exact: true });
  await category.fill('Essen');
  await dialog.getByRole('option', { name: /^Essen/ }).click();
  await dialog.getByLabel('Auslage für Kontakt', { exact: true }).selectOption(contact.id);
  await expect(category).toBeDisabled();
  await dialog.getByLabel('Auslage für Kontakt', { exact: true }).selectOption('');
  await receiver.focus();
  for (const key of ['n', 's', '?', 'Control+k', 'Alt+s', 'Shift+s'])
    await page.keyboard.press(key);
  await expect(amount).toHaveValue('19,99');
  await expect(receiver).toBeFocused();
  await expect(discard).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Markierung: keine' }).click();
  await dialog.getByRole('menuitemradio', { name: /Blau/ }).click();
  await expect(discard).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeInViewport();
    const controls = await dialog
      .locator('button, input, select, textarea, summary')
      .evaluateAll((els) =>
        els
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({
            name: el.getAttribute('aria-label') ?? el.tagName,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          })),
      );
    for (const box of controls) {
      expect(box.width, box.name).toBeGreaterThanOrEqual(44);
      expect(box.height, box.name).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      await dialog.locator('.bk-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    await dialog.locator('.bk-body').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      path: `docs/evidence/capture-dialog-layout/dialog-${tag}-${theme}.png`,
    });
  }
  const categoryBox = (await category.boundingBox())!;
  const contactBox = (await dialog
    .getByLabel('Auslage für Kontakt', { exact: true })
    .boundingBox())!;
  const splitBox = (await dialog
    .getByRole('button', { name: 'Split', exact: true })
    .boundingBox())!;
  expect(contactBox.x).toBeGreaterThan(categoryBox.x);
  expect(splitBox.x).toBeGreaterThan(contactBox.x);
  expect(Math.abs(contactBox.y - categoryBox.y)).toBeLessThan(2);
  expect(Math.abs(splitBox.y - categoryBox.y)).toBeLessThan(2);
  await dialog.getByRole('button', { name: 'Split', exact: true }).click();
  const first = dialog.getByRole('group', { name: 'Zeile 1', exact: true });
  const second = dialog.getByRole('group', { name: 'Zeile 2', exact: true });
  await first.getByLabel('Kategorie 1').selectOption('e2e-essen');
  await first.getByLabel('Betrag 1', { exact: true }).fill('10,00');
  await second.getByRole('button', { name: 'Kontakt', exact: true }).click();
  await second.getByLabel('Auslage für Kontakt 2').selectOption(contact.id);
  await second.getByLabel('Betrag 2', { exact: true }).fill('9,99');
  await dialog.getByRole('button', { name: 'Zeile hinzufügen' }).click();
  const remove = dialog.getByRole('button', { name: 'Zeile 3 entfernen' });
  const removeBox = (await remove.boundingBox())!;
  expect(removeBox.width).toBeGreaterThanOrEqual(44);
  expect(removeBox.height).toBeGreaterThanOrEqual(44);
  await remove.click();
  await expect(discard).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30000 });
  const response = await request.get(`/api/bookings?accountId=${account.id}`);
  expect(response.ok()).toBe(true);
  const { items } = await response.json();
  expect(items[0]).toMatchObject({
    amountCents: -1999,
    status: 'confirmed',
    splits: [
      { categoryId: 'e2e-essen', amountCents: -1000 },
      { contactId: contact.id, amountCents: -999 },
    ],
  });
});

test('only Escape, close and a genuine outside click ask to discard a dirty booking', async ({
  page,
}) => {
  await page.goto('/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await dialog.getByLabel('Betrag', { exact: true }).fill('12,34');
  for (const close of ['escape', 'button', 'outside']) {
    if (close === 'escape') await dialog.getByLabel('Notiz').press('Escape');
    else if (close === 'button') await dialog.getByRole('button', { name: 'Schließen' }).click();
    else await page.mouse.click(2, 2);
    await expect(dialog.getByRole('alertdialog')).toBeVisible();
    await dialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();
    await expect(dialog.getByRole('alertdialog')).toHaveCount(0);
    await expect(dialog.getByLabel('Betrag', { exact: true })).toHaveValue('12,34');
  }
  await dialog.getByRole('button', { name: 'Schließen' }).click();
  await dialog.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(dialog).toBeHidden();
});
