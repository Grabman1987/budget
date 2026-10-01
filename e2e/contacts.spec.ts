import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MAIN_URL } from '../playwright.config';

test('contact statement: edited allocation, excess credit, undo and retained balanced history', async ({
  page,
  request,
}, info) => {
  const tag = `Kontakt Test ${info.project.name}`;
  const json = async (path: string, data: unknown) => {
    const response = await request.post(`${MAIN_URL}/api${path}`, {
      headers: { origin: MAIN_URL },
      data,
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const created = await json('/contacts', { name: tag });
  const contactId = created.contact.id as string;
  const account = await json('/accounts', {
    name: `Giro ${tag}`,
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 100000,
  });
  const accountId = account.account.id as string;
  const today = new Date().toISOString().slice(0, 10);
  for (const [date, amountCents] of [
    ['2026-09-01', -3000],
    ['2026-09-02', -7000],
  ] as const) {
    await json('/bookings', {
      type: 'booking',
      accountId,
      date,
      amountCents,
      splits: [{ categoryId: 'e2e-auslagen', contactId, amountCents }],
    });
  }
  await page.goto('/konten/kontakte');
  await page.getByRole('button', { name: tag, exact: true }).click();
  const panel = page.getByRole('dialog', { name: tag });
  await expect(panel.locator('.contacts-balance')).toContainText('100,00 €');
  await panel.getByRole('button', { name: 'Rückzahlung buchen', exact: true }).click();
  await panel.getByLabel('Konto', { exact: true }).selectOption(accountId);
  await panel.getByLabel('Datum', { exact: true }).fill(today);
  await panel.getByLabel('Rückzahlung', { exact: true }).fill('40');
  const first = panel.getByLabel(/^Auslage 1/);
  const second = panel.getByLabel(/^Auslage 2/);
  await expect(first).toHaveValue('30,00');
  await expect(second).toHaveValue('10,00');
  await first.fill('0');
  await second.fill('40');
  await panel.getByRole('button', { name: 'Rückzahlung speichern' }).click();
  await expect(panel.locator('.contacts-balance')).toContainText('60,00 €');
  const readStatement = async () =>
    (await request.get(`${MAIN_URL}/api/contacts/${contactId}`)).json();
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
  await expect(page.getByRole('button', { name: tag, exact: true })).toHaveCount(0);
  await page.getByLabel('Auch ausgeglichene Kontakte').check();
  await page.getByRole('button', { name: tag, exact: true }).click();
  await expect(panel.locator('.contacts-balance')).toContainText('0,00 €');
  await expect(panel).toContainText('Verlauf');
});
