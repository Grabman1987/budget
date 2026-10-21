import { projectUpcomingRegister, todayInVienna } from '@budget/domain';
import { useAmountPrivacy, useIsPhone } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { registerOccurrencesQuery, type Occurrence } from '../expected/api';
import { nativeCurrency, shortDay } from './format';
import { accountsQuery, futureBookingsQuery } from './queries';
import { ErrorNote, LoadingNote } from './states';
import type { BookingFilter, ListedBooking } from './types';

/** Re-evaluate the Vienna day while a register remains open across midnight. */
export function useRegisterToday() {
  const [today, setToday] = useState(todayInVienna);
  const qc = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      const next = todayInVienna();
      if (next !== today) {
        setToday(next);
        void qc.invalidateQueries({ queryKey: accountsQuery().queryKey });
      }
    };
    const timer = setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [today, qc]);
  return today;
}

/** What the booking table needs to show the "Kommend" section inside its own columns. */
export interface UpcomingModel {
  today: string;
  open: boolean;
  toggle: () => void;
  /** Future captures that match the filter. */
  bookings: readonly ListedBooking[];
  /** The next open occurrence of each recurring payment that matches the filter. */
  schedules: readonly Occurrence[];
  /** Projected native balance after each row, `null` when it cannot be known. */
  balances: ReadonlyMap<string, number | null>;
  count: number;
  /** Today's balance of the shown account(s). */
  balanceLabel: string;
}

export type UpcomingEntry = { date: string; id: string } & (
  { booking: ListedBooking; schedule?: undefined } | { schedule: Occurrence; booking?: undefined }
);

/** Future captures and next occurrences in one list, soonest first. */
export function upcomingEntries(
  model: Pick<UpcomingModel, 'bookings' | 'schedules'>,
): UpcomingEntry[] {
  const entries: UpcomingEntry[] = [
    ...model.bookings.map((b) => ({ date: b.date, id: b.id, booking: b })),
    ...model.schedules.map((s) => ({ date: s.dueDate, id: s.occurrenceId, schedule: s })),
  ];
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** The collapsed one-line row: `19 kommend · nächste: Miete 01.11.`. */
export function upcomingSummary(count: number, next: UpcomingEntry | undefined): string {
  if (!next) return `${count} kommend`;
  const name = next.schedule?.name ?? next.booking?.payeeName ?? next.booking?.memo ?? 'Buchung';
  return `${count} kommend · nächste: ${name} ${shortDay(next.date)}`;
}

export function useUpcomingRegister(
  filter: BookingFilter,
  today: string,
  variant: 'account' | 'all',
): { model: UpcomingModel | null; notes: ReactNode } {
  useAmountPrivacy();
  const phone = useIsPhone();
  const storageKey = `budget.register.upcoming.${variant}.${filter.accountId ?? 'all'}.${phone ? 'phone' : 'desktop'}`;
  const [remembered, setRemembered] = useState<{ key: string; open: boolean } | null>(null);
  // Collapsed by default everywhere; a remembered choice wins.
  let open = false;
  try {
    open = localStorage.getItem(storageKey) === 'open';
  } catch {
    /* Storage may be disabled. */
  }
  if (remembered?.key === storageKey) open = remembered.open;
  const accounts = useQuery({ ...accountsQuery(), queryKey: [...accountsQuery().queryKey, today] });
  const scope = filter.accountId ? { accountId: filter.accountId } : {};
  const future = useQuery(futureBookingsQuery(scope, today));
  const filtered = useQuery(futureBookingsQuery(filter, today));
  const schedules = useQuery(registerOccurrencesQuery(today));
  const rows = projectUpcomingRegister(
    future.data ?? [],
    (schedules.data ?? []).map((s) => ({
      ...s,
      id: s.occurrenceId,
      date: s.dueDate,
    })),
    accounts.data?.accounts ?? [],
    today,
  );
  const bookingIds = new Set(filtered.data?.map((b) => b.id));
  const scheduled = (schedules.data ?? []).filter(
    (s) =>
      (!filter.accountId || s.accountId === filter.accountId) &&
      (!filter.categoryId ||
        s.categoryId === filter.categoryId ||
        (filter.categoryId === 'none' && !s.categoryId)) &&
      (!filter.payeeId || s.payeeId === filter.payeeId) &&
      (!filter.from || s.dueDate >= filter.from) &&
      (!filter.to || s.dueDate <= filter.to) &&
      !filter.id &&
      !filter.status &&
      !filter.flag &&
      (!filter.q ||
        [s.name, s.accountName, s.categoryName, s.payeeName]
          .join(' ')
          .toLocaleLowerCase('de-AT')
          .includes(filter.q.toLocaleLowerCase('de-AT'))),
  );
  const scheduleIds = new Set(scheduled.map((s) => s.occurrenceId));
  const visible = rows.filter((r) =>
    r.kind === 'booking' ? bookingIds.has(r.id) : scheduleIds.has(r.id),
  );
  const balances = new Map(rows.map((r) => [r.id, r.balanceAfterCents]));
  const visibleScheduleIds = new Set(visible.filter((r) => r.kind === 'schedule').map((r) => r.id));
  const visibleAccounts = (accounts.data?.accounts ?? []).filter(
    (a) => !filter.accountId || a.id === filter.accountId,
  );
  const currencies = [...new Set(visibleAccounts.map((a) => a.currency))];
  const balanceLabel = currencies
    .map((currency) =>
      nativeCurrency(
        visibleAccounts
          .filter((a) => a.currency === currency)
          .reduce((sum, a) => sum + a.balanceCents, 0),
        currency,
      ),
    )
    .join(' · ');
  const error = future.error ?? filtered.error ?? schedules.error ?? accounts.error;
  const pending =
    future.isPending || filtered.isPending || schedules.isPending || accounts.isPending;
  const notes = (
    <>
      {pending && <LoadingNote what="Kommende Buchungen" />}
      {error && (
        <ErrorNote
          what="Kommende Buchungen"
          error={error}
          onRetry={() => {
            void future.refetch();
            void filtered.refetch();
            void schedules.refetch();
            void accounts.refetch();
          }}
        />
      )}
    </>
  );
  if (pending || error) return { model: null, notes };
  return {
    notes,
    model: {
      today,
      open,
      toggle: () => {
        setRemembered({ key: storageKey, open: !open });
        try {
          localStorage.setItem(storageKey, !open ? 'open' : 'closed');
        } catch {
          /* Optional preference. */
        }
      },
      bookings: filtered.data ?? [],
      schedules: scheduled.filter((s) => visibleScheduleIds.has(s.occurrenceId)),
      balances,
      count: visible.length,
      balanceLabel: balanceLabel || '–',
    },
  };
}
