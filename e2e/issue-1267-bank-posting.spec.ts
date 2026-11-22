import { randomUUID } from 'node:crypto';
import { openDatabase, schema } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { withShellControls } from './shell-actions';

test('account head shows stored bank balance, difference and privacy without adjusting the ledger', async ({
  page,
  isolatedLedger,
}) => {
  const { origin, databasePath } = isolatedLedger;
  const response = await page.request.post(`${origin}/api/accounts`, {
    headers: { origin },
    data: {
      name: 'Giro Muster',
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 9901,
    },
  });
  expect(response.ok()).toBe(true);
  const { account } = await response.json();
  const opened = openDatabase(databasePath);
  try {
    const consentId = randomUUID();
    opened.db
      .insert(schema.bankSyncConsent)
      .values({
        id: consentId,
        initiator: 'synthetic',
        stateHash: consentId,
        expiresAt: '2027-01-01T00:00:00Z',
        nextRunAt: '2027-01-01T00:00:00Z',
        label: 'Bank Muster',
        status: 'paused',
      })
      .run();
    opened.db
      .insert(schema.bankSyncAccount)
      .values({
        id: randomUUID(),
        consentId,
        secret: 'synthetic',
        label: 'Konto Muster',
        accountId: account.id,
        currency: 'EUR',
        balanceCents: 10001,
        balanceDate: '2026-10-01',
        balanceFetchedAt: '2026-10-02T10:00:00Z',
      })
      .run();
  } finally {
    opened.close();
  }
  await page.goto(`/konten/${account.id}`);
  await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
  const observation = page.getByLabel('Bankstand', { exact: true });
  await expect(observation).toContainText('Bankstand 100,01 € · abgerufen');
  await expect(observation.locator('time')).toHaveAttribute('datetime', '2026-10-02T10:00:00Z');
  await expect(observation.locator('time')).toContainText('12:00:00');
  await expect(observation).toContainText('Differenz zum App-Saldo +1,00 €');
  await expect(page.getByTestId('account-balance')).toHaveText('99,01 €');
  await expect(observation.getByRole('link', { name: 'Prüfen' })).toHaveAttribute(
    'href',
    /\/konten\/pruefen/,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('account-bank-balance.png'),
    fullPage: true,
  });
  await withShellControls(page, async ({ privacy }) => privacy.click());
  await expect(observation).toContainText('Bankstand ••• €');
  await expect(observation).toContainText('Differenz zum App-Saldo ••• €');
  await expect(observation).not.toContainText('100,01');
  await expect(observation).not.toContainText('+1,00');
  const accounts = await (await page.request.get(`${origin}/api/accounts`)).json();
  expect(accounts.accounts.find((row: { id: string }) => row.id === account.id).balanceCents).toBe(
    9901,
  );
  await withShellControls(page, async ({ privacy }) => privacy.click());
  await observation.getByRole('link', { name: 'Prüfen' }).click();
  await expect(page).toHaveURL(/\/konten\/pruefen/);
});
