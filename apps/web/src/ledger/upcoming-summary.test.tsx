import { expect, it } from 'vitest';
import type { Occurrence } from '../expected/api';
import type { ListedBooking } from './types';
import { upcomingEntries, upcomingSummary } from './upcoming-register';

const booking = (id: string, date: string, payeeName: string | null, memo: string | null = null) =>
  ({ id, date, payeeName, memo }) as ListedBooking;
const schedule = (occurrenceId: string, dueDate: string, name: string) =>
  ({ occurrenceId, dueDate, name }) as Occurrence;

it('merges bookings and schedules soonest first and names the next one in the collapsed row', () => {
  const entries = upcomingEntries({
    bookings: [booking('b2', '2026-11-01', 'Später'), booking('b1', '2026-10-20', 'Früh')],
    schedules: [schedule('o1', '2026-10-15', 'Miete')],
  });
  expect(entries.map((e) => e.id)).toEqual(['o1', 'b1', 'b2']);
  expect(upcomingSummary(3, entries[0])).toBe('3 kommend · nächste: Miete 15.10.');
  expect(
    upcomingSummary(
      1,
      upcomingEntries({ bookings: [booking('b', '2026-10-20', null, 'Notiz')], schedules: [] })[0],
    ),
  ).toBe('1 kommend · nächste: Notiz 20.10.');
  expect(
    upcomingSummary(
      1,
      upcomingEntries({ bookings: [booking('b', '2026-10-20', null)], schedules: [] })[0],
    ),
  ).toBe('1 kommend · nächste: Buchung 20.10.');
});

it('has no next part when nothing is coming', () => {
  expect(upcomingSummary(0, upcomingEntries({ bookings: [], schedules: [] })[0])).toBe('0 kommend');
});
