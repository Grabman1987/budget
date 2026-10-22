import { privateAmount } from '@budget/ui';
import { formatDecimal, type Cents } from '@budget/domain';
import type { RecordedSecurityTransferPreview, TradeRow } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { queryString, request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
export type { TradeRow } from '@budget/db';
export type ManualTrade = {
  accountId: string;
  securityId: string;
  date: string;
  kind: TradeRow['kind'];
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
export const removeTrade = (id: string) =>
  request<{ groupId: string }>('DELETE', `/api/trades/${encodeURIComponent(id)}`);
export const previewSecurityTransfer = (input: {
  securityId: string; sourceAccountId: string; destinationAccountId: string;
  date: string; unitsE8: number; sourceReference?: string | null;
}) => request<RecordedSecurityTransferPreview>('POST', '/api/trades/transfer-preview',
  input, undefined, { notifyWrite: false });
export interface SecurityTransferProposal {
  securityId: string; sourceAccountId: string; destinationAccountId: string;
  date: string; unitsE8: number; sourceReference?: string | null;
}
export const applySecurityTransfer = (proposal: SecurityTransferProposal,
  factFingerprint: string, intentKey: string) =>
  request<{ pairId: string; groupId: string; duplicate: boolean; live: boolean }>(
    'POST', '/api/trades/transfer-apply',
    { ...proposal, factFingerprint, intentKey, confirmed: true },
  );
export const sourceMoney = (cents: number, currency: string) =>
  `${privateAmount(formatDecimal(cents as Cents))} ${currency === 'EUR' ? '€' : currency}`;
