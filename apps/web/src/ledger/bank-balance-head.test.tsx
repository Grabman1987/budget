// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { BankBalanceHead } from './bank-balance-head';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

const account = {
  id: 'synthetic-bank-account',
  currency: 'EUR',
  balanceCents: 9901,
  closedAt: null,
  bankBalance: {
    amountCents: 10001,
    date: '2026-10-01',
    effectiveDate: '2026-10-01',
    fetchedAt: '2026-10-02T10:00:00Z',
    reconciledThrough: null,
    canLock: false,
  },
};

afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
});

it('shows stored bank cents and retrieval time separately from the app balance, with a review link', () => {
  render(<BankBalanceHead account={account} />);
  const observation = screen.getByLabelText('Bankstand');
  expect(observation.textContent).toContain('Bankstand 100,01 € · abgerufen');
  expect(observation.querySelector('time')?.dateTime).toBe('2026-10-02T10:00:00Z');
  expect(observation.querySelector('time')?.textContent).toContain('12:00:00');
  expect(observation.textContent).toContain('Differenz zum App-Saldo +1,00 €');
  expect(screen.getByRole('link', { name: 'Prüfen' }).getAttribute('href')).toBe('/konten/pruefen');
  expect(screen.queryByRole('button')).toBeNull();
  expect(account.balanceCents).toBe(9901);
});

it('retains negative and one-cent differences and omits the difference for an exact match', () => {
  const { rerender } = render(<BankBalanceHead account={{ ...account, balanceCents: 10002 }} />);
  expect(screen.getByLabelText('Bankstand').textContent).toContain(
    'Differenz zum App-Saldo −0,01 €',
  );
  rerender(<BankBalanceHead account={{ ...account, balanceCents: 10001 }} />);
  expect(screen.getByLabelText('Bankstand').textContent).not.toContain('Differenz');
  expect(screen.queryByRole('link')).toBeNull();
});

it('masks both bank balance and difference when privacy changes live', () => {
  render(<BankBalanceHead account={account} />);
  act(() => setAmountsHidden(true));
  const observation = screen.getByLabelText('Bankstand');
  expect(observation.textContent).toContain('Bankstand ••• €');
  expect(observation.textContent).toContain('Differenz zum App-Saldo ••• €');
  expect(observation.innerHTML).not.toContain('100,01');
  expect(observation.innerHTML).not.toContain('+1,00');
  act(() => setAmountsHidden(false));
  expect(observation.textContent).toContain('Bankstand 100,01 €');
});

it('does not invent missing bank data or show a historical closed account as current', () => {
  const { rerender, container } = render(
    <BankBalanceHead account={{ ...account, bankBalance: null }} />,
  );
  expect(container.textContent).toBe('');
  rerender(
    <BankBalanceHead
      account={{ ...account, bankBalance: { ...account.bankBalance, amountCents: null } }}
    />,
  );
  expect(container.textContent).toBe('');
  rerender(<BankBalanceHead account={{ ...account, closedAt: '2026-10-02' }} />);
  expect(container.textContent).toBe('');
});

it('shows zero bank cents, an unknown fetch time and a native currency difference without FX math', () => {
  render(
    <BankBalanceHead
      account={{
        ...account,
        currency: 'USD',
        balanceCents: -1,
        bankBalance: { ...account.bankBalance, amountCents: 0, fetchedAt: null },
      }}
    />,
  );
  expect(screen.getByLabelText('Bankstand').textContent).toContain('abgerufen unbekannt');
  expect(screen.getByLabelText('Bankstand').textContent).toMatch(
    /Differenz zum App-Saldo \+USD\s0,01/,
  );
});

it('keeps a differently denominated stored balance in its native currency without subtracting it', () => {
  render(
    <BankBalanceHead
      account={{ ...account, bankBalance: { ...account.bankBalance, currency: 'USD' } }}
    />,
  );
  const observation = screen.getByLabelText('Bankstand');
  expect(observation.textContent).toMatch(/Bankstand USD\s100,01/);
  expect(observation.textContent).not.toContain('Differenz');
  expect(screen.queryByRole('link')).toBeNull();
});
