import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { request } from '../api/http';
import { BookingPanel } from '../ledger/booking-panel';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { ListedBooking } from '../ledger/types';

/**
 * Opens one booking in the existing edit dialog without leaving the page. Saving or closing keeps
 * the user where they are; the booking write invalidates the ledger queries, so the cards refresh.
 */
export function useBookingEditor(): { open: (id: string) => void; panel: ReactNode } {
  const [target, setTarget] = useState<{ id: string; generation: number } | null>(null);
  const generation = useRef(0);
  const id = target?.id ?? null;
  const booking = useQuery({
    queryKey: [...LEDGER_KEY, 'heute-booking', id, target?.generation],
    gcTime: 0,
    enabled: id !== null,
    queryFn: () =>
      request<{ booking: ListedBooking }>('GET', `/api/bookings/${encodeURIComponent(id!)}`),
  });
  const panel = (
    <>
      {id && booking.isPending && <LoadingNote what="Buchung" />}
      {id && booking.isError && (
        <ErrorNote what="Buchung" error={booking.error} onRetry={() => void booking.refetch()} />
      )}
      <BookingPanel
        state={id && booking.data ? { mode: 'edit', booking: booking.data.booking } : null}
        onClose={() => setTarget(null)}
      />
    </>
  );
  return { open: (next) => setTarget({ id: next, generation: ++generation.current }), panel };
}
