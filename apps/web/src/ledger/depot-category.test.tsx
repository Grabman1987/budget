// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { CategoryCell } from './booking-cells';
import { accountsQuery } from './queries';
import { depotTradesQuery } from './depot-queries';
import type { AccountRow, ListedBooking } from './types';
import type { TradeRow } from '../wealth/trade-api';

afterEach(cleanup);
const booking: ListedBooking = {
  id: 'settlement',
  accountId: 'depot',
  accountName: 'Testdepot',
  date: '2026-09-17',
  amountCents: -2600,
  payeeId: null,
  payeeName: null,
  memo: null,
  status: 'confirmed',
  flag: null,
  transferId: null,
  transferAccountId: null,
  transferAccountName: null,
  projectId: null,
  currency: 'EUR',
  originalAmountCents: null,
  originalCurrency: null,
  splits: [],
  balanceAfterCents: -2600,
};
function show(role: AccountRow['role'], linked: boolean, category = false, amountCents = -2600) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const account: AccountRow = {
    id: 'depot',
    name: 'Testdepot',
    role,
    type: role === 'investment' ? 'brokerage' : 'checking',
    onBudget: role === 'budget',
    currency: 'EUR',
    institutionId: null,
    openingBalanceCents: 0,
    openingDate: '2026-01-01',
    creditLimitCents: null,
    overdraftLimitCents: null,
    interestRateBp: null,
    termEnd: null,
    monthlyFeeCents: null,
    interestKind: null,
    installmentCents: null,
    termStart: null,
    originalAmountCents: null,
    sortOrder: 0,
    closedAt: null,
    note: null,
    balanceCents: -2600,
    clearedCents: -2600,
    unclearedCents: 0,
    scheduledCents: 0,
    holdingsCents: 0,
    valueEurCents: -2600,
    missingFxCurrencies: [],
    missingPriceSecurityIds: [],
    bookingCount: 1,
    pendingCount: 0,
    lastReconciledOn: null,
  };
  const trade: TradeRow = {
    id: 'trade',
    accountId: account.id,
    securityId: 's',
    date: booking.date,
    kind: 'buy',
    unitsE8: 200_000_000,
    amountCents: 2500,
    feeCents: 100,
    taxCents: 0,
    bookingId: booking.id,
    importKey: null,
    savingsPlanId: null,
    savingsMonth: null,
    note: null,
    createdAt: '2026-09-17T00:00:00Z',
    updatedAt: '2026-09-17T00:00:00Z',
    deletedAt: null,
  };
  client.setQueryData(accountsQuery().queryKey, {
    asOf: booking.date,
    accounts: [account],
    netWorthEurCents: -2600,
    missingFxCurrencies: [],
    missingPriceSecurityIds: [],
  });
  client.setQueryData(depotTradesQuery().queryKey, {
    trades: linked ? [trade] : [],
  });
  return render(
    <QueryClientProvider client={client}>
      <CategoryCell
        booking={
          category
            ? {
                ...booking,
                splits: [
                  {
                    id: 'split',
                    categoryId: 'c',
                    categoryName: 'Testkategorie',
                    amountCents: -2600,
                    memo: null,
                    contactId: null,
                    incomeTypeId: null,
                    transferId: null,
                  },
                ],
              }
            : { ...booking, amountCents }
        }
        classes={new Map()}
      />
    </QueryClientProvider>,
  );
}
it('suppresses only the warning for an actual trade settlement on an investment account', () => {
  show('investment', true);
  expect(screen.queryByText('ohne Kategorie')).toBeNull();
  expect(screen.getByText('Trade · Verrechnung')).toBeTruthy();
});
it.each([
  ['investment', false],
  ['budget', true],
] as const)('keeps uncategorized warnings for %s with linked=%s', (role, linked) => {
  show(role, linked);
  expect(screen.getByText('ohne Kategorie').classList.contains('is-none')).toBe(true);
});
it('preserves the assigned category on a trade settlement', () => {
  show('investment', true, true);
  expect(screen.getByText('Testkategorie')).toBeTruthy();
});
it('preserves the existing unassigned inflow label because it has no warning', () => {
  show('investment', true, false, 2600);
  expect(screen.getByText('Zu verteilen')).toBeTruthy();
});
