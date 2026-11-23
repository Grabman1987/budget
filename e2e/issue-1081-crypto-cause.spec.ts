import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { withShellControls } from './shell-actions';

test('crypto warning exposes stored cause, exact unit trace and missing funding in both themes with privacy', async ({
  page,
}, info) => {
  const operation = {
    id: 'synthetic-plan',
    type: 'savings_plan',
    transactions: [
      {
        id: 'synthetic-coin-leg',
        type: 'buy',
        walletId: 'synthetic-wallet',
        flow: 'INCOMING',
        creditedAt: '2026-10-01T12:00:00Z',
        tradeId: 'synthetic-trade',
        amount: { assetId: 'synthetic-coin', currencyId: null, value: '0.00000006', cents: null },
        fee: { assetId: 'synthetic-coin', currencyId: null, value: '0.00000001', cents: null },
        balanceAfter: null,
        tradeFee: { assetId: 'synthetic-fee-token', currencyId: null, value: '0.5', cents: null },
        compensates: null,
      },
      {
        id: 'synthetic-fee-leg',
        type: 'fee',
        walletId: 'synthetic-fee-wallet',
        flow: 'OUTGOING',
        creditedAt: '2026-10-01T12:00:00Z',
        tradeId: 'synthetic-trade',
        amount: { assetId: 'synthetic-fee-token', currencyId: null, value: '0.5', cents: null },
        fee: null,
        balanceAfter: null,
        tradeFee: null,
        compensates: null,
      },
    ],
    reconciliation: {
      status: 'missing',
      refs: [{ type: 'trade', id: 'synthetic-existing-trade', kind: 'buy', date: '2026-10-01' }],
      missingLegs: [
        { key: 'currency:synthetic-eur', incoming: true, day: '2026-09-28', cents: 1234 },
      ],
    },
  };
  const entry = {
    type: 'stored',
    id: 'synthetic-crypto-warning',
    kind: 'reconciliation',
    urgent: true,
    title: 'Quellsaldo weicht ab',
    refType: 'read_source',
    refId: 'crypto',
    createdAt: '2026-10-02T12:00:00Z',
    detail: JSON.stringify({
      reason: 'difference',
      cause: 'missing_movement',
      source: '0.00000008',
      local: 3,
      scale: 8,
      key: 'asset:synthetic-coin',
      securityId: 'synthetic-security',
      fetchedAt: '2026-10-01T12:00:00Z',
      comparedOn: '2026-10-02',
      openMovementsE8: 5,
      openMovementCount: 1,
      operations: [operation],
    }),
  };
  await page.route('**/api/inbox/synthetic-crypto-warning', (route) =>
    route.fulfill({ json: { entry } }),
  );
  await page.goto('/konten/pruefen/synthetic-crypto-warning');
  const detail = page.locator('.source-inbox-detail');
  await expect(detail).toContainText('Offene Bewegungen erklären die gesamte Bestandsdifferenz.');
  await expect(detail).toContainText('Quelle beim Abgleich: 0,00000008 Einheiten');
  await expect(detail).toContainText('App beim Abgleich: 0,00000003 Einheiten');
  await expect(detail).toContainText(
    'Brutto: 0,00000006 · Gebühr: 0,00000001 · Netto-Bestandswirkung: 0,00000005',
  );
  await expect(detail).toContainText('Handelsreferenz: synthetic-trade');
  await expect(detail).toContainText(
    'Quellinstrument: synthetic-fee-token · Brutto: 0 · Gebühr: 0,5 · Netto-Bestandswirkung: −0,5',
  );
  await expect(detail).toContainText('Erfasste Gegenbewegung: Handel · 2026-10-01');
  await expect(detail).toContainText(
    'Einzahlung / Finanzierung fehlt im Abgleich: currency:synthetic-eur · 2026-09-28 · 12,34',
  );
  await expect(detail).toContainText(
    'Summe der Fiatbewegungen laut Quelle (absolut): Nicht verfügbar',
  );
  await expect(page.getByRole('link', { name: 'Datenquelle prüfen' })).toBeVisible();
  await page.reload();
  await expect(detail).toContainText('App-Stichtag: 2026-10-02');
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      ),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`crypto-cause-${info.project.name}-${theme}.png`),
      fullPage: true,
    });
  }
  await withShellControls(page, async ({ privacy }) => {
    await privacy.click();
  });
  await expect(detail.getByText('Rohdaten und Zuordnung anzeigen')).toHaveCount(0);
  await expect(detail).not.toContainText('0,00000008');
  await expect(detail).not.toContainText('0,00000006');
  await expect(detail).not.toContainText('12,34');
  await expect(detail).not.toContainText('−0,5');
  await expect(detail.locator('pre')).toHaveCount(0);
  await expect(detail).toContainText('Beträge sind ausgeblendet');
});
