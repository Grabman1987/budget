import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('shows stored debt terms, unknown freshness, type-specific limits and edit route', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const createAccount = async (data: Record<string, unknown>) => {
    const response = await request.post(`${origin}/api/accounts`, {
      headers: { origin },
      data: { openingDate: '2026-10-01', openingBalanceCents: -10_000, ...data },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).account as { id: string };
  };

  const knownLoan = await createAccount({
    name: 'Kredit Nullzins',
    type: 'loan',
    interestRateBp: 0,
    interestKind: 'fixed',
    installmentCents: 3_000,
    monthlyFeeCents: 0,
  });
  const unknownFeeLoan = await createAccount({
    name: 'Kredit ohne Gebührenangabe',
    type: 'loan',
    interestRateBp: 500,
    interestKind: null,
    installmentCents: 3_000,
    monthlyFeeCents: null,
  });
  const card = await createAccount({
    name: 'Karte mit Limit',
    type: 'credit_card',
    interestRateBp: null,
    monthlyFeeCents: null,
    creditLimitCents: 100_000,
  });
  const checking = await createAccount({
    name: 'Konto mit Disporahmen',
    type: 'checking',
    monthlyFeeCents: 0,
    overdraftLimitCents: 50_000,
  });
  const dated = await request.post(
    `${origin}/api/wealth/debts/${encodeURIComponent(knownLoan.id)}/rate-changes`,
    { headers: { origin }, data: { validFrom: '2026-10-05', rateBp: 600 } },
  );
  expect(dated.ok()).toBe(true);

  await page.goto('/vermoegen/schulden');
  const known = page.getByTestId(`debt-terms-${knownLoan.id}`);
  await expect(known.getByText('Gespeicherte Konditionen', { exact: true })).toBeVisible();
  await expect(known).toContainText(/Zinssatz\s*0,00 %/);
  await expect(known).toContainText(/Zinsart\s*fix/);
  await expect(known).toContainText(/Monatsrate\s*30,00 €/);
  await expect(known).toContainText(/Gebühr\s*0,00 €/);
  await expect(known).toContainText(/Konditionen-Datenstand\s*unbekannt/);
  await expect(known).toHaveRole('group', { name: 'Gespeicherte Konditionen Kredit Nullzins' });

  const unknownFee = page.getByTestId(`debt-terms-${unknownFeeLoan.id}`);
  await expect(unknownFee).toContainText(/Gebühr\s*unbekannt/);
  await expect(unknownFee).toContainText(/Zinsart\s*unbekannt/);
  await expect(unknownFee).toContainText(/Monatsrate\s*30,00 €/);
  await expect(unknownFee.getByRole('link', { name: 'Konditionen pflegen' })).toHaveAttribute(
    'href',
    '/einstellungen/konten',
  );
  await expect(page.getByTestId(`debt-terms-${card.id}`)).toContainText(/Kartenlimit\s*1.000,00 €/);
  await expect(page.getByTestId(`debt-terms-${card.id}`)).toContainText(/Zinssatz\s*unbekannt/);
  await expect(page.getByTestId(`debt-terms-${card.id}`)).toContainText(/Monatsrate\s*unbekannt/);
  await expect(page.getByTestId(`debt-terms-${checking.id}`)).toContainText(
    /Überziehungsrahmen\s*500,00 €/,
  );

  await page.goto(`/vermoegen/schulden?kredit=${encodeURIComponent(unknownFeeLoan.id)}`);
  await page.getByText('Rechenweg', { exact: true }).click();
  await expect(page.getByTestId('loan-missing')).toContainText('Gebühr');
  await expect(page.getByTestId('loan-baseline')).toHaveCount(0);

  await page.goto(`/vermoegen/schulden?kredit=${encodeURIComponent(knownLoan.id)}`);
  await page.getByText('Rechenweg', { exact: true }).click();
  await expect(page.getByRole('table', { name: 'Gespeicherte Zinsänderungen' })).toContainText(
    '05.10.2026',
  );

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
    await page.screenshot({
      path: info.outputPath(`debt-terms-293-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }

  await page.getByText('Konditionen anpassen', { exact: true }).click();
  await page.getByLabel('Monatsrate (EUR) – Kredit Nullzins').fill('40');
  await expect(known).toContainText(/Monatsrate\s*30,00 €/);

  await page.goto('/einstellungen/konten');
  await page.getByRole('button', { name: 'Kredit ohne Gebührenangabe bearbeiten' }).click();
  await expect(page.getByLabel('Monatliche Gebühr')).toHaveValue('');
  await page.getByLabel('Monatliche Gebühr').fill('0');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  const accountResponse = await request.get(`${origin}/api/accounts`);
  expect(accountResponse.ok()).toBe(true);
  const accountView = await accountResponse.json();
  expect(
    accountView.accounts.find((a: { id: string }) => a.id === unknownFeeLoan.id).monthlyFeeCents,
  ).toBe(0);
});
