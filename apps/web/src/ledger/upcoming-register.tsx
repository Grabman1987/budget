import { projectUpcomingRegister, todayInVienna } from '@budget/domain';
import { useAmountPrivacy, useIsPhone } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { registerOccurrencesQuery } from '../expected/api';
import { BookingTable } from './booking-table';
import { nativeCurrency } from './format';
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

export function UpcomingRegister({
  filter,
  today,
  variant,
  onOpen,
}: {
  filter: BookingFilter;
  today: string;
  variant: 'account' | 'all';
  onOpen: (b: ListedBooking) => void;
}) {
  useAmountPrivacy();
  const phone = useIsPhone();
  const storageKey = `budget.register.upcoming.${variant}.${filter.accountId ?? 'all'}.${phone ? 'phone' : 'desktop'}`;
  const [remembered, setRemembered] = useState<{ key: string; open: boolean } | null>(null);
  let open = !phone;
  try {
    open =
      localStorage.getItem(storageKey) === null
        ? !phone
        : localStorage.getItem(storageKey) === 'open';
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
  return (
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
      {!pending && !error && (
        <details className="kupcoming" open={open}>
          <summary
            onClick={(event) => {
              event.preventDefault();
              setRemembered({ key: storageKey, open: !open });
              try {
                localStorage.setItem(storageKey, !open ? 'open' : 'closed');
              } catch {
                /* Optional preference. */
              }
            }}
          >
            Kommend · {visible.length}
          </summary>
          <BookingTable
            items={filtered.data ?? []}
            caption="Kommende Buchungen und nächste Wiederholungen"
            variant={variant}
            onOpen={onOpen}
            upcoming={{
              today,
              schedules: scheduled.filter((s) => visibleScheduleIds.has(s.occurrenceId)),
              balances,
            }}
          />
        </details>
      )}
      {accounts.data && (
        <div className="kregister-today" data-testid="register-today">
          Heute · Saldo {balanceLabel || '–'}
        </div>
      )}
    </>
  );
}
