import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test';
import { MAIN_URL } from '../playwright.config';

test.use({ reducedMotion: 'reduce' });
async function fixture(request: APIRequestContext, info: TestInfo) {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${MAIN_URL}/api${path}`, {
      headers: { origin: MAIN_URL },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const today = (await (await request.get(`${MAIN_URL}/api/accounts`)).json()).asOf as string;
  const name = `Prüffonds ${info.project.name}-${info.retry}`;
  const security = (await post('/securities', { name, kind: 'fund', currency: 'CHF' })).security;
  const account = (
    await post('/accounts', {
      name: `Prüfdepot ${info.project.name}-${info.retry}`,
      type: 'brokerage',
      currency: 'CHF',
      openingDate: today,
      openingBalanceCents: 0,
    })
  ).account;
  const plan = (
    await post('/savings-plans', {
      securityId: security.id,
      accountId: account.id,
      amountCents: 10000,
      dayOfMonth: Number(today.slice(8)),
      validFrom: `${today.slice(0, 7)}-01`,
    })
  ).plan;
  return { security, account, plan, today, name };
}

test('monthly confirmation rejects a stale proposal, then confirms and undoes with the keyboard', async ({
  page,
  request,
}, info) => {
  test.setTimeout(90000);
  const data = await fixture(request, info);
  await page.goto('/konten/posteingang');
  const row = page.getByTestId('inbox-row').filter({ hasText: data.name });
  const opener = row.getByRole('button', { name: 'Ausführung prüfen', exact: true });
  await expect(opener).toBeVisible();
  await opener.focus();
  await opener.press('Enter');
  const panel = page.getByRole('dialog');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(panel.getByLabel('Anlagekonto', { exact: true })).toBeDisabled();
  await expect(panel.getByLabel('Instrument', { exact: true })).toBeDisabled();
  await panel.getByLabel('Stück', { exact: true }).fill('2');
  const changed = await request.patch(`${MAIN_URL}/api/savings-plans/${data.plan.id}`, {
    headers: { origin: MAIN_URL },
    data: { amountCents: 20000, from: `${data.today.slice(0, 7)}-01` },
  });
  expect(changed.ok()).toBe(true);
  await panel.getByRole('button', { name: 'Ausführung bestätigen', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('nicht mehr aktuell');
  await expect(panel.getByLabel('Stück', { exact: true })).toHaveValue('2');
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.reload();
  await opener.click();
  await panel.getByLabel('Stück', { exact: true }).fill('4');
  await panel.getByLabel('Gebühren (CHF)', { exact: true }).fill('1');
  await panel.getByLabel('Bruttobetrag (CHF)', { exact: true }).fill('199');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`confirmation-${theme}.png`),
      animations: 'disabled',
    });
  }
  const submit = panel.getByRole('button', { name: 'Ausführung bestätigen', exact: true });
  await submit.focus();
  await submit.press('Enter');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(row).toHaveCount(0);
  const trades = async () =>
    (await (await request.get(`${MAIN_URL}/api/trades?security=${data.security.id}`)).json())
      .trades;
  expect(await trades()).toMatchObject([
    { kind: 'buy', amountCents: 19900, feeCents: 100, unitsE8: 400000000 },
  ]);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(opener).toBeVisible();
  expect(await trades()).toEqual([]);
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.goto(`/vermoegen/portfolio?produkt=${data.security.id}`);
  const trade = (await trades())[0];
  await page
    .locator(`[data-trade-id="${trade.id}"]`)
    .getByRole('button', { name: /bearbeiten/i })
    .click();
  await panel.getByRole('button', { name: 'Handel löschen', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Kontobuchung');
  await panel.getByRole('button', { name: 'Löschen bestätigen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: data.name, exact: true })).toBeVisible();
  await expect(page.locator(`[data-trade-id="${trade.id}"]`)).toHaveCount(0);
  await expect.poll(trades).toEqual([]);
  await page.getByRole('dialog').getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.locator(`[data-trade-id="${trade.id}"]`)).toBeVisible();
});
