import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as ReactQuery from '@tanstack/react-query';
import type { DebtAccount } from './debts-api';
import type { LoanPlanView } from './loan-planning-api';
import { DebtPlanHistory } from './debt-plan-history';

const query = vi.hoisted(() => ({ state: null as unknown }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof ReactQuery>()),
  useQuery: () => query.state,
}));

const loan = {
  id: 'loan-1',
  name: 'Kredit Muster',
  currency: 'EUR',
  openingDate: '2025-10-01',
  balanceCents: -10_000,
} as DebtAccount;
const plan: LoanPlanView = {
  accountId: loan.id,
  name: loan.name,
  currency: 'EUR',
  asOf: '2026-10-02',
  startMonth: '2026-10',
  balanceCents: 10_000,
  missing: [],
  rateChanges: [],
  scenarios: [],
  terms: {
    rateBp: 0,
    interestKind: 'fixed',
    installmentCents: 2_500,
    monthlyFeeCents: 0,
    effectiveRateBp: 0,
  },
  baseline: {
    status: 'ok',
    summary: {
      months: 4,
      payoffMonth: '2027-01',
      totalInterestCents: 0,
      totalFeeCents: 0,
      totalExtraCents: 0,
      totalPaidCents: 10_000,
    },
  },
};
const basis = { plan, history: [], expected: 12, historyAvailable: true };
const render = () =>
  renderToStaticMarkup(<DebtPlanHistory loan={loan} asOf={plan.asOf} choice={null} />);

describe('failed loan basis refresh', () => {
  it('does not display the retained old payoff and recovers when a fresh read succeeds', () => {
    query.state = {
      data: basis,
      isPending: false,
      isFetching: false,
      isSuccess: false,
      isError: true,
      error: new Error('read failed'),
      refetch: vi.fn(),
    };
    const failed = render();
    expect(failed).toContain('Kreditbasis und Monatsverlauf konnten nicht geladen werden.');
    expect(failed).not.toContain('Schuldenfrei:');
    expect(failed).not.toContain('Jänner 2027');

    query.state = {
      data: basis,
      isPending: false,
      isFetching: true,
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    expect(render()).not.toContain('Schuldenfrei:');

    query.state = {
      data: basis,
      isPending: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    const recovered = render();
    expect(recovered).toContain('Schuldenfrei:');
    expect(recovered).toContain('Jänner 2027');
  });
});
