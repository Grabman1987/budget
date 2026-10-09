import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

test('explains net versus cash debts, links financing and stacks the existing loan plan', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  test.setTimeout(120_000);
  const origin = isolatedLedger.origin;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(path, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const loans: Array<{ id: string }> = [];
  for (const [name, openingBalanceCents] of [
    ['Kredit Alpha', -10_000],
    ['Kredit Beta', -20_000],
  ] as const) {
    loans.push(
      (
        await post('/api/accounts', {
          name,
          type: 'loan',
          openingDate: '2026-10-01',
          openingBalanceCents,
          interestRateBp: 0,
          installmentCents: 5_000,
          monthlyFeeCents: 0,
        })
      ).account,
    );
  }
  await post('/api/accounts', {
    name: 'Budgetkonto Muster',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 100_000,
  });
  const depot = (
    await post('/api/accounts', {
      name: 'Depot Muster',
      type: 'brokerage',
      openingDate: '2026-10-01',
      openingBalanceCents: 0,
      interestRateBp: 0,
      installmentCents: 1_000,
      monthlyFeeCents: 0,
    })
  ).account;
  const security = (
    await post('/api/securities', {
      name: 'Wertpapier Muster',
      kind: 'stock',
      currency: 'EUR',
      pricesEnabled: false,
    })
  ).security;
  await post('/api/trades', {
    accountId: depot.id,
    securityId: security.id,
    date: '2026-10-01',
    kind: 'buy',
    units: '1',
    amountCents: 5_000,
  });
  const price = await request.put(`/api/securities/${security.id}/prices/2026-10-01`, {
    headers: { origin },
    data: { price: '100' },
  });
  expect(price.ok()).toBe(true);
  const net = await (await request.get('/api/wealth/debts')).json();
  expect(net.totalEurCents).toBe(30_000);
  expect(net.accounts.map((a: { id: string }) => a.id)).toEqual(loans.map((a) => a.id));
  const cash = await (await request.get('/api/wealth/debts/strategies')).json();
  expect(cash.debts).toHaveLength(3);
  expect(cash.debts.find((a: { accountId: string }) => a.accountId === depot.id)).toMatchObject({
    balanceCents: 5_000,
  });

  const url = `/vermoegen/schulden?kredit=${loans[1]!.id}`;
  await page.goto(url);
  await expect(page.locator('.debt-overview')).toContainText(
    'positivem Nettowert und negativer Kassa',
  );
  const check = page.locator('.debt-overview .debt-liquidity-check');
  await expect(check).toContainText('werden nicht übernommen');
  const link = check.getByRole('link', { name: /Liquiditätsprognose prüfen/ });
  await expect(link).toHaveAttribute('href', '/reports/liquiditaet');
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await link.click();
  await expect(page).toHaveURL(/\/reports\/liquiditaet$/);
  await expect(
    page.getByRole('heading', { name: 'Liquiditätsprognose', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(url);
  await page.getByText('Rechenweg', { exact: true }).click();
  await expect(page.getByLabel('Kredit für das Modell')).toHaveValue(loans[1]!.id);
  await expect(page.getByTestId('debt-total')).toHaveText('300,00 €');
  const strategy = page.getByRole('region', { name: 'Tilgungsstrategie', exact: true });
  await expect(strategy).toContainText('3 Schulden');
  await expect(strategy).toContainText('negativer Kassa');
  await expect(strategy.getByRole('row', { name: /Depot Muster/ })).toContainText('50,00 €');
  await strategy.getByRole('button', { name: 'Strategien vergleichen' }).click();
  await expect(strategy).toContainText('Startschuld 350,00 €');
  await page.getByRole('button', { name: 'Modell berechnen', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Modellvergleich' })).toBeVisible();

  const lead = (await page.locator('.debt-rechenweg .vnw').boundingBox())!;
  const model = (await page.locator('.debt-assumptions').boundingBox())!;
  const summary = (await page.locator('.loan-scenarios').boundingBox())!;
  expect(model.y).toBeGreaterThanOrEqual(lead.y + lead.height);
  expect(summary.y).toBeGreaterThanOrEqual(model.y + model.height);
  for (const section of [model, summary]) {
    expect(Math.abs(section.x - lead.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(section.width - lead.width)).toBeLessThanOrEqual(1);
  }
  const comparison = page.getByRole('table', { name: 'Ohne und mit monatlicher Sondertilgung' });
  const rowY = await comparison
    .locator('tbody tr')
    .first()
    .locator('th,td')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().y));
  expect(Math.max(...rowY) - Math.min(...rowY)).toBeLessThanOrEqual(1);
  await expect(page.locator('.loan-scenarios .aside')).toContainText('Kredit Beta');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('.debts-view').analyze()).violations).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`debts-scope-${theme}.png`), fullPage: true });
  }

  const add = page.getByRole('button', { name: 'Zinsänderung erfassen', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Zinsänderung erfassen' });
  const cancelAndReadFocus = async () => {
    await add.click();
    await dialog.getByLabel('Nominaler Jahreszins (%)').fill('1');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(dialog).toBeHidden();
    return page.evaluate(() => {
      const el = document.activeElement;
      return el === document.body
        ? 'body'
        : `${el?.tagName}:${el?.getAttribute('aria-label') ?? el?.textContent}`;
    });
  };
  // Preserve the existing focus behavior against the previous column geometry.
  // The unchanged loan dialog unmounts immediately on cancel; trigger restoration is a separate gap.
  await page.locator('.debt-rechenweg .vnw').evaluate((el) => {
    (el as HTMLElement).style.gridColumn = '1';
  });
  await page.locator('.debt-assumptions').evaluate((el, project) => {
    (el as HTMLElement).style.gridColumn = project === 'mobile' ? '1 / -1' : '2';
  }, info.project.name);
  const previousFocus = await cancelAndReadFocus();
  await page.locator('.debt-rechenweg .vnw, .debt-assumptions').evaluateAll((els) => {
    for (const el of els) (el as HTMLElement).style.removeProperty('grid-column');
  });
  expect(await cancelAndReadFocus()).toBe(previousFocus);
  await expect(page.getByRole('table', { name: 'Gespeicherte Zinsänderungen' })).toHaveCount(0);
  await add.click();
  await dialog.getByLabel('Gültig ab').fill('2026-11-01');
  await dialog.getByLabel('Nominaler Jahreszins (%)').fill('1');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(toast(page)).toContainText('Zinsänderung gespeichert');
  await expect(page.getByRole('table', { name: 'Gespeicherte Zinsänderungen' })).toContainText(
    '1,00 %',
  );
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByText('Noch keine Zinsänderung erfasst.', { exact: true })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Wiederholen' }).click();
  await expect(page.getByRole('table', { name: 'Gespeicherte Zinsänderungen' })).toContainText(
    '1,00 %',
  );
  await page.reload();
  await page.getByText('Rechenweg', { exact: true }).click();
  await expect(page.getByLabel('Kredit für das Modell')).toHaveValue(loans[1]!.id);
  await expect(page.locator('.loan-scenarios .aside')).toContainText('Kredit Beta');
});
