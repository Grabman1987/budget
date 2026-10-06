import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('stored terms show results first, live extra repayment and principal progress', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const response = await request.post(`${origin}/api/accounts`, {
    headers: { origin },
    data: {
      name: 'Kredit Beispiel',
      type: 'loan',
      openingDate: '2026-10-01',
      openingBalanceCents: -10000,
      interestRateBp: 1200,
      installmentCents: 6000,
      monthlyFeeCents: 0,
      originalAmountCents: 20000,
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/vermoegen/schulden');
  await expect(page.getByRole('heading', { name: 'Schuldenfrei am 30.11.2026' })).toBeVisible();
  const overview = page.getByRole('region', { name: 'Schuldenfrei am 30.11.2026' });
  await expect(overview).toContainText('Noch zu zahlende Zinsen 1,41 €');
  await expect(page.getByRole('progressbar', { name: 'Tilgungsfortschritt' })).toHaveAttribute(
    'value',
    '10000',
  );
  await expect(page.getByRole('progressbar')).toHaveAttribute('max', '20000');
  await expect(page.getByText('Rechenweg', { exact: true }).locator('..')).not.toHaveAttribute(
    'open',
  );
  await page.getByText('Konditionen anpassen', { exact: true }).click();
  await expect(page.getByLabel('Monatsrate (EUR) – Kredit Beispiel')).toHaveValue('60,00');
  await expect(page.getByLabel('Nominaler Jahreszins (%) – Kredit Beispiel')).toHaveValue('12,00');
  await page.getByLabel('+ Sondertilgung/Monat (EUR)').fill('50');
  await expect(page.getByRole('heading', { name: 'Schuldenfrei am 31.10.2026' })).toBeVisible();
  await expect(page.locator('.debt-overview')).toContainText('0,41 € Zinsen gespart');
  await page.getByLabel('+ Sondertilgung/Monat (EUR)').fill('-1');
  await expect(page.getByRole('alert')).toContainText('Betrag ab 0');
  await expect(page.getByRole('heading', { name: 'Schuldenfrei am …' })).toBeVisible();
  await page.getByLabel('+ Sondertilgung/Monat (EUR)').fill('50');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset['theme'] = t;
    }, theme);
    expect((await new AxeBuilder({ page }).include('.debts-view').analyze()).violations).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`debts-result-${theme}.png`), fullPage: true });
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Schuldenfrei am 30.11.2026' })).toBeVisible();
  await expect(page.getByLabel('+ Sondertilgung/Monat (EUR)')).toHaveValue('0');
  // A missing card installment must suppress the household payoff date, not assume full repayment.
  expect(
    (
      await request.post(`${origin}/api/accounts`, {
        headers: { origin },
        data: {
          name: 'Karte Beispiel',
          type: 'credit_card',
          openingDate: '2026-10-01',
          openingBalanceCents: -3000,
          interestRateBp: 0,
          monthlyFeeCents: 0,
        },
      })
    ).ok(),
  ).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Schuldenfrei am …' })).toBeVisible();
  await expect(page.locator('.debt-overview')).toContainText('Konditionen fehlen');
  await page.getByText('Konditionen anpassen', { exact: true }).click();
  await page.getByLabel('Monatsrate (EUR) – Karte Beispiel').fill('10');
  await expect(page.getByRole('heading', { name: 'Schuldenfrei am 31.12.2026' })).toBeVisible();
});
