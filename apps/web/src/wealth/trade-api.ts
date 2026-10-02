import { privateAmount } from '@budget/ui';
import { formatDecimal, type Cents } from '@budget/domain';
import type { TradeRow } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { queryString, request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
export type { TradeRow } from '@budget/db';
export type ManualTrade = {
  accountId: string;
  securityId: string;
  date: string;
  kind: 'buy' | 'sell';
  unitsE8: number;
  amountCents: number;
  feeCents: number;
  taxCents: number;
  note: string | null;
};
export const tradesQuery = (security: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'trades', security],
    enabled: !!security,
    retry: false,
    queryFn: () =>
      request<{ trades: TradeRow[] }>('GET', `/api/trades${queryString({ security })}`),
  });
export const tradeQuery = (id: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'trade', id],
    enabled: !!id,
    retry: false,
    queryFn: () => request<{ trade: TradeRow }>('GET', `/api/trades/${encodeURIComponent(id)}`),
  });
export const saveTrade = (values: ManualTrade, id?: string) => {
  const patch: Partial<ManualTrade> = { ...values };
  delete patch.accountId;
  return request<{ trade: TradeRow; groupId: string; bookingId: string | null }>(
    id ? 'PATCH' : 'POST',
    id ? `/api/trades/${encodeURIComponent(id)}` : '/api/trades',
    id ? patch : values,
  );
};
export const sourceMoney = (cents: number, currency: string) =>
  `${privateAmount(formatDecimal(cents as Cents))} ${currency === 'EUR' ? '€' : currency}`;
