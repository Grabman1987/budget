import { z } from 'zod';

export const sourceMappingSchema = z.strictObject({
  key: z.string().min(1).max(210),
  accountId: z.string().min(1).max(100),
  securityId: z.string().min(1).max(100).nullable(),
});

/** Exact source decimals; unsupported precision remains unavailable, never rounded. */
export function sourceInteger(value: string, scale: number): number | null {
  if (!/^-?\d{1,30}(\.\d{1,30})?$/.test(value)) return null;
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  if (/[^0]/.test(fraction.slice(scale))) return null;
  const integer = BigInt(whole + fraction.slice(0, scale).padEnd(scale, '0'));
  const signed = value.startsWith('-') ? -integer : integer;
  return signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)
    ? null
    : Number(signed);
}
export interface SourceAmount {
  value: string;
  assetId: string | null;
  currencyId: string | null;
  cents: number | null;
}
export interface SourceBalance {
  issue?: 'schema' | 'duplicate';
  label?: string;
  key: string;
  amount: SourceAmount;
  currency: string | null;
}
export interface SourceOperation {
  id: string;
  type: string;
  transactions: Array<{
    id: string;
    type: string;
    walletId: string;
    flow: string;
    creditedAt: string;
    amount: SourceAmount;
    fee: SourceAmount | null;
    balanceAfter: SourceAmount | null;
    tradeId: string | null;
    tradeFee: SourceAmount | null;
    compensates: string | null;
  }>;
}
export interface SourceMapping {
  key: string;
  accountId: string;
  securityId: string | null;
}
export interface SourcePage {
  operations: SourceOperation[];
  invalidOperations?: Array<{ id: string; reason: 'schema'; field?: string }>;
  nextCursor: string | null;
}
export type SourceFailureCategory = 'schema' | 'http' | 'timeout' | 'parse';
export interface ReadSource {
  configured(): boolean;
  balances(): Promise<SourceBalance[]>;
  operations(window: { from: string; to: string; cursor: string | null }): Promise<SourcePage>;
}

/** Only exact provider stake types identify staking legs; rewards remain movements. */
export const isInternalStakeType = (type: string) => /^(un)?stake$/.test(type);

export const isStakeMovement = ({ type, flow }: SourceOperation['transactions'][number]) =>
  isInternalStakeType(type) && (flow === 'INCOMING' || flow === 'OUTGOING');

/** First unreadable amount field; values are never included in the diagnostic. */
export function sourceOperationUnreadableField(op: SourceOperation): string | null {
  for (const [i, t] of op.transactions.entries()) {
    for (const field of ['amount', 'fee', 'tradeFee'] as const) {
      const amount = t[field];
      if (!amount) continue;
      if (sourceInteger(amount.value, amount.assetId ? 8 : 2) === null)
        return `transactions[${i}].${field}.value`;
      if (amount.cents !== null && !Number.isSafeInteger(amount.cents))
        return `transactions[${i}].${field}.cents`;
    }
  }
  return null;
}

/** Internal moves require readable incoming and outgoing legs of the same key, exactly balanced. */
export function internalTransferKeys(op: SourceOperation): Set<string> {
  const groups = new Map<
    string,
    { net: bigint; incoming: boolean; outgoing: boolean; readable: boolean }
  >();
  for (const t of op.transactions) {
    if (t.type !== 'transfer' && !isInternalStakeType(t.type)) continue;
    const key = t.amount.assetId ? 'asset:' + t.amount.assetId : 'currency:' + t.amount.currencyId;
    const group = groups.get(key) ?? { net: 0n, incoming: false, outgoing: false, readable: true };
    const units = sourceInteger(t.amount.value, t.amount.assetId ? 8 : 2);
    if (units === null || (t.flow !== 'INCOMING' && t.flow !== 'OUTGOING')) group.readable = false;
    else {
      group.net += BigInt(units) * (t.flow === 'INCOMING' ? 1n : -1n);
      group.incoming ||= t.flow === 'INCOMING';
      group.outgoing ||= t.flow === 'OUTGOING';
    }
    groups.set(key, group);
  }
  return new Set(
    [...groups]
      .filter(([, g]) => g.readable && g.incoming && g.outgoing && g.net === 0n)
      .map(([k]) => k),
  );
}
