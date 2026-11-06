import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';

type FuelBase = {
  sourceId: string;
  date: string;
  stationName: string | null;
  location: string | null;
  note: string | null;
};
export type FuelSource = FuelBase &
  (
    | { status: 'importable'; currency: 'EUR'; amountCents: number }
    | {
        status: 'unsupported';
        currency: string | null;
        sourceAmount: string | null;
        reason: string;
      }
  );
export interface FuelRow {
  key: string;
  source: FuelSource;
  originalSource: FuelSource;
  changed?: FuelSource;
  bookingId: string | null;
  status: 'booked' | 'review' | 'linked' | 'ignored';
  reason: string | null;
  candidates: string[];
  reviewFingerprint: string;
  canResolve: boolean;
  canBook: boolean;
}
export interface FuelStatus {
  configured: boolean;
  running: boolean;
  lastResult: { lastAttempt: string; lastSuccess: string | null; failed: boolean } | null;
  state: { bootstrapThrough: string; lastSuccess: string } | null;
  destination: { accountId: string; accountName: string; categoryName: string } | null;
  rows: FuelRow[];
}
export interface FuelResult {
  imported: number;
  linked: number;
  review: number;
  groupId: string | null;
}
const PATH = '/api/sources/spritmonitor';
export const spritmonitorQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'spritmonitor'],
    queryFn: () => request<FuelStatus>('GET', PATH),
    refetchInterval: 30_000,
  });
export const refreshFuel = () => request<FuelResult>('POST', PATH + '/refresh', {});
export const resolveFuel = (row: FuelRow, action: 'link' | 'ignore' | 'book', bookingId?: string) =>
  request<{ groupId: string; bookingId: string | null }>('POST', PATH + '/resolve', {
    key: row.key,
    fingerprint: row.reviewFingerprint,
    action,
    ...(bookingId ? { bookingId } : {}),
  });
