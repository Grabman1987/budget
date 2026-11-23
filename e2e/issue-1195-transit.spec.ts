import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { gotoWealthAnalysis, selectPortfolioView } from './wealth-navigation';
import { withShellControls } from './shell-actions';

test.use({ ledgerToday: '2026-11-01' });
for (const view of ['allocation', 'summary', 'depots', 'whole'])
  test(`transit remains a read-only cash bridge in ${view}`, async ({ page, isolatedLedger }) => {
    const headers = { origin: isolatedLedger.origin };
    const ids: string[] = [];
    for (const [type, openingBalanceCents] of [
      ['checking', 50000],
      ['savings', 10000],
      ['brokerage', 12345],
    ] as const) {
      const response = await page.request.post('/api/accounts', {
        headers,
        data: {
          name: `Transit Muster ${type}`,
          type,
          role: 'investment',
          onBudget: false,
          allocationScope: 'included',
          openingDate: '2026-01-01',
          openingBalanceCents,
        },
      });
      expect(response.status()).toBe(201);
      ids.push((await response.json()).account.id);
    }
    for (const amountCents of [1, -1]) {
      const response = await page.request.post('/api/bookings', {
        headers: {
          ...headers,
          'Idempotency-Key': `synthetic-transit-history-${amountCents}`,
        },
        data: {
          type: 'booking',
          accountId: ids[0],
          date: '2026-01-02',
          amountCents,
          splits: [{ amountCents }],
        },
      });
      expect(response.status()).toBe(201);
    }
    const transfer = await page.request.post('/api/bookings', {
      headers: {
        ...headers,
        'Idempotency-Key': 'synthetic-transit-1195',
      },
      data: {
        type: 'transfer',
        fromAccountId: ids[0],
        toAccountId: ids[1],
        date: '2026-10-31',
        amountCents: 10000,
        bankLegs: {
          from: { date: '2026-10-31', status: 'confirmed' },
          to: { date: '2026-11-02', status: 'pending' },
        },
      },
    });
    expect(transfer.status()).toBe(201);
    const accountRead = async () => {
      const response = await page.request.get('/api/accounts');
      expect(response.status()).toBe(200);
      return response.json();
    };
    const before = await accountRead();
    expect(
      ids.map((id) => before.accounts.find((a: { id: string }) => a.id === id).balanceCents),
    ).toEqual([40000, 10000, 12345]);
    expect(before.netWorthEurCents).toBe(72345);
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method()))
        writes.push(request.url());
    });
    if (view === 'allocation' || view === 'summary') {
      await gotoWealthAnalysis(page, '/vermoegen/portfolio');
      if (view === 'allocation') await selectPortfolioView(page, 'Allokation');
    } else {
      await page.goto(
        view === 'depots'
          ? '/reports/pdepots?zeitraum=1M'
          : '/reports/gesamtuebersicht?zeitraum=2026-11..2026-11',
      );
    }
    const line = page.getByTestId('transit-reconciliation').filter({ visible: true });
    await expect(line).toHaveCount(1);
    await expect(line.getByText('Geld unterwegs: 100,00 €', { exact: true })).toBeVisible();
    await expect(line).toContainText('Kontogeld: 500,00 €');
    await expect(line).toContainText('Kontogeld inkl. Geld unterwegs: 600,00 €');
    await expect(line).toContainText('Umfang: 2 ausgewählte Bankkonten');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
        // Settle theme color transitions so axe never samples a half-blended button.
        void getComputedStyle(document.body).color;
        document.getAnimations().forEach((animation) => animation.finish());
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const audit = await new AxeBuilder({ page }).include('main').analyze();
      expect(
        audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
      ).toEqual([]);
    }
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await expect(line).not.toContainText('100,00');
    await expect(line).not.toContainText('500,00');
    await expect(line).not.toContainText('600,00');
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await expect(line).toContainText('Geld unterwegs: 100,00 €');
    expect(writes).toEqual([]);
    expect(await accountRead()).toEqual(before);
  });
