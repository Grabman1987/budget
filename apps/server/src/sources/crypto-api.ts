import {
  sourceInteger,
  type ReadSource,
  type SourceAmount,
  type SourceBalance,
  type SourceOperation,
} from '@budget/domain';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SourceReadError } from './errors';

// Public API contract: docs/crypto-read-source.md, provider contract section.
const id = z.string().min(1).max(200);
const amount = z
  .object({
    value: z.string().regex(/^-?\d{1,30}(\.\d{1,30})?$/),
    asset_id: id.nullish(),
    currency_id: id.nullish(),
  })
  .refine((v) => v.asset_id || v.currency_id);
const normalize = (v: z.infer<typeof amount>): SourceAmount => ({
  value: v.value,
  assetId: v.asset_id ?? null,
  currencyId: v.currency_id ?? null,
  cents: v.asset_id ? null : sourceInteger(v.value, 2),
});
const transaction = z.object({
  transaction_id: id,
  transaction_type: id,
  wallet_id: id,
  flow: id,
  credited_at: z.iso.datetime({ offset: true }),
  asset_amount: amount,
  fee_amount: amount.nullish(),
  asset_balance_after: amount.nullish(),
  compensates: id.nullish(),
  trade: z.object({ trade_id: id, fee: amount.nullish() }).nullish(),
});
const operation = z.object({
  operation_id: id,
  operation_type: id,
  transactions: z.array(transaction).max(1000),
});
// Validate the envelope first; one malformed operation must not reject its neighbors.
const page = z.object({
  data: z.array(z.unknown()).max(100),
  has_next_page: z.boolean(),
  next_cursor: z.string().min(1).max(4096).nullish(),
});
const collection = z.object({ data: z.array(z.unknown()).max(5000) });
const currencyRow = z.object({ id, symbol: z.string().min(1).max(40) });
const assetRow = z.object({
  id,
  name: z.string().min(1).max(200),
  symbol: z.string().min(1).max(40),
});
const balanceRow = z.object({ balance: amount });
const balanceIdentity = z.object({
  balance: z.object({ asset_id: id.nullish(), currency_id: id.nullish() }),
});
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SourceReadError('schema');
  return result.data;
}

