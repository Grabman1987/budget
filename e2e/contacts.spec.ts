import AxeBuilder from '@axe-core/playwright';
import { addDays } from '@budget/domain';
import { expect, test as mainTest, type APIRequestContext, type Page } from '@playwright/test';
import { MAIN_URL } from '../playwright.config';
import { contactsTest } from './contacts-sample';
import { toast } from './ledger-helpers';
import { expectScreenshot } from './visual';

/**
 * Konten › Kontakte. The contacts server (sample ledger plus the opt-in contacts scenario, today
 * 17.09.2026) shows the derived balances; the main server takes the writes with entities of their
 * own. Runs at 1440 px (desktop project) and 390 px (mobile project).
 */

const serious = (violations: Array<{ impact?: string | null }>) =>
  violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
const contactRow = (page: Page, name: string) =>
  page.getByTestId('contact-row').filter({ hasText: name });
const open = async (page: Page, name: string) => {
  await contactRow(page, name).getByRole('button', { name }).click();
  const panel = page.getByRole('dialog', { name });
  await expect(panel).toBeVisible();
  return panel;
};

contactsTest(
  'the contacts list shows balance, open items and the expected 30 days',
  async ({ page }) => {
    await page.goto('/konten/kontakte');
    await expect(page.getByRole('link', { name: 'Kontakte' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // 82,27 € (L. Beispiel) + 27,50 € (M. Muster); the employer owes nothing.
    await expect(page.getByTestId('contacts-summary')).toHaveText('109,77 € offen · 3 Kontakte');
    await expect(page.getByTestId('contact-row')).toHaveCount(3);

    const lena = contactRow(page, 'Kontakt L. Beispiel');
    await expect(lena.locator('.cc-saldo')).toContainText('82,27 €');
    await expect(lena.locator('.cc-open')).toContainText('4');
    await expect(lena.locator('.cc-expected')).toContainText('12,99 € weitergereicht');
    await expect(lena).toContainText('Forderung');

    const muster = contactRow(page, 'Kontakt M. Muster');
    await expect(muster.locator('.cc-saldo')).toContainText('27,50 €');
    await expect(muster.locator('.cc-expected')).toContainText('800,00 €');

    const employer = contactRow(page, 'Arbeitgeber');
    await expect(employer.locator('.cc-saldo')).toContainText('0,00 €');
    await expect(employer).toContainText('ausgeglichen');
    await expect(page.getByTestId('contacts-saldo')).toHaveText('109,77 €');
  },
);

contactsTest(
  'an Auslage lowers the net worth, the receivable is not added to it',
  async ({ page }) => {
    // 84.730,00 € on the shared sample server; here 159,77 € were paid out and 50,00 € came back.
    await page.goto('/konten');
    await expect(page.getByTestId('net-worth')).toHaveText('84.620,23 €');
    await expect(page.getByRole('row', { name: /Forderungen/ })).toHaveCount(0);
  },
);

contactsTest(
  'the Kontoblatt: monthly statement, open items, outlook, month paging',
  async ({ page }) => {
    await page.goto('/konten/kontakte');
    const panel = await open(page, 'Kontakt L. Beispiel');
    await expect(panel.getByTestId('contact-balance')).toHaveText('82,27 €');

    // September: nothing booked, the receivable is carried over.
    await expect(panel.getByRole('group', { name: /Maßkette Kontoblatt 2026-09/ })).toContainText(
      '82,27 €',
    );
    await expect(panel.getByTestId('statement-difference')).toHaveText(
      'Differenz im Monat: 0,00 €',
    );

    // August: offen 80,88 € + neu 51,39 € − bezahlt 50,00 € = 82,27 €.
    await panel.getByRole('button', { name: 'Vormonat' }).click();
    await expect(panel.getByRole('group', { name: /Maßkette Kontoblatt 2026-08/ })).toContainText(
      '80,88 €',
    );
    await expect(panel.getByTestId('statement-difference')).toHaveText(
      'Differenz im Monat: +1,39 €',
    );
    const rows = panel.getByTestId('sheet-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Essen Geburtstag');
    await expect(rows.nth(0)).toContainText('+38,40 €');
    await expect(rows.nth(2)).toContainText('Rückzahlung');
    await expect(rows.nth(2)).toContainText('−50,00 €');
    await expect(rows.nth(2).locator('.cm-run')).toHaveText('82,27 €');
    await panel.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(panel.getByRole('button', { name: 'Nächster Monat' })).toBeDisabled();

    // FIFO: the 50,00 € repayment settled the oldest items; four are left, oldest first.
    const items = panel.getByTestId('open-item');
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toContainText('Baumarkt Einkauf');
    await expect(items.nth(0)).toContainText('17,89 €');
    await expect(items.nth(0)).toContainText('von 54,90 €');
    await expect(items.nth(3)).toContainText('Video-Abo August');

    // The passed-through subscription of the 20th is expected.
    const outlook = panel.getByTestId('outlook-line');
    await expect(outlook).toHaveCount(1);
    await expect(outlook).toContainText('Video-Abo (Kontakt)');
    await expect(outlook).toContainText('weitergereicht · erwartet');
    await expect(outlook).toContainText('12,99 €');

    // The hint says how a repayment would land.
    await panel.getByLabel('Betrag').fill('20');
    await expect(panel.getByTestId('settle-hint')).toHaveText(
      'Gleicht 1 Posten ganz und 1 Posten zum Teil aus, die ältesten zuerst.',
    );
  },
);

contactsTest('Muster: the Mietbeitrag is expected on the 1st', async ({ page }) => {
  await page.goto('/konten/kontakte');
  const panel = await open(page, 'Kontakt M. Muster');
  const line = panel.getByTestId('outlook-line');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('Beitrag zum Haushalt');
  await expect(line).toContainText('Beitrag · erwartet');
  await expect(line).toContainText('800,00 €');
});

contactsTest('Alle Buchungen can be filtered by the contact', async ({ page }) => {
  await page.goto('/konten/kontakte');
  const panel = await open(page, 'Kontakt L. Beispiel');
  await panel.getByRole('link', { name: /Alle Buchungen dieses Kontakts/ }).click();
  await expect(page).toHaveURL(/kontakt=con-lena/);
  await expect(page.getByLabel('Kontakt', { exact: true })).toHaveValue('con-lena');
  await expect(page.getByText('Baumarkt Einkauf')).toBeVisible();
  await expect(page.getByText('Rückzahlung')).toBeVisible();
  await expect(page.getByText('Getränke Feier')).toHaveCount(0);
  await expect(page.locator('.ksum').first()).toContainText('6 Buchungen');
});

for (const scheme of ['light', 'dark'] as const) {
  contactsTest.describe(`look, ${scheme}`, () => {
    contactsTest.use({ colorScheme: scheme });
    contactsTest(`baseline and axe in the ${scheme} theme`, async ({ page }) => {
      await page.goto('/konten/kontakte');
      await expect(page.getByTestId('contacts-summary')).toBeVisible();
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(serious(axe.violations)).toEqual([]);
      await expectScreenshot(page, `kontakte-${scheme}.png`, { fullPage: true });
    });

    contactsTest(
      `the Kontoblatt panel: baseline and axe in the ${scheme} theme`,
      async ({ page }) => {
        await page.goto('/konten/kontakte');
        const panel = await open(page, 'Kontakt L. Beispiel');
        await expect(panel.getByTestId('open-item')).toHaveCount(4);
        await expect(panel.getByTestId('outlook-line')).toHaveCount(1);
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(serious(axe.violations)).toEqual([]);
        await expectScreenshot(page, `kontakte-kontoblatt-${scheme}.png`);
      },
    );
  });
}

// ---------- main server: writes with entities of their own ----------

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());

async function post(request: APIRequestContext, path: string, data: unknown) {
  const res = await request.post(`/api${path}`, { data, headers: { origin: MAIN_URL } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as Record<string, { id: string }> & { groupId: string };
}

mainTest(
  'an Auslage raises the balance, an Ausgleich settles FIFO, undo takes it back',
  async ({ page }, testInfo) => {
    const tag = `${testInfo.project.name}-${Date.now().toString(36).slice(-5)}`;
    const accountName = `Giro ${tag}`;
    const name = `Kontakt ${tag}`;
    const account = (
      await post(page.request, '/accounts', {
        name: accountName,
        type: 'checking',
        openingDate: addDays(today, -60),
        openingBalanceCents: 100_000,
      })
    )['account']!;
    const contact = (await post(page.request, '/contacts', { name }))['contact']!;
    // Two Auslagen as the capture form books them (the Auslagen category is created by the API).
    for (const [daysAgo, amount] of [
      [20, 4_000],
      [5, 2_550],
    ] as const)
      await post(page.request, '/bookings', {
        type: 'booking',
        accountId: account.id,
        date: addDays(today, -daysAgo),
        amountCents: -amount,
        memo: `Auslage vor ${daysAgo} Tagen`,
        splits: [{ amountCents: -amount, contactId: contact.id }],
      });

    await page.goto('/konten/kontakte');
    const row = contactRow(page, name);
    await expect(row.locator('.cc-saldo')).toContainText('65,50 €');
    await expect(row.locator('.cc-open')).toContainText('2');

    const panel = await open(page, name);
    await expect(panel.getByTestId('contact-balance')).toHaveText('65,50 €');

    // The form checks before it books.
    await panel.getByLabel('Betrag').fill('70');
    await panel.getByRole('button', { name: 'Ausgleich buchen' }).click();
    await expect(panel.getByRole('alert')).toHaveText('Mehr als offen ist (65,50 €).');

    await panel.getByLabel('Betrag').fill('50');
    await expect(panel.getByTestId('settle-hint')).toHaveText(
      'Gleicht 1 Posten ganz und 1 Posten zum Teil aus, die ältesten zuerst.',
    );
    await panel.getByLabel('Eingegangen auf').selectOption({ label: accountName });
    await panel.getByRole('button', { name: 'Ausgleich buchen' }).click();
    await expect(toast(page)).toContainText(`Ausgleich 50,00 € von ${name} gebucht`);
    await expect(panel.getByTestId('contact-balance')).toHaveText('15,50 €');
    await expect(panel.getByTestId('open-item')).toHaveCount(1);
    await expect(panel.getByTestId('open-item')).toContainText('15,50 €');
    await expect(panel.getByTestId('open-item')).toContainText('von 25,50 €');

    // One undo takes the repayment back.
    await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
    await expect(toast(page)).toContainText('Rückgängig gemacht');
    await expect(panel.getByTestId('contact-balance')).toHaveText('65,50 €');
    await expect(panel.getByTestId('open-item')).toHaveCount(2);

    const axe = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(serious(axe.violations)).toEqual([]);
  },
);

mainTest('contacts: create, edit, delete and undo', async ({ page }, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now().toString(36).slice(-5)}`;
  const name = `Neu ${tag}`;
  await page.goto('/konten/kontakte');
  await page.getByRole('button', { name: 'Neuer Kontakt' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Neuer Kontakt' });
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  await expect(dialog.getByText('Bitte einen Namen eintragen.')).toBeVisible();
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Notiz').fill('Reise');
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  await expect(toast(page)).toContainText(`Kontakt „${name}“ angelegt`);
  const row = contactRow(page, name);
  await expect(row).toContainText('Reise');
  await expect(row).toContainText('ausgeglichen');

  const edit = await open(page, name);
  await edit.getByLabel('Notiz').fill('Wohnung');
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await expect(toast(page)).toContainText(`${name} geändert`);
  await expect(row).toContainText('Wohnung');

  await (await open(page, name)).getByRole('button', { name: 'Löschen' }).click();
  await expect(toast(page)).toContainText(`Kontakt „${name}“ gelöscht`);
  await expect(row).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row).toHaveCount(1);
});
