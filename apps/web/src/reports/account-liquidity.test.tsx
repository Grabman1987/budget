// @vitest-environment jsdom
import { accountLiquidityForecast } from '@budget/domain';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { setAmountsHidden } from '@budget/ui';
import { AccountLiquidityAlerts, AccountLiquidityTable } from './account-liquidity';

vi.mock('../ledger/booking-panel', () => ({
  BookingPanel: ({ state }: { state: unknown }) => (
    <output data-testid="transfer-draft">{JSON.stringify(state)}</output>
  ),
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
});

it('uses no space for absent warnings', () => {
  const { container } = render(<AccountLiquidityAlerts result={null} today="2026-01-30" />);
  expect(container.childElementCount).toBe(0);
});

it('shows the earliest shortfall in a single compact warning', () => {
  const result = fixture();
  const bills = result.withoutExpectedInflows.accounts[0]!;
  result.withoutExpectedInflows.accounts.unshift({
    ...bills,
    accountId: 'later',
    name: 'Later synthetic account',
    firstBelowZero: { day: '2026-02-02', index: 3, cents: -1 },
  });
  render(<AccountLiquidityAlerts result={result} today="2026-01-30" />);
  const warning = screen.getByRole('region', { name: 'Konten mit Engpass' });
  expect(warning.textContent).toContain('Konto Testkonto Rechnungen rutscht am 01.02.');
  expect(warning.textContent).not.toContain('Later synthetic account');
  expect(screen.getAllByRole('button', { name: 'Umbuchung vorbereiten' })).toHaveLength(1);
});

function fixture() {
  return accountLiquidityForecast(
    {
      startDay: '2026-01-30',
      accounts: [
        { id: 'bills', name: 'Testkonto Rechnungen', balanceCents: 10_000 },
        { id: 'spare', name: 'Testkonto Frei', balanceCents: 50_000 },
      ],
      variableMonthlyCents: 0,
      items: [
        { accountId: 'bills', day: '2026-01-31', cents: 20_000, kind: 'income', expected: true },
        {
          accountId: 'bills',
          day: '2026-02-01',
          cents: -15_001,
          kind: 'fixed',
          label: 'Testrechnung',
          expected: false,
        },
        {
          accountId: null,
          day: '2026-02-02',
          cents: -2_001,
          kind: 'fixed',
          label: 'Offene Zuordnung',
          expected: false,
          ref: { paymentId: 'unassigned', dueDate: '2026-02-02' },
        },
      ],
    },
    5,
  );
}

it('names the short account despite positive household cash and expected income, then prepares only a transfer draft', () => {
  // 10,000 - 15,001 = -5,001; household still has 42,998 without expected income.
  const result = fixture();
  expect(result.withoutExpectedInflows.household.low.cents).toBe(42_998);
  render(<AccountLiquidityAlerts result={result} today="2026-01-30" />);
  expect(screen.getByRole('region', { name: 'Konten mit Engpass' }).textContent).toContain(
    'Konto Testkonto Rechnungen rutscht am 01.02. auf −50,01 €',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Umbuchung vorbereiten' }));
  expect(JSON.parse(screen.getByTestId('transfer-draft').textContent!)).toEqual({
    mode: 'create',
    prefill: {
      kind: 'transfer',
      accountId: 'spare',
      toAccountId: 'bills',
      amount: '50,01',
      date: '2026-01-30',
    },
  });
});

it('expands the cash causes and shows expected income separately and unassigned payment edit links', () => {
  render(<AccountLiquidityTable result={fixture()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Testkonto Rechnungen' }));
  expect(
    screen.getByRole('button', { name: 'Testkonto Rechnungen' }).getAttribute('aria-expanded'),
  ).toBe('true');
  expect(screen.getByText(/Prognose mit erwarteten Eingängen: Tiefpunkt 100,00/)).toBeTruthy();
  expect(screen.getByText(/01.02. · Testrechnung · −150,01/)).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Zahlungen ohne Konto' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Zahlung bearbeiten' }).getAttribute('href')).toBe(
    '/plan/erwartet/unassigned',
  );
});

it.each([false, true])(
  'caps the transfer at the source account safe cash (later inflow: %s)',
  (laterInflow) => {
    const result = accountLiquidityForecast(
      {
        startDay: '2026-01-30',
        accounts: [
          { id: 'bills', name: 'Testkonto Rechnungen', balanceCents: 100 },
          {
            id: 'spare',
            name: 'Testkonto Frei',
            balanceCents: 400,
            ...(laterInflow ? { nextSafeInflowDay: '2026-01-31' } : {}),
          },
        ],
        variableMonthlyCents: 0,
        items: [
          { accountId: 'bills', day: '2026-02-01', cents: -600, kind: 'fixed', expected: false },
          ...(laterInflow
            ? [
                {
                  accountId: 'spare',
                  day: '2026-01-31',
                  cents: 100,
                  kind: 'income' as const,
                  expected: false,
                },
                {
                  accountId: 'spare',
                  day: '2026-02-02',
                  cents: -300,
                  kind: 'fixed' as const,
                  expected: false,
                },
              ]
            : []),
        ],
      },
      5,
    );
    render(<AccountLiquidityAlerts result={result} today="2026-01-30" />);
    fireEvent.click(screen.getByRole('button', { name: 'Umbuchung vorbereiten' }));
    // Bills: 100 - 600 = -500. Source: 400, or 400 + 100 - 300 = 200.
    // A transfer today must leave every source closing balance nonnegative.
    expect(JSON.parse(screen.getByTestId('transfer-draft').textContent!).prefill).toMatchObject({
      accountId: 'spare',
      amount: laterInflow ? '2,00' : '4,00',
    });
  },
);

it('masks account and forecast amounts in privacy mode', () => {
  setAmountsHidden(true);
  const { container } = render(<AccountLiquidityTable result={fixture()} />);
  expect(container.textContent).toContain('••• €');
  expect(container.textContent).not.toContain('150,01');
  expect(container.textContent).not.toContain('50,01');
  expect(container.textContent).not.toContain('100,00');
});

it('never prepares a transfer from a non-payment account or warns about its debt', () => {
  const result = fixture();
  // Only the card has 50,000 cents. Bills are short 5,001; card cash cannot fund that gap.
  Object.assign(result.withoutExpectedInflows.accounts[1]!, { paymentAccount: false });
  render(<AccountLiquidityAlerts result={result} today="2026-01-30" />);
  expect(
    screen.getByRole('button', { name: 'Umbuchung vorbereiten' }).hasAttribute('disabled'),
  ).toBe(true);
  cleanup();
  Object.assign(result.withoutExpectedInflows.accounts[0]!, { paymentAccount: false });
  render(<AccountLiquidityAlerts result={result} today="2026-01-30" />);
  expect(screen.queryByRole('region', { name: 'Konten mit Engpass' })).toBeNull();
});

it('shows unavailable account liquidity and offers no transfer when a required exchange rate is missing', () => {
  const result = {
    ...fixture(),
    incomplete: true,
    missingFx: [{ paymentId: 'foreign', dueDate: '2026-02-01', currency: 'USD' }],
  };
  render(<AccountLiquidityAlerts result={result} today="2026-01-30" />);
  expect(screen.getByRole('alert').textContent).toBe(
    'Kontoliquidität unvollständig: Wechselkurs fehlt.',
  );
  expect(screen.queryByRole('button', { name: 'Umbuchung vorbereiten' })).toBeNull();
  cleanup();
  render(<AccountLiquidityTable result={result} />);
  expect(screen.getByRole('alert').textContent).toBe(
    'Kontoliquidität unvollständig: Wechselkurs fehlt.',
  );
  expect(screen.queryByRole('table')).toBeNull();
});

it.each(['2026-01-30', '2026-01-31'])(
  'does not alert on a debit after the safe receipt %s',
  (day) => {
    const result = fixture();
    // Known 10,000 - 15,001 = -5,001 on February 1, after salary today/tomorrow.
    // It stays visible in the table but cannot raise the bounded Heute alert.
    result.withoutExpectedInflows.accounts[0]!.nextSafeInflowDay = day;
    render(<AccountLiquidityAlerts result={result} today="2026-01-30" />);
    expect(screen.queryByRole('region', { name: 'Konten mit Engpass' })).toBeNull();
    render(<AccountLiquidityTable result={result} />);
    expect(screen.getByText('−50,01 €')).toBeTruthy();
  },
);

it('names account, date, literal deficit and the safe receipt after the shortfall', () => {
  const result = fixture();
  // February 1: 10,000 - 15,001 = -5,001, one day before salary on February 2.
  result.withoutExpectedInflows.accounts[0]!.nextSafeInflowDay = '2026-02-02';
  render(<AccountLiquidityAlerts result={result} today="2026-01-30" />);
  expect(screen.getByRole('region', { name: 'Konten mit Engpass' }).textContent).toContain(
    'Konto Testkonto Rechnungen rutscht am 01.02. auf −50,01 € · bis zum nächsten sicheren Eingang am 02.02.',
  );
});
