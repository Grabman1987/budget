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
  nextCursor: string | null;
}
export interface ReadSource {
  configured(): boolean;
  balances(): Promise<SourceBalance[]>;
  operations(window: { from: string; to: string; cursor: string | null }): Promise<SourcePage>;
}
