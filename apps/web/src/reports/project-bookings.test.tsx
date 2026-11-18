// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectBookings } from './project-bookings';

vi.mock('../shell/app-link', () => ({
  AppLink: ({
    to,
    search,
    children,
    ...props
  }: ComponentProps<'a'> & { to: string; search: Record<string, string> }) => (
    <a href={`${to}?${new URLSearchParams(search)}`} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  setAmountsHidden(false);
});

const bookings: ComponentProps<typeof ProjectBookings>['bookings'] = [
  {
    bookingId: 'income',
    date: '2026-02-01',
    payee: 'Synthetischer Auftraggeber',
    memo: 'Synthetische Notiz',
    classifications: ['Nebeneinkünfte'],
    amountCents: 5201,
  },
  {
    bookingId: 'refund',
    date: '2026-02-17',
    payee: ' ',
    memo: 'Synthetische Erstattung',
    classifications: ['Erstattungen'],
    amountCents: 211,
  },
  {
    bookingId: 'cost',
    date: '2026-02-13',
    payee: null,
    memo: null,
    classifications: ['Reise'],
    amountCents: -1107,
  },
];

it('shows newest bookings first, falls back to memo or dash and keeps the ledger link', () => {
  render(<ProjectBookings name="Synthetisches Projekt" bookings={bookings} />);
  const disclosure = screen.getByText('Buchungen (3)', { selector: 'summary' }).closest('details')!;
  disclosure.open = true;
  const table = screen.getByRole('table', { name: 'Buchungen · Synthetisches Projekt' });
  const [header, refund, cost, income] = within(table).getAllByRole('row');
  expect(
    within(header!)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent),
  ).toEqual(['Datum', 'Empfänger', 'Kategorie / Einnahmenart', 'Betrag']);
  expect(
    within(refund!)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['17.02.2026', 'Synthetische Erstattung', 'Erstattungen', '+2,11 €']);
  expect(
    within(cost!)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['13.02.2026', '–', 'Reise', '−11,07 €']);
  expect(within(income!).getByRole('link').textContent).toBe('Synthetischer Auftraggeber');
  expect(within(income!).getByRole('link').getAttribute('href')).toBe(
    '/konten/buchungen?buchung=income',
  );
  act(() => setAmountsHidden(true));
  expect(within(table).getAllByText('••• €')).toHaveLength(3);
  expect(within(table).queryByText('−11,07 €')).toBeNull();
});
