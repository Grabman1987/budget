import { queryOptions } from '@tanstack/react-query';
import type { NetWorthBucket, NetWorthWindow, Period } from '@budget/domain';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';

/** Typed calls of the wealth API (`/api/wealth`). */

export interface PriceStand {
  /** Day of the newest price; `null` before any price exists. */
  priceDate: string | null;
  /** When it was written (ISO UTC), when recorded. */
  priceAt: string | null;
}

export interface CompositionRow {
  accountId: string;
  name: string;
  type: string;
  valueCents: number;
}

export interface NetWorthView {
  period: Period;
  /** Start day of the window: its close is the first point of `daily` and the chain's start. */
  from: string;
  to: string;
  stand: PriceStand;
  chain: NetWorthWindow;
  daily: { date: string; netWorthCents: number }[];
  bars: { unit: 'week' | 'month'; buckets: NetWorthBucket[] };
  composition: { assets: CompositionRow[]; debts: CompositionRow[] };
}

/** Under the ledger key: every booking write refreshes the wealth figures as well. */
export const WEALTH_KEY = [...LEDGER_KEY, 'wealth'] as const;

export const netWorthQuery = (period: Period) =>
  queryOptions({
    queryKey: [...WEALTH_KEY, 'networth', period],
    queryFn: () => request<NetWorthView>('GET', `/api/wealth/networth?period=${period}`),
  });

export const standQuery = () =>
  queryOptions({
    queryKey: [...WEALTH_KEY, 'stand'],
    queryFn: () => request<PriceStand>('GET', '/api/wealth/stand'),
  });
