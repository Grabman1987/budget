import type { ListedBooking } from '../ledger/types';

/**
 * "Als wiederkehrende Zahlung anlegen" on a booking opens Plan › Erwartet with the booking as the
 * template of the new payment. It travels in the browser's history state (not in the URL).
 */
declare module '@tanstack/history' {
  interface HistoryState {
    expectedFrom?: ListedBooking;
    expectedView?: 'next' | 'contracts' | 'all';
    expectedKind?: 'all' | 'inflow' | 'outflow';
  }
}
