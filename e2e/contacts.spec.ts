import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('contact statement: edited allocation, excess credit, undo and retained balanced history', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const tag = `Kontakt Test ${info.project.name}-${info.retry}-${info.repeatEachIndex}`;
  const json = async (path: string, data: unknown) => {
    const response = await request.post(`${origin}/api${path}`, {
      headers: { origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const group = (await json('/categories/groups', { name: `Auslagen ${tag}` })).group;
  const advance = (
    await json('/categories', {
      name: 'Auslagen',
      groupId: group.id,
      class: null,
      kind: 'advance',
    })
  ).category;
  const created = await json('/contacts', { name: tag });
  const contactId = created.contact.id as string;
  const otherAccountNames = ['fixed EUR report', 'balanced contacts', 'mixed-currency failure'].map(
    (title) =>
      `Giro Report ${info.project.name}-${title.slice(0, 13)}-${info.retry}-${info.repeatEachIndex}`,
  );
  for (const name of otherAccountNames) {
    await json('/accounts', {
      name,
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 100000,
    });
  }
  const account = await json('/accounts', {
    name: `Giro ${tag}`,
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 100000,
  });
  const accountId = account.account.id as string;
  const today = (await (await request.get(`${origin}/api/accounts`)).json()).asOf;
  for (const [date, amountCents] of [
    ['2026-09-01', -3000],
    ['2026-09-02', -7000],
  ] as const) {
    await json('/bookings', {
      type: 'booking',
      accountId,
      date,
      amountCents,
      splits: [{ categoryId: advance.id, contactId, amountCents }],
    });
  }
  await page.goto('/konten/kontakte');
  await expect(page.getByRole('button', { name: tag, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: tag, exact: true }).click();
  const panel = page.getByRole('dialog', { name: tag });
  await expect(panel.locator('.contacts-balance')).toContainText('100,00 €');
  await panel.getByRole('button', { name: 'Rückzahlung buchen', exact: true }).click();
  const accountSelect = panel.getByLabel('Konto', { exact: true });
  await expect(accountSelect.getByRole('option')).toHaveCount(4);
  for (const name of otherAccountNames) {
    await expect(accountSelect.getByRole('option', { name, exact: true })).toHaveCount(1);
  }
  await accountSelect.selectOption(accountId);
  await expect(accountSelect).toHaveValue(accountId);
  await expect(accountSelect.getByRole('option', { selected: true })).toHaveText(`Giro ${tag}`);
  await panel.getByLabel('Datum', { exact: true }).fill(today);
  await panel.getByLabel('Rückzahlung', { exact: true }).fill('40');
  const first = panel.getByLabel(/^Auslage 1/);
  const second = panel.getByLabel(/^Auslage 2/);
  await expect(first).toHaveValue('30,00');
  await expect(second).toHaveValue('10,00');
  await first.fill('0');
  await second.fill('40');
  // Allocation validation changes the sheet geometry; wait for the valid edited state.
  await expect(first).toHaveValue('0');
  await expect(second).toHaveValue('40');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const saveReceipt = panel.getByRole('button', { name: 'Rückzahlung speichern' });
  await expect(saveReceipt).toBeEnabled();
  await saveReceipt.click();
  await expect(panel.locator('.contacts-balance')).toContainText('60,00 €');
  const readStatement = async () =>
    (await request.get(`${origin}/api/contacts/${contactId}`)).json();
  expect(
    (await readStatement()).outlays.map((o: { remainingCents: number }) => o.remainingCents),
  ).toEqual([3000, 3000]);
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(panel.locator('.contacts-balance')).toContainText('100,00 €');
  await page.locator('.toast.is-open').getByRole('button', { name: 'Wiederholen' }).click();
  await expect(panel.locator('.contacts-balance')).toContainText('60,00 €');
  await panel.getByRole('button', { name: 'Rückzahlung buchen', exact: true }).click();
  await panel.getByLabel('Konto', { exact: true }).selectOption(accountId);
  await panel.getByLabel('Rückzahlung', { exact: true }).fill('80');
  await expect(panel).toContainText('Guthaben aus dieser Rückzahlung: 20,00 €');
  await panel.getByRole('button', { name: 'Rückzahlung speichern' }).click();
  await expect(panel.locator('.contacts-balance')).toContainText('−20,00 €');
  // The undo toast closes after 6 s of real time; the axe runs and screenshots below can take
  // longer on a slow runner. The toast keeps open while the pointer is over it (documented
  // behaviour of ToastProvider), so park the pointer on it for the undo further down.
  await page.locator('.toast.is-open').hover();
  expect((await readStatement()).creditCents).toBe(2000);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
  await page.screenshot({
    path: info.outputPath(`contacts-${info.project.name}.png`),
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveCSS('--ground', '#0b3152');
  const darkAxe = await new AxeBuilder({ page }).analyze();
  expect(
    darkAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath(`contacts-${info.project.name}-dark.png`),
    fullPage: true,
  });
  // Undo both receipts, then a full repayment balances the contact while retaining its ledger.
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(panel.locator('.contacts-balance')).toContainText('60,00 €');
  await json(`/contacts/${contactId}/settlements`, { accountId, date: today, amountCents: 6000 });
  await page.reload();
  // The selected statement now survives reload through its URL, including balanced history.
  await expect(panel.locator('.contacts-balance')).toContainText('0,00 €');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page).not.toHaveURL(/kontakt=/);
  await expect(page.getByRole('button', { name: tag, exact: true })).toHaveCount(0);
  await page.getByLabel('Auch ausgeglichene Kontakte').check();
  await page.getByRole('button', { name: tag, exact: true }).click();
  await expect(panel.locator('.contacts-balance')).toContainText('0,00 €');
  await expect(panel).toContainText('Verlauf');
});