/** Server-configured HTTPS base (`CRYPTO_API_BASE_URL`); anything else counts as unconfigured. */
function httpsBase(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** Fixed-host GETs only. Redirects, provider error bodies and arbitrary response fields are discarded. */
export function cryptoReadSource(
  options: {
    key?: () => string | undefined;
    base?: () => string | undefined;
    fetch?: typeof fetch;
  } = {},
): ReadSource {
  const key = options.key ?? (() => process.env['CRYPTO_API_KEY']);
  const base = options.base ?? (() => process.env['CRYPTO_API_BASE_URL']);
  const request = options.fetch ?? fetch;
  async function get(
    path: 'portfolio' | 'operations' | 'currencies' | 'assets',
    params = new URLSearchParams(),
  ): Promise<unknown> {
    const secret = key();
    const origin = httpsBase(base());
    if (!secret || !origin) throw new Error('source_unconfigured');
    try {
      const response = await request(origin + '/v1/' + path + '?' + params, {
        method: 'GET',
        redirect: 'error',
        headers: { 'X-Api-Key': secret },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new SourceReadError('http');
      const reader = response.body?.getReader();
      if (!reader) throw new SourceReadError('parse');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 4_000_000) throw new SourceReadError('parse');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      } catch {
        throw new SourceReadError('parse');
      }
    } catch (error) {
      if (error instanceof SourceReadError) throw error;
      throw new SourceReadError(
        error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
          ? 'timeout'
          : 'http',
      );
    }
  }
  return {
    configured: () => Boolean(key() && httpsBase(base())),
    async balances() {
      const portfolio = parse(collection, await get('portfolio'));
      const rows = new Map<string, SourceBalance>();
      for (const [index, raw] of portfolio.data.entries()) {
        const parsed = balanceRow.safeParse(raw);
        const identity = balanceIdentity.safeParse(raw);
        const assetId = parsed.success
          ? parsed.data.balance.asset_id
          : identity.success
            ? identity.data.balance.asset_id
            : null;
        const currencyId = assetId
          ? null
          : parsed.success
            ? parsed.data.balance.currency_id
            : identity.success
              ? identity.data.balance.currency_id
              : null;
        const key = assetId
          ? 'asset:' + assetId
          : currencyId
            ? 'currency:' + currencyId
            : 'invalid:row:' + index;
        const previous = rows.get(key);
        if (previous) {
          // Duplicate native balances are unavailable, never guessed or silently overwritten.
          rows.set(key, { ...previous, issue: 'duplicate' });
          continue;
        }
        rows.set(key, {
          key,
          currency: null,
          amount: parsed.success
            ? normalize(parsed.data.balance)
            : { value: '0', assetId: assetId ?? null, currencyId: currencyId ?? null, cents: null },
          ...(!parsed.success ? { issue: 'schema' as const } : {}),
        });
      }
      const currencyIds = new Set(
        [...rows.values()].flatMap((r) => (r.amount.currencyId ? [r.amount.currencyId] : [])),
      );
      const symbols = new Map<string, string>();
      if (currencyIds.size) {
        const currencies = parse(collection, await get('currencies'));
        for (const raw of currencies.data) {
          const parsed = currencyRow.safeParse(raw);
          if (!parsed.success || !currencyIds.has(parsed.data.id)) continue;
          const { id, symbol } = parsed.data;
          if (symbols.has(id)) {
            const row = rows.get('currency:' + id)!;
            rows.set(row.key, { ...row, issue: 'duplicate' });
          } else symbols.set(id, symbol);
        }
      }
      const assets = [
        ...new Set([...rows.values()].flatMap((r) => (r.amount.assetId ? [r.amount.assetId] : []))),
      ];
      const labels = new Map<string, string>();
      // The documented id filter accepts multiple IDs; keep requests within a 25-row page.
      for (let offset = 0; offset < assets.length; offset += 25) {
        const batch = assets.slice(offset, offset + 25);
        const metadata = parse(
          z.object({ data: z.array(z.unknown()).max(25), has_next_page: z.literal(false) }),
          await get('assets', new URLSearchParams({ id: batch.join(','), page_size: '25' })),
        );
        for (const raw of metadata.data) {
          const parsed = assetRow.safeParse(raw);
          if (parsed.success && batch.includes(parsed.data.id))
            labels.set(parsed.data.id, parsed.data.name + ' (' + parsed.data.symbol + ')');
        }
      }
      return [...rows.values()].map((row) => ({
        ...row,
        label: row.amount.assetId
          ? (labels.get(row.amount.assetId) ?? 'Instrument ohne Stammdaten')
          : (symbols.get(row.amount.currencyId!) ?? 'Währung unbekannt'),
        currency: row.amount.assetId ? null : (symbols.get(row.amount.currencyId!) ?? null),
      }));
    },
    async operations(window) {
      const params = new URLSearchParams({ from: window.from, to: window.to, page_size: '25' });
      if (window.cursor) params.set('cursor', window.cursor);
      const result = parse(page, await get('operations', params));
      if (result.has_next_page && (!result.next_cursor || result.next_cursor === window.cursor))
        throw new SourceReadError('schema');
      const operations: SourceOperation[] = [];
      const invalidOperations: Array<{ id: string; reason: 'schema' }> = [];
      for (const [index, raw] of result.data.entries()) {
        const parsed = operation.safeParse(raw);
        if (!parsed.success) {
          const identity = z.object({ operation_id: id }).safeParse(raw);
          // With no usable source ID, retain only a stable window/cursor/row identifier.
          invalidOperations.push({
            id: identity.success
              ? identity.data.operation_id
              : 'invalid:' +
                createHash('sha256')
                  .update(JSON.stringify([window.from, window.to, window.cursor, index]))
                  .digest('hex'),
            reason: 'schema',
          });
          continue;
        }
        const op = parsed.data;
        operations.push({
          id: op.operation_id,
          type: op.operation_type,
          transactions: op.transactions.map((tx) => ({
            id: tx.transaction_id,
            type: tx.transaction_type,
            walletId: tx.wallet_id,
            flow: tx.flow,
            creditedAt: tx.credited_at,
            amount: normalize(tx.asset_amount),
            fee: tx.fee_amount ? normalize(tx.fee_amount) : null,
            balanceAfter: tx.asset_balance_after ? normalize(tx.asset_balance_after) : null,
            tradeId: tx.trade?.trade_id ?? null,
            tradeFee: tx.trade?.fee ? normalize(tx.trade.fee) : null,
            compensates: tx.compensates ?? null,
          })),
        });
      }
      return {
        nextCursor: result.has_next_page ? result.next_cursor! : null,
        operations,
        invalidOperations,
      };
    },
  };
}
