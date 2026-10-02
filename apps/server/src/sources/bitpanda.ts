import { sourceInteger, type ReadSource, type SourceAmount } from '@budget/domain';
import { z } from 'zod';

// Public API contract checked against docs.public.bitpanda.com, 2026-10-02.
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
const page = z.object({
  data: z
    .array(
      z.object({
        operation_id: id,
        operation_type: id,
        transactions: z.array(transaction).max(1000),
      }),
    )
    .max(100),
  has_next_page: z.boolean(),
  next_cursor: z.string().min(1).max(4096).nullish(),
});

/** Fixed-host GETs only. Redirects, provider error bodies and arbitrary response fields are discarded. */
export function bitpandaReadSource(
  options: {
    key?: () => string | undefined;
    fetch?: typeof fetch;
  } = {},
): ReadSource {
  const key = options.key ?? (() => process.env['BITPANDA_API_KEY']);
  const request = options.fetch ?? fetch;
  async function get(
    path: 'portfolio' | 'operations' | 'currencies' | 'assets',
    params = new URLSearchParams(),
  ): Promise<unknown> {
    const secret = key();
    if (!secret) throw new Error('source_unconfigured');
    try {
      const response = await request('https://api.public.bitpanda.com/v1/' + path + '?' + params, {
        method: 'GET',
        redirect: 'error',
        headers: { 'X-Api-Key': secret },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error('source_failed');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('source_failed');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 4_000_000) throw new Error('source_failed');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw new Error('source_failed');
    }
  }
  return {
    configured: () => Boolean(key()),
    async balances() {
      const currencies = z
        .object({
          data: z
            .array(
              z.object({
                id,
                symbol: z.string().regex(/^[A-Z]{3}$/),
              }),
            )
            .max(500),
        })
        .parse(await get('currencies'));
      const symbols = new Map(currencies.data.map((c) => [c.id, c.symbol]));
      const portfolio = z
        .object({ data: z.array(z.object({ balance: amount })).max(5000) })
        .parse(await get('portfolio'));
      const assets = [
        ...new Set(
          portfolio.data.flatMap((row) => (row.balance.asset_id ? [row.balance.asset_id] : [])),
        ),
      ];
      const labels = new Map<string, string>();
      // The documented id filter accepts multiple IDs; keep each request within one 25-row page.
      for (let offset = 0; offset < assets.length; offset += 25) {
        const metadata = z
          .object({
            data: z
              .array(
                z.object({
                  id,
                  name: z.string().min(1).max(200),
                  symbol: z.string().min(1).max(40),
                }),
              )
              .max(25),
            has_next_page: z.literal(false),
          })
          .parse(
            await get(
              'assets',
              new URLSearchParams({
                id: assets.slice(offset, offset + 25).join(','),
                page_size: '25',
              }),
            ),
          );
        for (const asset of metadata.data)
          labels.set(asset.id, asset.name + ' (' + asset.symbol + ')');
      }
      const rows = portfolio.data.map((row) => {
        const value = normalize(row.balance);
        return {
          key: value.assetId ? 'asset:' + value.assetId : 'currency:' + value.currencyId,
          label: value.assetId
            ? (labels.get(value.assetId) ?? 'Instrument ohne Stammdaten')
            : (symbols.get(value.currencyId!) ?? 'Währung unbekannt'),
          amount: value,
          currency: value.assetId ? null : (symbols.get(value.currencyId!) ?? null),
        };
      });
      if (new Set(rows.map((r) => r.key)).size !== rows.length) throw new Error('source_failed');
      return rows;
    },
    async operations(window) {
      const params = new URLSearchParams({ from: window.from, to: window.to, page_size: '25' });
      if (window.cursor) params.set('cursor', window.cursor);
      const result = page.parse(await get('operations', params));
      if (result.has_next_page && (!result.next_cursor || result.next_cursor === window.cursor))
        throw new Error('source_failed');
      return {
        nextCursor: result.has_next_page ? result.next_cursor! : null,
        operations: result.data.map((op) => ({
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
        })),
      };
    },
  };
}
