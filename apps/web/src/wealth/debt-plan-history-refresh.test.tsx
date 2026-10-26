// @vitest-environment jsdom
import { cleanup, fireEvent, render as mount, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ReactQuery from '@tanstack/react-query';
import type { SeriesPoint } from '../ledger/types';
import type { DebtAccount } from './debts-api';
import type { LoanPlanView } from './loan-planning-api';
import { DebtPlanHistory } from './debt-plan-history';

const query = vi.hoisted(() => ({ state: null as unknown }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof ReactQuery>()),
  useQuery: () => query.state,
}));
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [{ current: null }, 900] }));
afterEach(cleanup);

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
const basis: {
  plan: LoanPlanView;
  history: SeriesPoint[];
  expected: number;
  historyAvailable: boolean;
} = {
  plan,
  history: [],
  expected: 12,
  historyAvailable: true,
};
const render = () =>
  renderToStaticMarkup(<DebtPlanHistory loan={loan} asOf={plan.asOf} choice={null} />);

describe('failed loan basis refresh', () => {
  it('uses the loan currency for a monthly extra and applies it to the matching USD basis', () => {
    const usdLoan = { ...loan, currency: 'USD' };
    const usdBasis = {
      ...basis,
      plan: { ...plan, currency: 'USD' },
      history: [{ date: '2026-09-30', balanceCents: -10_000 }],
    };
    query.state = {
      data: usdBasis,
      isPending: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    mount(<DebtPlanHistory loan={usdLoan} asOf={plan.asOf} choice={null} />);
    const monthly = screen.getByLabelText('Sondertilgung / Monat (USD)');
    expect(monthly).toBeTruthy();
    fireEvent.change(monthly, { target: { value: '25' } });
    expect(screen.getByText(/2 Monate früher schuldenfrei/)).toBeTruthy();
  });

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

  it('hides the cached scenario during refresh and keeps an edited draft until a changed pair is accepted', () => {
    const ready = (data: typeof basis) => ({
      data,
      isPending: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    query.state = ready(basis);
    const view = mount(<DebtPlanHistory loan={loan} asOf={plan.asOf} choice={null} />);
    fireEvent.change(screen.getByLabelText(/Einmalige Sondertilgung/), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Monat der Einmalzahlung'), {
      target: { value: '2026-11' },
    });
    expect(screen.getByText(/Zinsen gespart/)).toBeTruthy();

    query.state = { ...ready(basis), isFetching: true };
    view.rerender(<DebtPlanHistory loan={loan} asOf={plan.asOf} choice={null} />);
    expect(screen.queryByText(/Zinsen gespart/)).toBeNull();
    query.state = {
      ...ready(basis),
      isSuccess: false,
      isError: true,
      error: new Error('read failed'),
    };
    view.rerender(<DebtPlanHistory loan={loan} asOf={plan.asOf} choice={null} />);
    expect(screen.queryByText(/Zinsen gespart/)).toBeNull();

    query.state = ready(basis);
    view.rerender(<DebtPlanHistory loan={loan} asOf={plan.asOf} choice={null} />);
    expect((screen.getByLabelText(/Einmalige Sondertilgung/) as HTMLInputElement).value).toBe('25');

    query.state = ready({ ...basis, history: [{ date: '2026-09-30', balanceCents: -10_000 }] });
    view.rerender(<DebtPlanHistory loan={loan} asOf={plan.asOf} choice={null} />);
    expect(screen.queryByText(/Zinsen gespart/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Neue Basis übernehmen/ }));
    expect((screen.getByLabelText(/Einmalige Sondertilgung/) as HTMLInputElement).value).toBe('0');
  });
});
