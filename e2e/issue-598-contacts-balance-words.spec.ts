import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

// Plus / minus roles of DESIGN.md (owner decision 1A): teal and orange, light and dark.
const ROLE = {
  light: { plus: 'rgb(11, 114, 133)', minus: 'rgb(184, 56, 10)' },
  dark: { plus: 'rgb(79, 227, 208)', minus: 'rgb(255, 157, 122)' },
} as const;

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('contacts: open first, balance in words and colour, one title, Ausgleichen in the menu', async ({
  page,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const tag = `${info.project.name}-${info.retry}-${info.repeatEachIndex}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`${origin}/api${path}`, {
      headers: { origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const group = (await post('/categories/groups', { name: `Auslagen ${tag}` })).group;
  const advance = (
    await post('/categories', { name: 'Auslagen', groupId: group.id, class: null, kind: 'advance' })
  ).category;
  const account = (
    await post('/accounts', {
      name: `Giro Muster ${tag}`,
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 100000,
    })
  ).account;
  const owes = (await post('/contacts', { name: `Kontakt Schuldner ${tag}` })).contact;
  const credit = (await post('/contacts', { name: `Kontakt Guthaben ${tag}` })).contact;
  const settled = (await post('/contacts', { name: `Kontakt Ausgeglichen ${tag}` })).contact;
  const outlay = async (contactId: string, amountCents: number) =>
    post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-10-01',
      amountCents: -amountCents,
      splits: [{ categoryId: advance.id, contactId, amountCents: -amountCents }],
    });
  const repay = async (contactId: string, amountCents: number) =>
    post(`/contacts/${contactId}/settlements`, {
      accountId: account.id,
      date: '2026-10-02',
      amountCents,
    });
  await outlay(owes.id, 4500);
  await outlay(credit.id, 3000);
  await repay(credit.id, 4200);
  await outlay(settled.id, 2000);
  await repay(settled.id, 2000);

  const phone = info.project.name !== 'desktop';
  const byName = (name: string) => page.getByRole('link', { name, exact: true });
  const balanceOf = (name: string) => page.getByRole('link', { name: new RegExp(`Saldo ${name}`) });

  await page.goto('/konten/kontakte');
  const view = page.getByRole('group', { name: 'Kontakte anzeigen' });
  await expect(view.getByRole('button', { name: 'Offen' })).toHaveAttribute('aria-pressed', 'true');
  await expect(byName(owes.name)).toBeVisible();
  await expect(byName(credit.name)).toBeVisible();
  // Settled contacts are only listed under "Alle".
  await expect(byName(settled.name)).toHaveCount(0);

  await expect(balanceOf(owes.name)).toHaveText('Schuldet dir 45,00 €');
  await expect(balanceOf(credit.name)).toHaveText('Du schuldest 12,00 €');
  await expect(page.getByRole('table', { name: 'Kontaktübersicht' })).not.toContainText('−');
  expect(await noHorizontalScroll(page)).toBe(true);

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(balanceOf(owes.name)).toHaveCSS('color', ROLE[theme].plus);
    await expect(balanceOf(credit.name)).toHaveCSS('color', ROLE[theme].minus);
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`contacts-list-${theme}.png`),
      fullPage: true,
    });
  }
  await page.emulateMedia({ colorScheme: 'light' });

  if (phone) {
    for (const target of [
      byName(owes.name),
      balanceOf(owes.name),
      page.getByRole('button', { name: `Weitere Aktionen: ${owes.name}` }),
      page.getByRole('button', { name: `${owes.name} umbenennen` }),
      view.getByRole('button', { name: 'Alle' }),
    ]) {
      const box = (await target.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
    }
  }

  // The settle action is a menu entry, not a button in the row; the settled contact has none.
  await expect(page.getByRole('button', { name: 'Ausgleichen', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: `Weitere Aktionen: ${credit.name}` }).click();
  await page.getByRole('menuitem', { name: 'Ausgleichen ohne Geldbewegung' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kontakt ausgleichen', exact: true });
  await expect(dialog.getByLabel('Betrag', { exact: true })).toHaveValue('12,00');
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(dialog).toBeHidden();
  // Nothing was booked by opening and closing the dialog.
  const statement = await (await page.request.get(`${origin}/api/contacts/${credit.id}`)).json();
  expect(statement.balanceCents).toBe(-1200);

  await view.getByRole('button', { name: 'Alle' }).click();
  await expect(page).toHaveURL(/verlauf=1/);
  await expect(balanceOf(settled.name)).toHaveText('Ausgeglichen');
  await expect(page.getByRole('button', { name: `Weitere Aktionen: ${settled.name}` })).toHaveCount(
    0,
  );
  await view.getByRole('button', { name: 'Offen' }).click();
  await expect(byName(settled.name)).toHaveCount(0);

  // The balance opens the same detail as the name.
  await byName(owes.name).click();
  await expect(page).toHaveURL(new RegExp(`/konten/kontakte/${owes.id}`));
  const detailUrl = page.url();
  await page.goBack();
  await balanceOf(owes.name).click();
  await expect(page).toHaveURL(detailUrl);

  // Detail: one title, one way back, the explanation behind the info button.
  const detail = page.getByRole('region', { name: 'Kontaktkontoauszug' });
  await expect(page.getByRole('heading', { name: owes.name, exact: true })).toHaveCount(1);
  await expect(detail.getByRole('link', { name: /^Zurück/ })).toHaveCount(1);
  await expect(detail.locator('.contacts-balance')).toHaveText('Schuldet dir 45,00 €');
  await expect(detail.getByText(/Ein Ausgleich übernimmt Guthaben/)).toHaveCount(0);
  await detail.getByRole('button', { name: 'Erläuterung zu Rückzahlung und Ausgleich' }).click();
  await expect(detail.getByText(/Ein Ausgleich übernimmt Guthaben/)).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Ausgleichen', exact: true })).toHaveCount(0);
  // History in the receivable view: the Auslage is a plus.
  const month = detail.getByRole('table', { name: 'Kontaktbuchungen im aktuellen Monat' });
  await expect(month.locator('tbody tr')).toHaveCount(1);
  await expect(month.locator('tbody .num')).toHaveText('+45,00 €');
  await detail.getByRole('button', { name: `Weitere Aktionen: ${owes.name}` }).click();
  await expect(
    detail.getByRole('menuitem', { name: 'Ausgleichen ohne Geldbewegung' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail.getByRole('menu')).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);
  if (phone) {
    for (const name of [
      'Rückzahlung buchen',
      `Weitere Aktionen: ${owes.name}`,
      'Erläuterung zu Rückzahlung und Ausgleich',
    ]) {
      const box = (await detail.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
    }
  }
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(detail.locator('.contacts-balance')).toHaveCSS('color', ROLE[theme].plus);
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`contacts-detail-${theme}.png`),
      fullPage: true,
    });
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // Credit: orange words, no minus sign on the balance; the repayment is a minus in the history.
  await page.goto(`/konten/kontakte/${credit.id}`);
  await expect(detail.locator('.contacts-balance')).toHaveText('Du schuldest 12,00 €');
  await expect(detail.locator('.contacts-balance')).toHaveCSS('color', ROLE.light.minus);
  await expect(
    detail
      .getByRole('table', { name: 'Kontaktbuchungen im aktuellen Monat' })
      .locator('tbody .num'),
  ).toHaveText(['+30,00 €', '−42,00 €']);

  // Zero: settled in words, neutral colour, no settle menu and no full-width button.
  await page.goto(`/konten/kontakte/${settled.id}?verlauf=1`);
  await expect(detail.locator('.contacts-balance')).toHaveText('Ausgeglichen 0,00 €');
  await expect(detail.getByRole('button', { name: /Weitere Aktionen/ })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: /Ausgleichen/ })).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);
});
