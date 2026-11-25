// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Heute } from './api';
import { PaceBookings } from './heute-page';

afterEach(cleanup);

const pace = (bookings: Heute['pace']['bookings'], spentCents: number) =>
  ({ bookings, figures: { spentCents } }) as Heute['pace'];

it('lists the bookings of the Pace line and totals them to "Ausgegeben"', () => {
  render(
    <PaceBookings
      pace={pace(
        [
          { bookingId: 'b2', day: '2026-03-12', name: 'Spar', categoryName: 'Essen', cents: 2_550 },
          {
            bookingId: 'b1',
            day: '2026-03-05',
            name: 'Vermieter',
            categoryName: null,
            cents: 9_450,
          },
        ],
        12_000,
      )}
    />,
  );
  const table = screen.getByTestId('pace-bookings');
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent),
  ).toEqual(['Datum', 'Buchung', 'Kategorie', 'Betrag']);
  const rows = within(table).getAllByRole('row');
  expect(rows[1]!.textContent).toContain('12.03.');
  expect(rows[1]!.textContent).toContain('Spar');
  expect(rows[2]!.textContent).toContain('–');
  expect(rows.at(-1)!.textContent).toContain('Ausgegeben');
  expect(rows.at(-1)!.textContent).toContain('120,00');
});

it('says so when nothing was spent and stays hidden for older responses', () => {
  const { container, rerender } = render(<PaceBookings pace={pace([], 0)} />);
  expect(screen.getByText('Bis heute keine Ausgaben in diesem Monat.')).toBeTruthy();
  rerender(<PaceBookings pace={pace(undefined, 0)} />);
  expect(container.textContent).toBe('');
});
