import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ reducedMotion: 'reduce' });
test('mixed exposure conserves current cents, preserves September history and whole-instrument editing', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(path, { headers: { origin }, data });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const classes = [];
  for (const [i, name] of ['Klasse A', 'Klasse B', 'Klasse C'].entries())
    classes.push((await post('/api/asset-classes', { name, sortOrder: i })).assetClass);
  const account = (
    await post('/api/accounts', {
      name: 'Synthetisches Depot',
      type: 'brokerage',
      openingDate: '2025-01-01',
      // Funds the buy below: depot cash counts toward the investment sum (PR3), so it must be 0.
      openingBalanceCents: 101,
    })
  ).account;
  const security = (
    await post('/api/securities', {
      name: 'Mischfonds',
      kind: 'fund',
      assetClassId: classes[0].id,
      exposureValidFrom: '2025-01-01',
      pricesEnabled: false,
    })
  ).security;
  await post('/api/trades', {
    accountId: account.id,
    securityId: security.id,
    date: '2026-09-30',
    kind: 'buy',
    units: '1',
    amountCents: 101,
  });
  expect(
    (
      await request.put(`/api/securities/${security.id}/prices/2026-09-30`, {
        headers: { origin },
        data: { price: '1.01' },
      })
    ).ok(),
  ).toBe(true);
  const weights = classes.map((cls, i) => ({
    assetClassId: cls.id,
    weightBp: [6000, 3500, 500][i],
  }));
  expect(
    (
      await request.put(`/api/securities/${security.id}/exposures`, {
        headers: { origin },
        data: { validFrom: '2026-10-02', complete: true, source: 'manual', weights },
      })
    ).ok(),
  ).toBe(true);
  const positions = await (await request.get('/api/portfolio/positions')).json();
  expect(positions.valueCents).toBe(101);
  expect(positions.classes.map((cls: { valueCents: number }) => cls.valueCents)).toEqual([
    61, 35, 5,
  ]);
  expect(positions.positions).toHaveLength(1);
  const report = (await (await request.get('/api/portfolio/allocation-report')).json()).allocation;
  expect(report.history.dates[0]).toBe('2026-09-30');
  expect(
    report.history.classes.find(
      (cls: { assetClassId: string }) => cls.assetClassId === classes[0].id,
    ).istBp[0],
  ).toBe(10000);
  await page.goto('/vermoegen/portfolio');
  await page.getByRole('button', { name: 'Mischfonds', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Mischfonds', exact: true });
  await expect(dialog).toContainText('1,01 €');
  await dialog.getByRole('button', { name: 'Stammdaten bearbeiten', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Stammdaten bearbeiten', exact: true });
  await expect(form.getByLabel('Klassenzuordnung gültig ab', { exact: true })).toHaveValue(
    '2026-10-02',
  );
  await form.getByLabel('Name', { exact: true }).fill('Mischfonds neu');
  await form.getByLabel('Klassenzuordnung gültig ab', { exact: true }).scrollIntoViewIfNeeded();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const accessibility = await new AxeBuilder({ page }).include('dialog[open]').analyze();
    expect(accessibility.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`exposure-editor-${theme}.png`),
      animations: 'disabled',
    });
  }
  await form.getByRole('button', { name: 'Stammdaten speichern', exact: true }).click();
  const renamed = page.getByRole('dialog', { name: 'Mischfonds neu', exact: true });
  await expect(renamed).toBeVisible();
  const current = (await (await request.get(`/api/securities/${security.id}/exposures`)).json())
    .exposure;
  expect(current.weights).toEqual(expect.arrayContaining(weights));
  expect(current.weights).toHaveLength(3);
  await renamed.getByRole('button', { name: 'Stammdaten bearbeiten', exact: true }).click();
  await form.getByLabel('Anlageklasse', { exact: true }).selectOption(classes[1].id);
  await form.getByLabel('Klassenzuordnung gültig ab', { exact: true }).fill('2027-01-01');
  await form.getByRole('button', { name: 'Stammdaten speichern', exact: true }).click();
  await expect(
    renamed.getByRole('button', { name: 'Stammdaten bearbeiten', exact: true }),
  ).toBeVisible();
  expect(
    (await (await request.get(`/api/securities/${security.id}/exposures`)).json()).exposure.weights,
  ).toEqual(expect.arrayContaining(weights));
  expect(
    (await (await request.get(`/api/securities/${security.id}/exposures?asOf=2027-01-01`)).json())
      .exposure.weights,
  ).toEqual([{ assetClassId: classes[1].id, weightBp: 10000 }]);
});
