import { captureSaveControl } from './ledger-helpers';
import { captureCloseControl } from './ledger-helpers';
import { controlBoxes, minimumControlHeight } from './control-geometry';
import {
  redesignLoaded,
  categoryLineControl,
  contactShareControl,
  MIN_TARGET_PX,
} from './ledger-helpers';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

async function choose(line: Locator, label: string, search: string, option: RegExp | string) {
  await line.getByLabel(label, { exact: true }).fill(search);
  await line.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
}

test('Escape, close and a genuine outside click discard a dirty booking at once (#1324)', async ({
  page,
}) => {
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  for (const close of ['escape', 'button', 'outside']) {
    await page.goto('/?panel=buchung');
    await dialog.getByLabel('Betrag', { exact: true }).fill('12,34');
    if (close === 'escape') await dialog.getByLabel('Notiz').press('Escape');
    else if (close === 'button') await captureCloseControl(dialog).click();
    else if (page.viewportSize()!.width < 768) {
      // #995 exposes a scrim above the redesign sheet; rollback remains full-screen.
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBe(0);
      const redesign = await redesignLoaded(page);
      expect(bounds.y).toBe(redesign ? 24 : 0);
      expect(bounds.width).toBe(page.viewportSize()!.width);
      if (redesign) await page.mouse.click(page.viewportSize()!.width / 2, 12);
      else await captureCloseControl(dialog).click();
    } else await page.mouse.click(2, 2);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  }
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
  const tag = `${info.project.name}${info.retry ? `-${info.retry}` : ''}${info.repeatEachIndex ? `-repeat-${info.repeatEachIndex}` : ''}`;
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
      await expect(dialog).toBeHidden();
      test.skip(
        true,
        'WebKit forwarded the picker Escape to the dialog, which now discards (#1324).',
      );
    }
    await expect(discard).toHaveCount(0);
    await expect(amount).toHaveValue('19,99');
  };
  await amount.fill('19,99');
  const accountSelect = dialog.getByLabel('Bezahlt von');
  await accountSelect.selectOption(account.id);
  const status = dialog.locator('.bk-status');
  if ((await redesignLoaded(page)) && page.viewportSize()!.width < 768) {
    await expect(dialog.locator('.bk-mobile-status label')).toHaveText('Status');
    await expect(status).toHaveAccessibleName('Vorgemerkt');
    expect((await status.boundingBox())!.y).toBeGreaterThan((await date.boundingBox())!.y);
  } else
    await expect
      .poll(async () => {
        const reference = (await redesignLoaded(page)) ? amount : accountSelect;
        const [a, b] = [(await reference.boundingBox())!, (await status.boundingBox())!];
        return (
          b.x > a.x + a.width &&
          ((await redesignLoaded(page))
            ? Math.abs(b.y + b.height - a.y - a.height) < 12
            : Math.abs(b.y - a.y) < 2)
        );
      })
      .toBe(true);
  const pending = await status.evaluate((el) => getComputedStyle(el).backgroundColor);
  await status.click();
  await expect(status).toHaveAttribute('aria-pressed', 'true');
  if (await redesignLoaded(page)) await expect(status).toHaveAccessibleName('Bestätigt');
  else
    expect(await status.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(pending);
  await expect(dialog.getByRole('button', { name: 'Gestern' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Heute', exact: true })).toHaveCount(0);
  await date.click();
  await expect(date).toBeFocused();
  await expect(discard).toHaveCount(0);
  await dialog.getByLabel('Datum im Kalender').click();
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
  // Leave learned payee suggestions before interacting below the phone overlay.
  await receiver.press('Tab');
  await expect(receiver).not.toBeFocused();
  // The flag is retired in the capture dialog on every viewport.
  await expect(dialog.getByRole('button', { name: /^Markierung/ })).toHaveCount(0);
  await expect(dialog.getByLabel('Markierung', { exact: true })).toHaveCount(0);
  await expect(discard).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const save = captureSaveControl(dialog);
    await expect(save).toHaveCSS(
      'background-color',
      theme === 'light' ? 'rgb(23, 71, 166)' : 'rgb(208, 244, 255)',
    );
    await expect(save).toHaveCSS(
      'color',
      theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(11, 49, 82)',
    );
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    const controls = await controlBoxes(
      dialog.locator('button, input, select, textarea, summary').filter({ visible: true }),
    );
    for (const box of controls) {
      expect(box.width, box.name).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(box.height, box.name).toBeGreaterThanOrEqual(box.minimumHeight);
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
  const shareBox = (await (await contactShareControl(dialog)).boundingBox())!;
  if (await redesignLoaded(page)) {
    expect(shareBox.y).toBeGreaterThan(categoryBox.y);
    if (page.viewportSize()!.width >= 768) expect(shareBox.x).toBeGreaterThan(categoryBox.x);
  } else {
    expect(shareBox.x).toBeGreaterThan(categoryBox.x);
    expect(Math.abs(shareBox.y - categoryBox.y)).toBeLessThan(2);
  }
  await (await categoryLineControl(dialog)).click();
  const first = dialog.getByRole('group', { name: 'Zeile 1', exact: true });
  const second = dialog.getByRole('group', { name: 'Zeile 2', exact: true });
  await first.getByLabel('Betrag 1', { exact: true }).fill('10,00');
  await choose(second, 'Kategorie 2', contact.name, `Für Kontakt auslegen → ${contact.name}`);
  await second.getByLabel('Betrag 2', { exact: true }).fill('9,99');
  await (await categoryLineControl(dialog)).click();
  const remove = dialog.getByRole('button', { name: 'Zeile 3 entfernen' });
  const removeBox = (await remove.boundingBox())!;
  expect(removeBox.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(removeBox.height).toBeGreaterThanOrEqual(await minimumControlHeight(remove));
  await remove.click();
  await expect(discard).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await accountSelect.selectOption(account.id);
  await captureSaveControl(dialog).click();
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
    const tag = `${info.project.name}-${scenario}-${info.retry}${info.repeatEachIndex ? `-repeat-${info.repeatEachIndex}` : ''}`;
    const { account } = await post('/accounts', {
      name: `Zeilenkonto Muster ${tag}`,
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    });
    const { contact } = await post('/contacts', { name: `Kontakt Muster ${tag}` });
    const { contact: secondContact } = await post('/contacts', { name: `Kontakt Beispiel ${tag}` });
    await page.goto(`/konten/${account.id}?panel=buchung`);
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
      const mobileRedesign = (await redesignLoaded(page)) && page.viewportSize()!.width < 768;
      if (mobileRedesign) {
        // Kind now precedes the amount; the focused amount also exposes its operator keys.
        for (const name of [
          'Geteilt durch',
          'Mal',
          'Minus',
          'Plus',
          'Umbuchung',
          'Einnahme',
          'Ausgabe',
        ]) {
          await page.keyboard.press('Shift+Tab');
          await expect(dialog.getByRole('button', { name, exact: true })).toBeFocused();
        }
        for (const kind of ['Einnahme', 'Umbuchung']) {
          await page.keyboard.press('Tab');
          await expect(dialog.getByRole('button', { name: kind, exact: true })).toBeFocused();
        }
        await page.keyboard.press('Tab');
        await expect(amount).toBeFocused();
      }
      await amount.press('Tab');
      if (!mobileRedesign && (await redesignLoaded(page))) {
        await expect(dialog.locator('.bk-status')).toBeFocused();
        await page.keyboard.press('Tab');
      }
      const payeeField = dialog.getByLabel('Empfänger', { exact: true });
      await expect(payeeField).toBeFocused();
      await payeeField.press('Tab');
      if (mobileRedesign) {
        await expect(category).toBeFocused();
      } else if (await redesignLoaded(page)) {
        await expect(dialog.getByLabel('Datum', { exact: true })).toBeFocused();
      } else await expect(accountField).toBeFocused();
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
      // Owner decision on #1142: no category suggestion chips in the dialog.
      await expect(dialog.getByRole('group', { name: 'Vorschläge' })).toHaveCount(0);
    }

    const save = captureSaveControl(dialog);
    if (scenario === 'percent' || scenario === 'amount' || scenario === 'several') {
      await (await contactShareControl(dialog)).click();
      await expect(save).toBeDisabled();
      await dialog.getByLabel('Kontakt 1.1', { exact: true }).selectOption(contact.id);
      await dialog
        .getByRole('group', { name: 'Anteilart 1.1', exact: true })
        .getByRole('button', { name: '%', exact: true })
        .click();
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
      await (await categoryLineControl(dialog)).click();
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
      await dialog
        .getByRole('group', { name: 'Anteilart 1.2', exact: true })
        .getByRole('button', { name: '%', exact: true })
        .click();
      await dialog.getByLabel('Anteil 1.2 (%)').fill('10');
      await expect(dialog.getByText('Kategorie trägt 100,00 € bis zur Rückzahlung')).toBeVisible();
    }
    await expect(dialog.getByLabel('Bezahlt von')).toHaveValue(account.id);
    await expect(save).toBeEnabled();
    await dialog.getByLabel('Bezahlt von').selectOption(account.id);
    await dialog.getByLabel('Datum', { exact: true }).fill('1.10.2026');
    await dialog.getByLabel('Datum', { exact: true }).press('Tab');
    const dateBox = (await dialog.locator('.kdate').boundingBox())!;
    const repeatBox = (await dialog.getByLabel('Wiederholen').boundingBox())!;
    if (await redesignLoaded(page)) {
      // Apply only the authorized touch-target minimum; retain the compact-width ceiling.
      // Any tolerance above that ceiling requires the owner's separate decision.
      expect(repeatBox.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(repeatBox.width).toBeLessThanOrEqual(Math.ceil(MIN_TARGET_PX) + 0.1);
      expect(dateBox.width).toBeGreaterThan(repeatBox.width);
    } else expect(dateBox.width / repeatBox.width).toBeCloseTo(2, 0);
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
      const controls = await controlBoxes(
        dialog
          .locator('button, input:not([aria-hidden="true"]), select, textarea, summary')
          .filter({ visible: true }),
      );
      for (const box of controls) {
        expect(box.width, box.name ?? '').toBeGreaterThanOrEqual(MIN_TARGET_PX);
        expect(box.height, box.name ?? '').toBeGreaterThanOrEqual(box.minimumHeight);
      }
      expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
        [],
      );
      await page.screenshot({ path: info.outputPath(`${tag}-${theme}.png`) });
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
    await captureSaveControl(edit).click();
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
  await captureSaveControl(dialog).click();
  await expect(dialog).toBeHidden();
  const result = await (await request.get(`/api/bookings?accountId=${cash.id}`)).json();
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    accountId: cash.id,
    amountCents: 1234,
    status: 'confirmed',
  });
});

test('sharing before entering an amount still closes with Escape without a question (#1324)', async ({
  page,
}) => {
  await page.goto('/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await (await contactShareControl(dialog)).click();
  await dialog.getByLabel('Notiz').press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('phone capture keeps all fields before actions with a reduced visual viewport and fits Undo', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(info.project.name === 'desktop', 'phone layout');
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await request.post('/api/accounts', {
    headers: { origin: baseURL! },
    data: {
      name: `Capture phone sample ${info.project.name}`,
      type: 'cash',
      openingDate: '2026-01-01',
    },
  });
  expect(response.ok()).toBe(true);
  const { account } = await response.json();
  await page.goto(`/konten/${account.id}?panel=buchung`);
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  const form = dialog.locator('.bkform-redesign');
  const focusScope = page.locator('.bk-focus-scope').filter({ has: dialog });
  await expect(form).toBeVisible();
  const upload = dialog.getByRole('button', { name: 'Datei anhängen', exact: true });
  await expect(upload).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Dokument hochladen', exact: true })).toHaveCount(
    0,
  );
  await expect(
    dialog.locator('.bk-editor-titlebar').getByRole('button', { name: 'Datei anhängen' }),
  ).toHaveCount(1);
  const chooser = page.waitForEvent('filechooser');
  await upload.click();
  expect((await chooser).isMultiple()).toBe(false);

  await dialog.getByLabel('Betrag', { exact: true }).fill('12,34');
  const payee = dialog.getByLabel('Empfänger', { exact: true });
  await payee.fill('Telefon Musterladen');
  await choose(dialog, 'Kategorie', 'Essen', /^Essen/);
  await expect(dialog.getByLabel('Bezahlt von')).toHaveValue(account.id);
  await payee.focus();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, 'height', { configurable: true, value: 590 });
    visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(focusScope).toHaveAttribute('data-compact-viewport');
  await expect(form).toHaveCSS('overflow-y', 'auto');
  await page.evaluate(() => {
    for (const [key, value] of Object.entries({ height: 390, offsetTop: 40 }))
      Object.defineProperty(visualViewport!, key, { configurable: true, value });
    visualViewport!.dispatchEvent(new Event('resize'));
    visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await expect(focusScope).toHaveAttribute('data-compact-viewport');
  await expect(form).toHaveCSS('overflow-y', 'auto');
  await expect(dialog.locator('.bk-body')).toHaveCSS('overflow-y', 'visible');
  const note = dialog.getByLabel('Notiz', { exact: true });
  const actions = dialog.locator('.bk-form-actions');
  expect((await actions.boundingBox())!.y).toBeGreaterThan((await note.boundingBox())!.y);
  expect((await actions.boundingBox())!.y).toBeGreaterThan(430);
  for (const field of [
    payee,
    dialog.getByLabel('Bezahlt von'),
    dialog.getByLabel('Kategorie', { exact: true }),
    note,
  ])
    await expect(field).toBeVisible();
  await note.focus();
  await expect
    .poll(async () => {
      const box = (await note.boundingBox())!;
      return box.y >= 40 && box.y + box.height <= 430;
    })
    .toBe(true);
  // The multiline note retains Ctrl+Enter-to-save; bare Enter still inserts a newline.
  await note.press('Control+Enter');
  await expect(dialog).toBeHidden();
  await page.evaluate(() => {
    for (const key of ['height', 'offsetTop']) Reflect.deleteProperty(visualViewport!, key);
    visualViewport!.dispatchEvent(new Event('resize'));
  });
  const toast = page.locator('.toast.is-open .toast-body');
  const undo = toast.getByRole('button', { name: 'Rückgängig', exact: true });
  // Pause expiry while measuring all supported phone widths.
  await undo.focus();
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(undo).toBeVisible();
    const outer = (await toast.boundingBox())!;
    const action = (await undo.boundingBox())!;
    expect(action.x).toBeGreaterThanOrEqual(outer.x);
    expect(action.x + action.width).toBeLessThanOrEqual(outer.x + outer.width);
    expect(action.y).toBeGreaterThanOrEqual(outer.y);
    expect(action.y + action.height).toBeLessThanOrEqual(outer.y + outer.height);
    expect(action.x).toBeGreaterThanOrEqual(0);
    expect(action.x + action.width).toBeLessThanOrEqual(width);
    expect(await undo.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const fab = await page.locator('.fab').boundingBox();
    if (fab) expect(outer.y + outer.height).toBeLessThanOrEqual(fab.y);
  }
  await undo.click();
});
