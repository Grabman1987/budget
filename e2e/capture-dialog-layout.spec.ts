import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

async function choose(line: Locator, label: string, search: string, option: RegExp | string) {
  await line.getByLabel(label, { exact: true }).fill(search);
  await line.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
}

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

test('capture rows, native calendar and dropdowns keep the draft on desktop and 390px', async ({
  page,
  request,
  baseURL,
  browserName,
}, info) => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const tag = `${info.project.name}${info.retry ? `-${info.retry}` : ''}`;
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
  const escapePicker = async () => {
    await dialog.evaluate((el) => {
      el.setAttribute('data-picker-cancel', 'false');
      el.addEventListener(
        'cancel',
        (event) => {
          if (event.target === el) el.setAttribute('data-picker-cancel', 'true');
        },
        { once: true, capture: true },
      );
      el.addEventListener(
        'keydown',
        (event) => {
          if ((event as KeyboardEvent).key === 'Escape' && !event.defaultPrevented)
            el.setAttribute('data-picker-cancel', 'true');
        },
        { once: true },
      );
    });
    await page.keyboard.press('Escape');
    // Headless WebKit can forward picker Escape to the native dialog instead of consuming it.
    // Preserve the Chromium popup check; verify the dirty guard for a delivered WebKit cancel.
    if (browserName === 'webkit' && (await dialog.getAttribute('data-picker-cancel')) === 'true') {
      await expect(discard).toBeVisible();
      await dialog.getByRole('button', { name: 'Weiter bearbeiten' }).click();
    }
    await expect(discard).toHaveCount(0);
    await expect(amount).toHaveValue('19,99');
  };
  await amount.fill('19,99');
  const accountSelect = dialog.getByLabel('Bezahlt von');
  await accountSelect.selectOption(account.id);
  const status = dialog.locator('.bk-status');
  await expect
    .poll(async () => {
      const [a, b] = [(await accountSelect.boundingBox())!, (await status.boundingBox())!];
      return b.x > a.x + a.width && Math.abs(b.y - a.y) < 2;
    })
    .toBe(true);
  const pending = await status.evaluate((el) => getComputedStyle(el).backgroundColor);
  await status.click();
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  expect(await status.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(pending);
  await expect(dialog.getByRole('button', { name: 'Gestern' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Heute', exact: true })).toHaveCount(0);
  await date.click();
  await escapePicker();
  await dialog.getByRole('button', { name: 'Kalender öffnen' }).click();
  await escapePicker();
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
  const receiver = dialog.getByLabel('Empfänger', { exact: true });
  await receiver.fill(payee.name.slice(0, -3));
  await dialog.getByRole('option', { name: new RegExp(payee.name) }).click();
  const category = dialog.getByLabel('Kategorie', { exact: true });
  await choose(dialog, 'Kategorie', 'Essen', /^Essen/);
  await choose(dialog, 'Kategorie', contact.name, `Für Kontakt auslegen → ${contact.name}`);
  await expect(category).toHaveValue(new RegExp(contact.name));
  await choose(dialog, 'Kategorie', 'Essen', /^Essen/);
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    expect(
      await dialog.locator('.bk-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    await dialog.locator('.bk-body').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: info.outputPath(`dialog-${theme}.png`) });
  }
  const categoryBox = (await category.boundingBox())!;
  const shareBox = (await dialog.getByRole('button', { name: 'Teilen ▾' }).boundingBox())!;
  expect(shareBox.x).toBeGreaterThan(categoryBox.x);
  expect(Math.abs(shareBox.y - categoryBox.y)).toBeLessThan(2);
  await dialog.getByRole('button', { name: '+ Weitere Kategorie' }).click();
  const first = dialog.getByRole('group', { name: 'Zeile 1', exact: true });
  const second = dialog.getByRole('group', { name: 'Zeile 2', exact: true });
  await first.getByLabel('Betrag 1', { exact: true }).fill('10,00');
  await choose(second, 'Kategorie 2', contact.name, /^Für Kontakt auslegen/);
  await second.getByLabel('Betrag 2', { exact: true }).fill('9,99');
  await dialog.getByRole('button', { name: '+ Weitere Kategorie' }).click();
  const remove = dialog.getByRole('button', { name: 'Zeile 3 entfernen' });
  const removeBox = (await remove.boundingBox())!;
  expect(removeBox.width).toBeGreaterThanOrEqual(44);
  expect(removeBox.height).toBeGreaterThanOrEqual(44);
  await remove.click();
  await expect(discard).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await accountSelect.selectOption(account.id);
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30000 });
  const stored = async () => {
    const response = await request.get(`/api/bookings?accountId=${account.id}`);
    expect(response.ok()).toBe(true);
    return (await response.json()).items as unknown[];
  };
  await expect.poll(async () => (await stored()).length).toBeGreaterThan(0);
  expect((await stored())[0]).toMatchObject({
    amountCents: -1999,
    status: 'confirmed',
    splits: [
      { categoryId: 'e2e-essen', amountCents: -1000 },
      { contactId: contact.id, amountCents: -999 },
    ],
  });
});

for (const scenario of ['category', 'outlay', 'percent', 'amount', 'several'] as const) {
  test(`booking lines: ${scenario}, exact splits and edit round trip`, async ({
    page,
    request,
    baseURL,
  }, info) => {
    test.setTimeout(Math.max(90_000, info.timeout));
    const post = async (path: string, data: unknown) => {
      const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const tag = `${info.project.name}-${scenario}-${info.retry}`;
    const { account } = await post('/accounts', {
      name: `Zeilenkonto Muster ${tag}`,
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    });
    const { contact } = await post('/contacts', { name: `Kontakt Muster ${tag}` });
    const { contact: secondContact } = await post('/contacts', { name: `Kontakt Beispiel ${tag}` });
    await page.goto(`/?panel=buchung&konto=${account.id}`);
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    const amount = dialog.getByLabel('Betrag', { exact: true });
    const category = dialog.getByLabel('Kategorie', { exact: true });
    const mobile = info.project.name !== 'desktop';
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(amount).toBeFocused({ timeout: 5_000 });
    for (const control of [dialog.locator('.bk-head'), dialog.locator('.bk-kind')]) {
      expect(await control.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await expect(category).toBeInViewport({ ratio: 1 });
    if (scenario === 'category') {
      const accountField = dialog.getByLabel('Bezahlt von');
      await expect(accountField).toBeVisible();
      await expect(dialog.getByLabel('Datum', { exact: true })).toBeVisible();
      await amount.press('Tab');
      const payeeField = dialog.getByLabel('Empfänger', { exact: true });
      await expect(payeeField).toBeFocused();
      await payeeField.press('Tab');
      await expect(accountField).toBeFocused();
    }
    if (mobile) {
      const boxes = await Promise.all(
        [amount, dialog.getByLabel('Empfänger', { exact: true }), category].map((el) =>
          el.boundingBox(),
        ),
      );
      expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
      expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
      await expect(dialog.getByLabel('Bezahlt von')).toBeVisible();
      await expect(dialog.getByLabel('Datum', { exact: true })).toBeVisible();
    }
    await amount.fill(scenario === 'percent' ? '100,01' : '120');
    await dialog.getByLabel('Empfänger', { exact: true }).fill(`Laden Muster ${tag}`);
    if (scenario === 'outlay')
      await choose(dialog, 'Kategorie', contact.name, /^Für Kontakt auslegen/);
    else await choose(dialog, 'Kategorie', 'Essen', /^Essen/);
    if (scenario === 'category') {
      const rail = dialog.getByRole('group', { name: 'Vorschläge' });
      await expect(rail.getByRole('button')).toHaveCount(4);
      await expect(rail).toHaveCSS('overflow-x', 'auto');
      const railBox = (await rail.boundingBox())!;
      expect(railBox.x).toBeGreaterThanOrEqual(0);
      expect(railBox.x + railBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      const last = rail.getByRole('button').last();
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport({ ratio: 1 });
      await rail.evaluate((el) => {
        el.scrollLeft = 0;
      });
    }

    const save = dialog.getByRole('button', { name: 'Speichern', exact: true });
    if (scenario === 'percent' || scenario === 'amount' || scenario === 'several') {
      await dialog.getByRole('button', { name: 'Teilen ▾' }).click();
      await expect(save).toBeDisabled();
      await dialog.getByLabel('Kontakt 1.1', { exact: true }).selectOption(contact.id);
      await expect(dialog.getByLabel('Anteil 1.1 (%)')).toHaveValue('50');
      if (scenario === 'percent') await dialog.getByLabel('Anteil 1.1 (%)').fill('33,33');
      else {
        await dialog
          .getByRole('group', { name: 'Anteilart 1.1', exact: true })
          .getByRole('button', { name: 'Betrag', exact: true })
          .click();
        await dialog.getByLabel('Anteil 1.1 (€)').fill('20');
      }
    }
    if (scenario === 'several') {
      await dialog.getByRole('button', { name: '+ Weitere Kategorie', exact: true }).click();
      await dialog.getByLabel('Betrag 1', { exact: true }).fill('100');
      await expect(save).toBeDisabled();
      await expect(dialog.getByRole('button', { name: 'Speichern und neu' })).toBeDisabled();
      await expect(dialog.getByText('Rest: 20,00 €', { exact: false })).toBeVisible();
      await choose(
        dialog.getByRole('group', { name: 'Zeile 2', exact: true }),
        'Kategorie 2',
        'Reise',
        /^Reise/,
      );
      await dialog.getByLabel('Betrag 2', { exact: true }).fill('20');
      await dialog.getByRole('button', { name: '+ Weiterer Kontakt', exact: true }).click();
      await dialog.getByLabel('Kontakt 1.2').selectOption(secondContact.id);
      await dialog.getByLabel('Anteil 1.2 (%)').fill('10');
      await expect(dialog.getByText('Kategorie behält 70,00 €')).toBeVisible();
    }
    await expect(save).toBeEnabled();
    await dialog.getByLabel('Bezahlt von').selectOption(account.id);
    await dialog.getByLabel('Datum', { exact: true }).fill('1.10.2026');
    await dialog.getByLabel('Datum', { exact: true }).press('Tab');
    const dateBox = (await dialog.locator('.kdate').boundingBox())!;
    const repeatBox = (await dialog.getByLabel('Wiederholen').boundingBox())!;
    expect(dateBox.width / repeatBox.width).toBeCloseTo(2, 0);
    await expect(dialog.getByRole('button', { name: 'Gestern' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Split', exact: true })).toHaveCount(0);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await dialog.locator('.bk-body').evaluate((el) => {
        el.scrollTop = 0;
      });
      // Button backgrounds transition when the theme changes; audit the completed theme.
      await dialog.evaluate(async (el) => {
        const finite = el
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
        await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()!.width,
      );
      expect(
        await dialog.locator('.bk-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      const controls = await dialog
        .locator('button, input:not([aria-hidden="true"]), select, textarea, summary')
        .evaluateAll((els) =>
          els
            .filter((el) => el.getClientRects().length)
            .map((el) => ({
              name: el.getAttribute('aria-label') ?? el.textContent,
              width: el.getBoundingClientRect().width,
              height: el.getBoundingClientRect().height,
            })),
        );
      for (const box of controls) {
        expect(box.width, box.name ?? '').toBeGreaterThanOrEqual(44);
        expect(box.height, box.name ?? '').toBeGreaterThanOrEqual(44);
      }
      expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
        [],
      );
      await page.screenshot({ path: `docs/evidence/booking-lines/${tag}-${theme}.png` });
    }
    // Enter in an ordinary input saves a valid draft; dropdown Enter remains an option pick.
    if (scenario === 'category')
      await dialog.getByLabel('Empfänger', { exact: true }).press('Enter');
    else await save.click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const stored = await request.get(`/api/bookings?accountId=${account.id}`);
    expect(stored.ok()).toBe(true);
    const booking = (await stored.json()).items[0];
    const expected =
      scenario === 'category'
        ? [{ categoryId: 'e2e-essen', amountCents: -12000 }]
        : scenario === 'outlay'
          ? [{ contactId: contact.id, amountCents: -12000 }]
          : scenario === 'percent'
            ? [
                { categoryId: 'e2e-essen', amountCents: -6668 },
                { contactId: contact.id, amountCents: -3333 },
              ]
            : scenario === 'amount'
              ? [
                  { categoryId: 'e2e-essen', amountCents: -10000 },
                  { contactId: contact.id, amountCents: -2000 },
                ]
              : [
                  { categoryId: 'e2e-essen', amountCents: -7000 },
                  { contactId: contact.id, amountCents: -2000 },
                  { contactId: secondContact.id, amountCents: -1000 },
                  { categoryId: 'e2e-reise', amountCents: -2000 },
                ];
    expect(booking.splits).toMatchObject(expected);
    await page.goto(`/konten/${account.id}`);
    await page
      .getByRole('row', { name: new RegExp(`Laden Muster ${tag}`) })
      .getByRole('button', { name: /bearbeiten/ })
      .click();
    const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
    await expect(edit.getByRole('group', { name: /^Zeile \d+$/ })).toHaveCount(expected.length);
    await edit.getByLabel('Notiz').fill('Synthetische Rundlaufnotiz');
    await edit.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(edit).toBeHidden();
    const after = (await (await request.get(`/api/bookings?accountId=${account.id}`)).json())
      .items[0];
    expect(after.splits).toEqual(booking.splits);
    expect(after.memo).toBe('Synthetische Rundlaufnotiz');
  });
}

test('cash capture confirms immediately while bank capture stays pending', async ({
  page,
  request,
  baseURL,
}, info) => {
  const create = async (type: string, name: string) => {
    const response = await request.post('/api/accounts', {
      headers: { origin: baseURL! },
      data: {
        name: `${name} ${info.project.name}`,
        type,
        role: 'budget',
        onBudget: true,
        openingDate: '2026-01-01',
        openingBalanceCents: 0,
      },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).account;
  };
  const cash = await create('cash', 'Bargeld Muster');
  const bank = await create('checking', 'Giro Status Muster');
  await page.goto(`/konten/${cash.id}?panel=buchung`);
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(dialog.getByRole('button', { name: 'Bestätigt', exact: true })).toBeDisabled();
  await dialog.getByLabel('Bezahlt von', { exact: true }).selectOption(bank.id);
  await expect(dialog.getByRole('button', { name: 'Vorgemerkt', exact: true })).toBeEnabled();
  await dialog.getByLabel('Bezahlt von', { exact: true }).selectOption(cash.id);
  const status = dialog.getByRole('button', { name: 'Bestätigt', exact: true });
  await expect(status).toBeDisabled();
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Einnahme', exact: true }).click();
  await dialog.getByLabel('Betrag', { exact: true }).fill('12,34');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).toBeHidden();
  const result = await (await request.get(`/api/bookings?accountId=${cash.id}`)).json();
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    accountId: cash.id,
    amountCents: 1234,
    status: 'confirmed',
  });
});

test('sharing before entering an amount keeps the discard guard', async ({ page }) => {
  await page.goto('/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await dialog.getByRole('button', { name: 'Teilen ▾' }).click();
  await dialog.getByLabel('Notiz').press('Escape');
  await expect(dialog.getByRole('alertdialog')).toBeVisible();
  await dialog.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(dialog).toBeHidden();
});
