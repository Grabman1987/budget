import { expect, it } from 'vitest';
import { projectUpcomingRegister } from './register-upcoming';

it('projects future bookings and only the next unbooked recurrence per account in cents', () => {
  const rows = projectUpcomingRegister(
    [
      { id: 'future', accountId: 'a', date: '2026-10-27', amountCents: -1234, currency: 'EUR' },
      { id: 'today', accountId: 'a', date: '2026-10-13', amountCents: -99, currency: 'EUR' },
      { id: 'other', accountId: 'b', date: '2026-10-20', amountCents: 101, currency: 'USD' },
    ],
    [
      {
        id: 'later',
        paymentId: 'weekly',
        accountId: 'a',
        date: '2026-10-26',
        amountCents: -203,
        currency: 'EUR',
        bookingId: null,
        status: 'expected',
      },
      {
        id: 'next',
        paymentId: 'weekly',
        accountId: 'a',
        date: '2026-10-19',
        amountCents: -203,
        currency: 'EUR',
        bookingId: null,
        status: 'expected',
      },
      {
        id: 'booked',
        paymentId: 'monthly',
        accountId: 'a',
        date: '2026-10-15',
        amountCents: -1234,
        currency: 'EUR',
        bookingId: 'future',
        status: 'received',
      },
      {
        id: 'skipped',
        paymentId: 'weekly',
        accountId: 'a',
        date: '2026-10-14',
        amountCents: -203,
        currency: 'EUR',
        bookingId: null,
        status: 'skipped',
      },
      {
        id: 'fx',
        paymentId: 'fx',
        accountId: 'a',
        date: '2026-10-21',
        amountCents: -501,
        currency: 'USD',
        bookingId: null,
        status: 'expected',
      },
    ],
    [
      { id: 'a', balanceCents: 100000, currency: 'EUR' },
      { id: 'b', balanceCents: 5000, currency: 'USD' },
    ],
    '2026-10-13',
  );
  expect(rows).toEqual([
    { id: 'next', kind: 'schedule', date: '2026-10-19', balanceAfterCents: 99797 },
    { id: 'other', kind: 'booking', date: '2026-10-20', balanceAfterCents: 5101 },
    { id: 'fx', kind: 'schedule', date: '2026-10-21', balanceAfterCents: null },
    { id: 'future', kind: 'booking', date: '2026-10-27', balanceAfterCents: null },
  ]);
});

it('moves a booking into history on its date and retains a recurrence due today', () => {
  expect(
    projectUpcomingRegister(
      [{ id: 'arrived', accountId: 'a', date: '2026-10-13', amountCents: -100, currency: 'EUR' }],
      [
        {
          id: 'due',
          paymentId: 'p',
          accountId: 'a',
          date: '2026-10-13',
          amountCents: -203,
          currency: 'EUR',
          bookingId: null,
          status: 'expected',
        },
      ],
      [{ id: 'a', balanceCents: 99900, currency: 'EUR' }],
      '2026-10-13',
    ),
  ).toEqual([{ id: 'due', kind: 'schedule', date: '2026-10-13', balanceAfterCents: 99697 }]);
});
