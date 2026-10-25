import { useInfiniteQuery } from '@tanstack/react-query';
import './account-register.css';
import { useState } from 'react';
import { BookingPanel, type BookingPanelState } from './booking-panel';
import { BookingTable } from './booking-table';
import { useRegisterToday, useUpcomingRegister } from './upcoming-register';
import { pluralBookings } from './format';
import { bookingsInfiniteQuery } from './queries';
import { LoadOlder } from './load-older';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import type { AccountRow } from './types';

/** Bookings per page of the continuous account history. */
const PAGE_SIZE = 100;

/** The same paged money register on cash accounts and the depot's settlement tab. */
export function AccountRegister({
  account,
  showTodayBalance = true,
}: {
  account: AccountRow;
  showTodayBalance?: boolean;
}) {
  const today = useRegisterToday();
  const list = useInfiniteQuery(
    bookingsInfiniteQuery({ accountId: account.id, to: today }, PAGE_SIZE),
  );
  const upcoming = useUpcomingRegister({ accountId: account.id }, today, 'account');
  const [panel, setPanel] = useState<BookingPanelState>(null);
  const page = list.data?.pages[0];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <div className="head kh">
        <h2>Buchungen</h2>
        {page && <span className="aside">{pluralBookings(page.total)}</span>}
      </div>
      {list.isPending && <LoadingNote what="Buchungen" />}
      {list.isError && (
        <ErrorNote what="Buchungen" error={list.error} onRetry={() => void list.refetch()} />
      )}
      {upcoming.notes}
      {page && items.length === 0 && (
        <EmptyNote>
          {(upcoming.model?.count ?? 0) > 0
            ? 'Noch keine Buchungen bis heute auf diesem Konto.'
            : 'Noch keine Buchungen auf diesem Konto.'}
        </EmptyNote>
      )}
      {(items.length > 0 || (upcoming.model?.count ?? 0) > 0) && (
        <div className="kaccount-table-card">
          <BookingTable
            items={items}
            caption="Buchungen mit laufendem Saldo"
            variant="account"
            upcoming={upcoming.model}
            showTodayBalance={showTodayBalance}
            onOpen={(booking) => setPanel({ mode: 'edit', booking })}
          />
        </div>
      )}
      {list.hasNextPage && (
        <LoadOlder fetching={list.isFetching} failed={list.isError} load={list.fetchNextPage} />
      )}
      <BookingPanel state={panel} onClose={() => setPanel(null)} />
    </>
  );
}
