import { z } from 'zod';
import { daysBetween, todayInVienna } from './date/date';
import { marketValueCents } from './invest/invest';
import { convertCashCents } from './ledger/cash-valuation';
import type { TradeKind } from './invest/series';
import {
  sourceInteger,
  type SourceAmount,
  type SourceMapping,
  type SourceOperation,
} from './read-source';
import type { SourceMatchBooking } from './read-source-match';

const id = z.string().min(1).max(210);
const amount = z
  .object({
    value: z.string().regex(/^-?\d{1,30}(\.\d{1,30})?$/),
    assetId: id.nullable(),
    currencyId: id.nullable(),
    cents: z.number().int().safe().nullable(),
  })
  .refine((a) => Boolean(a.assetId) !== Boolean(a.currencyId));
/** Staged JSON is a write boundary too; reject corrupt facts before deleting ledger rows. */
export const rebuildOperationSchema = z.object({
  id,
  type: id,
  transactions: z
    .array(
      z.object({
        id,
        type: id,
        walletId: id,
        flow: z.enum(['INCOMING', 'OUTGOING']),
        creditedAt: z.iso.datetime({ offset: true }),
        amount,
        fee: amount.nullable(),
        balanceAfter: amount.nullable(),
        tradeFee: amount.nullable(),
        tradeId: id.nullable(),
        compensates: id.nullable(),
      }),
    )
    .min(1),
});
export const rebuildDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      Number.isFinite(Date.parse(s + 'T00:00:00Z')) &&
      new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s,
  );
export const sourceAmountKey = (a: SourceAmount) =>
  a.assetId ? `asset:${a.assetId}` : `currency:${a.currencyId}`;
export const rebuildLegDay = (t: SourceOperation['transactions'][number]) =>
  todayInVienna(new Date(t.creditedAt));
export function rebuildSafe(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new RangeError('Source total exceeds safe integer precision');
  return n;
}
function native(a: SourceAmount): number {
  const n = sourceInteger(a.value, a.assetId ? 8 : 2);
  if (n === null || (!a.assetId && a.cents !== n))
    throw new RangeError('Unsupported source precision');
  return Math.abs(n);
}
const SECONDARY = new Set(['fee', 'tax']);
function tradeGroup(op: SourceOperation, t: SourceOperation['transactions'][number]): string {
  const ids = [
    ...new Set(op.transactions.map((leg) => leg.tradeId).filter((id): id is string => id !== null)),
  ];
  return t.tradeId ?? (ids.length === 1 ? ids[0]! : op.id);
}
export const REBUILD_REWARDS = new Set([
  'reward',
  'passive_earn_reward',
  'onetime_reward',
  'best_reward',
  'instant_trade_bonus',
  'giveaway',
  'trading_premium',
]);
const TRADING = new Set([
  'buy',
  'sell',
  'savings_plan',
  'leverage_liquidation',
  'index_buy',
  'index_sell',
  'index_rebalancing',
  'swap',
  'dust_swap',
  'earn_on_fiat_swap',
  'earn_on_fiat_buy',
]);
const INTERNAL = new Set(['stake', 'unstake', 'transfer']);
const DELIVERIES = new Set(['deposit', 'withdrawal', 'reclaim']);
export const rebuildStakedNowSchema = z
  .array(z.string().min(1).max(300))
  .transform((entries, ctx) => {
    const result = new Map<string, number>();
    for (const entry of entries) {
      const match = /^(.+)=([0-9]+(?:\.[0-9]+)?)$/.exec(entry);
      const name = match?.[1]?.trim();
      const units = match ? sourceInteger(match[2]!, 8) : null;
      const key = name?.toLocaleLowerCase('de-AT');
      if (!key || units === null || result.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: 'staked-now requires unique ASSET-NAME=nonnegative exact e8 units',
        });
        continue;
      }
      result.set(key, units);
    }
    return result;
  });

/** Staking wallets are absent from source balances: reverse main-wallet movements from today. */
export function sourceStakedAt(
  ops: SourceOperation[],
  day: string,
  today: string,
  now: ReadonlyMap<string, number>,
) {
  const result = new Map([...now].map(([key, units]) => [key, BigInt(units)]));
  for (const op of ops.filter((op) => op.type === 'stake' || op.type === 'unstake'))
    for (const t of op.transactions) {
      if (
        !t.amount.assetId ||
        SECONDARY.has(t.type) ||
        rebuildLegDay(t) <= day ||
        rebuildLegDay(t) > today
      )
        continue;
      if ((t.flow === 'OUTGOING') !== (op.type === 'stake'))
        throw new RangeError('Staking direction conflicts');
      const key = sourceAmountKey(t.amount);
      result.set(
        key,
        (result.get(key) ?? 0n) + (op.type === 'unstake' ? 1n : -1n) * BigInt(native(t.amount)),
      );
    }
  return new Map(
    [...result].map(([key, units]) => {
      if (units < 0n)
        throw new RangeError('Negative staked reference; check staked-now and source history');
      return [key, rebuildSafe(units)];
    }),
  );
}

export interface RebuildFxConversion {
  id: string;
  legId: string;
  date: string;
  currency: string;
  originalAmount: string;
  originalCents: number;
  fromRateMicro: number;
  toRateMicro: number;
  amountCents: number;
}
export interface RebuildFxOptions {
  currencies: { key: string; currency: string }[];
  rates: { currency: string; date: string; rateMicro: number; source: string }[];
}

/** Wallet snapshots are authoritative; subsequent flows replay exactly, wallets sum only at the end. */
export function sourceBalancesAt(ops: SourceOperation[], day: string): Map<string, number> {
  return sourceBalancesOnDays(ops, [day]).get(day)!;
}
/** One chronological replay serves opening, month ends and the daily cash report. */
export function sourceBalancesOnDays(
  ops: SourceOperation[],
  days: string[],
  keys?: ReadonlySet<string>,
): Map<string, Map<string, number>> {
  const wallets = new Map<string, { key: string; value: bigint; snapshotAt: number | undefined }>();
  const groups = new Map<string, SourceOperation['transactions']>();
  const groupOf = new Map<string, string>();
  for (const op of ops)
    for (const t of op.transactions) {
      const group = JSON.stringify([op.id, tradeGroup(op, t)]);
      groupOf.set(t.id, group);
      groups.set(group, [...(groups.get(group) ?? []), t]);
    }
  const txs = ops
    .flatMap((op) => op.transactions)
    .sort((a, b) => Date.parse(a.creditedAt) - Date.parse(b.creditedAt));
  const explicitFees = new Set(
    txs
      .filter((t) => t.type === 'fee')
      .map((t) => JSON.stringify([groupOf.get(t.id), sourceAmountKey(t.amount)])),
  );
  const chargedTradeFees = new Set<string>();
  const apply = (t: SourceOperation['transactions'][number]) => {
    const key = sourceAmountKey(t.amount);
    if (!keys || keys.has(key)) {
      const wallet = JSON.stringify([key, t.walletId]);
      const sign = t.flow === 'INCOMING' ? 1n : -1n;
      let value = (wallets.get(wallet)?.value ?? 0n) + sign * BigInt(native(t.amount));
      // An explicit fee leg already supplies the flow. Inline fees otherwise reduce the balance.
      if (
        t.fee &&
        sourceAmountKey(t.fee) === key &&
        !explicitFees.has(JSON.stringify([groupOf.get(t.id), key]))
      )
        value -= BigInt(native(t.fee));
      const tradeFeeKey = JSON.stringify([groupOf.get(t.id), key]);
      if (
        !(t.fee && sourceAmountKey(t.fee) === key) &&
        t.tradeFee &&
        sourceAmountKey(t.tradeFee) === key &&
        !explicitFees.has(tradeFeeKey) &&
        !chargedTradeFees.has(tradeFeeKey)
      ) {
        value -= BigInt(native(t.tradeFee));
        chargedTradeFees.add(tradeFeeKey);
      }
      if (t.balanceAfter) {
        if (sourceAmountKey(t.balanceAfter) !== key)
          throw new RangeError('Balance identity differs');
        const n = sourceInteger(t.balanceAfter.value, t.amount.assetId ? 8 : 2);
        if (n === null || (!t.amount.assetId && t.balanceAfter.cents !== n))
          throw new RangeError('Unsupported balance precision');
        value = BigInt(n);
      }
      wallets.set(wallet, {
        key,
        value,
        snapshotAt: t.balanceAfter ? Date.parse(t.creditedAt) : wallets.get(wallet)?.snapshotAt,
      });
    }
    for (const fee of [
      t.fee,
      t.tradeFee && (!t.fee || sourceAmountKey(t.tradeFee) !== sourceAmountKey(t.fee))
        ? t.tradeFee
        : null,
    ]) {
      if (!fee || sourceAmountKey(fee) === key) continue;
      const feeKey = sourceAmountKey(fee),
        identity = JSON.stringify([groupOf.get(t.id), feeKey]);
      if (keys && !keys.has(feeKey)) continue;
      if (explicitFees.has(identity) || (fee === t.tradeFee && chargedTradeFees.has(identity)))
        continue;
      const counterparts = groups
        .get(groupOf.get(t.id)!)!
        .filter((leg) => sourceAmountKey(leg.amount) === feeKey);
      if (new Set(counterparts.map((leg) => leg.walletId)).size !== 1)
        throw new RangeError('Inline fee has no unique counterpart wallet');
      const target = JSON.stringify([feeKey, counterparts[0]!.walletId]),
        current = wallets.get(target);
      if ((current?.snapshotAt ?? -Infinity) < Date.parse(t.creditedAt))
        wallets.set(target, {
          key: feeKey,
          value: (current?.value ?? 0n) - BigInt(native(fee)),
          snapshotAt: current?.snapshotAt,
        });
      chargedTradeFees.add(identity);
    }
  };
  let index = 0;
  const history = new Map<string, Map<string, number>>();
  for (const day of [...new Set(days)].sort()) {
    while (index < txs.length && rebuildLegDay(txs[index]!) <= day) apply(txs[index++]!);
    const totals = new Map<string, bigint>();
    for (const { key, value } of wallets.values()) totals.set(key, (totals.get(key) ?? 0n) + value);
    history.set(day, new Map([...totals].map(([key, value]) => [key, rebuildSafe(value)])));
  }
  return history;
}
export interface RebuildPrice {
  securityId: string;
  date: string;
  currency: string;
  priceMicro: number;
}
function storedRebuildPrice(
  prices: RebuildPrice[],
  securityId: string,
  day: string,
  currency: string,
  maxAge: number,
) {
  const p = prices
    .filter(
      (p) =>
        p.securityId === securityId &&
        p.currency === currency &&
        p.date <= day &&
        daysBetween(p.date, day) <= maxAge,
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (p && (!Number.isSafeInteger(p.priceMicro) || p.priceMicro <= 0))
    throw new RangeError('Invalid stored price precision');
  return p;
}
export function rebuildValue(
  prices: RebuildPrice[],
  securityId: string,
  day: string,
  units: number,
  currency: string,
  maxAge = 7,
): number | null {
  const p = storedRebuildPrice(prices, securityId, day, currency, maxAge);
  if (!p) return null;
  const value = marketValueCents(Math.abs(units), p.priceMicro);
  if (!Number.isSafeInteger(value)) throw new RangeError('Stored-price value exceeds safe cents');
  return value;
}
/** Largest remainders conserve cents; bigint products avoid floating point allocation. */
function split(total: number, weights: (number | bigint)[]): number[] {
  const sum = weights.reduce<bigint>((s, n) => s + BigInt(n), 0n);
  if (!sum) throw new RangeError('No stored price for proportional allocation');
  const parts = weights.map((w, i) => ({
    i,
    n: (BigInt(total) * BigInt(w)) / sum,
    r: (BigInt(total) * BigInt(w)) % sum,
  }));
  let rest = BigInt(total) - parts.reduce((s, p) => s + p.n, 0n);
  for (const p of [...parts].sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1)))
    if (rest-- > 0n) p.n++;
  return parts.map((p) => rebuildSafe(p.n));
}
export interface RebuildTrade {
  securityId: string;
  date: string;
  kind: TradeKind | 'reward';
  unitsE8: number;
  amountCents: number;
  feeCents: number;
  taxCents: number;
  importKey: string;
  note: string;
}
export interface RebuildIssue {
  id: string;
  reason: string;
  key?: string;
  fiatEffectCents?: number | null;
}
/** Primary units include an extra outgoing asset fee, or subtract it from an incoming leg. */
export function rebuildAssetUnits(
  t: SourceOperation['transactions'][number],
  legs: SourceOperation['transactions'],
): number {
  const key = sourceAmountKey(t.amount);
  const explicit = legs.filter((f) => f.type === 'fee' && sourceAmountKey(f.amount) === key);
  const primary = legs.filter((f) => !SECONDARY.has(f.type) && sourceAmountKey(f.amount) === key);
  const shared = primary.filter(
    (f) =>
      f.tradeFee &&
      sourceAmountKey(f.tradeFee) === key &&
      !(f.fee && sourceAmountKey(f.fee) === key),
  );
  const unitFee = explicit.length
    ? split(
        rebuildSafe(explicit.reduce((s, f) => s + BigInt(native(f.amount)), 0n)),
        primary.map((f) => native(f.amount)),
      )[primary.indexOf(t)]!
    : t.fee && sourceAmountKey(t.fee) === key
      ? native(t.fee)
      : shared.includes(t)
        ? split(
            native(shared[0]!.tradeFee!),
            shared.map((f) => native(f.amount)),
          )[shared.indexOf(t)]!
        : 0;
  return rebuildSafe(
    t.flow === 'INCOMING'
      ? BigInt(native(t.amount)) - BigInt(unitFee)
      : -(BigInt(native(t.amount)) + BigInt(unitFee)),
  );
}
export function planSourceRebuild(
  ops: SourceOperation[],
  mappings: SourceMapping[],
  prices: RebuildPrice[],
  since: string,
  cashKey: string,
  currency: string,
  fx: RebuildFxOptions = { currencies: [], rates: [] },
) {
  const mapping = new Map(mappings.map((m) => [m.key, m]));
  const trades: RebuildTrade[] = [],
    issues: RebuildIssue[] = [],
    unbooked: SourceOperation[] = [];
  const rewards = new Map<string, RebuildTrade & { count: number }>();
  const rewardTypes = new Map<string, Map<string, number>>();
  const fx_converted: RebuildFxConversion[] = [];
  const fxCashMovements: { date: string; amountCents: number }[] = [];
  const unhandled: { id: string; type: string }[] = [];
  for (const originalOp of ops) {
    let op = originalOp;
    const current = op.transactions.filter((t) => rebuildLegDay(t) >= since);
    if (!current.length) continue;
    for (const t of current.filter(
      (t) =>
        t.amount.assetId &&
        !mapping.has(sourceAmountKey(t.amount)) &&
        (SECONDARY.has(t.type) || INTERNAL.has(op.type)),
    ))
      issues.push({
        id: op.id,
        key: sourceAmountKey(t.amount),
        reason: 'unmapped_asset',
        fiatEffectCents: 0,
      });
    const reportedFees = new Set<string>();
    for (const t of current)
      for (const fee of [t.fee, t.tradeFee]) {
        if (
          !fee?.assetId ||
          mapping.has(sourceAmountKey(fee)) ||
          sourceAmountKey(fee) === sourceAmountKey(t.amount)
        )
          continue;
        const identity = JSON.stringify([t.tradeId, sourceAmountKey(fee)]);
        if (
          reportedFees.has(identity) ||
          current.some(
            (f) => f.type === 'fee' && sourceAmountKey(f.amount) === sourceAmountKey(fee),
          )
        )
          continue;
        issues.push({
          id: op.id,
          key: sourceAmountKey(fee),
          reason: 'unmapped_asset',
          fiatEffectCents: 0,
        });
        reportedFees.add(identity);
      }
    if (INTERNAL.has(op.type)) continue;
    if (
      !TRADING.has(op.type) &&
      !op.type.startsWith('margin_') &&
      !REBUILD_REWARDS.has(op.type) &&
      op.type !== 'earn_on_fiat_reward' &&
      op.type !== 'merger_crypto' &&
      !(DELIVERIES.has(op.type) && current.some((t) => t.amount.assetId && !SECONDARY.has(t.type)))
    ) {
      const assetLegs = current.filter((t) => t.amount.assetId && !SECONDARY.has(t.type));
      for (const t of assetLegs.filter((t) => !mapping.has(sourceAmountKey(t.amount))))
        issues.push({
          id: op.id,
          key: sourceAmountKey(t.amount),
          reason: 'unmapped_asset',
          fiatEffectCents:
            assetLegs.length === 1
              ? rebuildSafe(
                  current
                    .filter((f) => sourceAmountKey(f.amount) === cashKey)
                    .reduce(
                      (s, f) => s + (f.flow === 'INCOMING' ? 1n : -1n) * BigInt(native(f.amount)),
                      0n,
                    ),
                )
              : null,
        });
      unbooked.push({ ...op, transactions: current });
      if (!['deposit', 'withdrawal', 'refund', 'reclaim'].includes(op.type))
        unhandled.push({ id: op.id, type: op.type });
      continue;
    }
    // Only eligible unmapped fiat is converted. Bank-side operations retain native facts.
    const converted: RebuildFxConversion[] = [];
    try {
      const rate = (code: string, day: string) => {
        if (code === 'EUR') return 1_000_000;
        const r = fx.rates.find((r) => r.currency === code && r.date === day && r.source === 'ecb');
        if (!r) throw new RangeError(`Missing stored ECB rate: ${code} ${day}`);
        return r.rateMicro;
      };
      op = {
        ...op,
        transactions: op.transactions.map((t) => {
          const day = rebuildLegDay(t);
          const convert = (a: SourceAmount | null, field: string): SourceAmount | null => {
            if (!a || a.assetId || sourceAmountKey(a) === cashKey) return a;
            const code = fx.currencies.find((c) => c.key === sourceAmountKey(a))?.currency;
            if (!code)
              throw new RangeError('Unmapped fiat currency has no stored currency identity');
            const from = rate(code, day),
              to = rate(currency, day);
            const cents = convertCashCents(native(a), from, to);
            if (day >= since)
              converted.push({
                id: op.id,
                legId: `${t.id}:${field}`,
                date: day,
                currency: code,
                originalAmount: a.value,
                originalCents: native(a),
                fromRateMicro: from,
                toRateMicro: to,
                amountCents: cents,
              });
            return {
              assetId: null,
              currencyId: cashKey.slice(9),
              cents,
              value: `${BigInt(cents) / 100n}.${(BigInt(cents) % 100n).toString().padStart(2, '0')}`,
            };
          };
          return {
            ...t,
            amount: convert(t.amount, 'amount')!,
            fee: convert(t.fee, 'fee'),
            tradeFee: convert(t.tradeFee, 'tradeFee'),
          };
        }),
      };
      fx_converted.push(...converted);
      if (converted.length) {
        const days = [...new Set(op.transactions.map(rebuildLegDay))].sort();
        const flowsOnly = (o: SourceOperation) => [
          { ...o, transactions: o.transactions.map((t) => ({ ...t, balanceAfter: null })) },
        ];
        const normalized = sourceBalancesOnDays(flowsOnly(op), days, new Set([cashKey]));
        const original = sourceBalancesOnDays(flowsOnly(originalOp), days, new Set([cashKey]));
        let previous = 0n;
        for (const day of days) {
          const delta =
            BigInt(normalized.get(day)!.get(cashKey) ?? 0) -
            BigInt(original.get(day)!.get(cashKey) ?? 0);
          if (day >= since)
            fxCashMovements.push({ date: day, amountCents: rebuildSafe(delta - previous) });
          previous = delta;
        }
      }
    } catch (error) {
      issues.push({ id: op.id, reason: error instanceof Error ? error.message : 'invalid_fx' });
      continue;
    }
    const groups = new Map<string, typeof current>();
    for (const t of op.transactions) {
      const key = tradeGroup(op, t);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    for (const legs of groups.values()) {
      const tradeCount = trades.length,
        issueCount = issues.length;
      const rewardsBefore = new Map(rewards);
      const typesBefore = new Map([...rewardTypes].map(([key, types]) => [key, new Map(types)]));
      try {
        if (REBUILD_REWARDS.has(op.type) && currency !== 'EUR')
          throw new RangeError('Reward pair requires an EUR depot');
        const assets = legs.filter((t) => t.amount.assetId && !SECONDARY.has(t.type));
        if (legs.some((t) => t.type === 'fee' && t.amount.assetId && t.flow !== 'OUTGOING'))
          throw new RangeError('Asset fee must be outgoing');
        for (const t of legs.filter(
          (t) =>
            t.type === 'fee' &&
            t.amount.assetId &&
            !assets.some((a) => sourceAmountKey(a.amount) === sourceAmountKey(t.amount)),
        )) {
          if (rebuildLegDay(t) < since) continue;
          const key = sourceAmountKey(t.amount),
            m = mapping.get(key);
          if (!m?.securityId) continue; // Already reported above; do not parse unmapped asset precision.
          const units = native(t.amount),
            value = rebuildValue(prices, m.securityId, rebuildLegDay(t), units, currency, Infinity);
          if (value === null) {
            issues.push({ id: op.id, key, reason: 'fee_no_price', fiatEffectCents: 0 });
            continue;
          }
          trades.push({
            securityId: m.securityId,
            date: rebuildLegDay(t),
            kind: 'sell',
            unitsE8: -units,
            amountCents: value,
            feeCents: value,
            taxCents: 0,
            importKey: `rebuild:${op.id}:${op.transactions.indexOf(t)}`,
            note: op.type,
          });
        }
        const fiat = legs.filter(
          (t) => sourceAmountKey(t.amount) === cashKey && !SECONDARY.has(t.type),
        );
        const total = rebuildSafe(fiat.reduce((s, t) => s + BigInt(native(t.amount)), 0n));
        const fees = legs.filter((t) => t.type === 'fee' && sourceAmountKey(t.amount) === cashKey);
        const taxes = legs.filter((t) => t.type === 'tax' && sourceAmountKey(t.amount) === cashKey);
        if ([...fees, ...taxes].some((t) => t.flow !== 'OUTGOING'))
          throw new RangeError('Fee/tax refund needs a separate source operation');
        // tradeFee can be repeated on the asset and cash leg: use it once per group.
        const inline = legs.map((t) => t.tradeFee).find((a) => a && sourceAmountKey(a) === cashKey);
        const fee = fees.length
          ? rebuildSafe(fees.reduce((s, t) => s + BigInt(native(t.amount)), 0n))
          : inline
            ? native(inline)
            : rebuildSafe(
                legs.reduce(
                  (s, t) =>
                    s + BigInt(t.fee && sourceAmountKey(t.fee) === cashKey ? native(t.fee) : 0),
                  0n,
                ),
              );
        const tax = rebuildSafe(taxes.reduce((s, t) => s + BigInt(native(t.amount)), 0n));
        if (op.type === 'earn_on_fiat_reward') {
          const m = mappings.find((m) => m.securityId);
          if (!m?.securityId) throw new RangeError('Interest needs a mapped depot instrument');
          const feeParts = fiat.length
            ? split(
                fee,
                fiat.map((t) => native(t.amount)),
              )
            : [];
          const taxParts = fiat.length
            ? split(
                tax,
                fiat.map((t) => native(t.amount)),
              )
            : [];
          for (const t of fiat.filter((t) => rebuildLegDay(t) >= since)) {
            if (t.flow !== 'INCOMING') throw new RangeError('Fiat reward must be incoming');
            trades.push({
              securityId: m.securityId,
              date: rebuildLegDay(t),
              kind: 'interest',
              unitsE8: 0,
              amountCents: native(t.amount),
              feeCents: feeParts[fiat.indexOf(t)]!,
              taxCents: taxParts[fiat.indexOf(t)]!,
              importKey: `rebuild:${op.id}:${op.transactions.indexOf(t)}`,
              note: op.type,
            });
          }
          continue;
        }
        const units = assets.map((t) =>
          mapping.get(sourceAmountKey(t.amount))?.securityId ? rebuildAssetUnits(t, legs) : 0,
        );
        const quotes = assets.map((t) => {
          const m = mapping.get(sourceAmountKey(t.amount));
          return m?.securityId
            ? (storedRebuildPrice(
                prices,
                m.securityId,
                rebuildLegDay(t),
                currency,
                REBUILD_REWARDS.has(op.type) ? 7 : Infinity,
              ) ?? null)
            : null;
        });
        const values = quotes.map((p, i) =>
          p
            ? rebuildValue(
                [p],
                p.securityId,
                rebuildLegDay(assets[i]!),
                units[i]!,
                currency,
                Infinity,
              )
            : null,
        );
        const weights = quotes.map((p, i) =>
          p ? BigInt(Math.abs(units[i]!)) * BigInt(p.priceMicro) : null,
        );
        const incoming = assets
          .map((t, i) => (t.flow === 'INCOMING' ? i : -1))
          .filter((i) => i >= 0);
        const outgoing = assets
          .map((t, i) => (t.flow === 'OUTGOING' ? i : -1))
          .filter((i) => i >= 0);
        if (op.type === 'merger_crypto' || DELIVERIES.has(op.type)) {
          if (fiat.length) throw new RangeError('Asset delivery/migration must have no fiat leg');
          const merger = op.type === 'merger_crypto';
          if (merger && assets.some((t) => !mapping.get(sourceAmountKey(t.amount))?.securityId))
            throw new RangeError('Merger requires two mapped assets');
          if (
            merger &&
            (outgoing.length !== 1 ||
              incoming.length !== 1 ||
              rebuildLegDay(assets[outgoing[0]!]!) !== rebuildLegDay(assets[incoming[0]!]!))
          )
            throw new RangeError(
              'Merger requires one outgoing and one incoming asset on the same day',
            );
          const saleValue = merger ? values[outgoing[0]!] : null;
          if (merger && saleValue === null) issues.push({ id: op.id, reason: 'merger_no_price' });
          assets.forEach((t, i) => {
            if (rebuildLegDay(t) < since) return;
            const key = sourceAmountKey(t.amount),
              m = mapping.get(key);
            if (!m?.securityId) {
              issues.push({ id: op.id, key, reason: 'unmapped_asset', fiatEffectCents: 0 });
              return;
            }
            if (!units[i] || (t.flow === 'INCOMING' && units[i]! < 0))
              throw new RangeError('Fee consumes asset units');
            if (!merger && (t.flow === 'INCOMING') !== (op.type === 'deposit'))
              throw new RangeError('Delivery direction conflicts');
            const value = merger ? saleValue : op.type === 'reclaim' ? 0 : values[i];
            if (!merger && (value === null || op.type === 'reclaim'))
              issues.push({
                id: op.id,
                key,
                reason: op.type === 'reclaim' ? 'reclaim_zero_value' : 'delivery_no_price',
              });
            trades.push({
              securityId: m.securityId,
              date: rebuildLegDay(t),
              kind:
                merger && saleValue !== null
                  ? t.flow === 'INCOMING'
                    ? 'buy'
                    : 'sell'
                  : t.flow === 'INCOMING'
                    ? 'delivery_in'
                    : 'delivery_out',
              unitsE8: units[i]!,
              amountCents: value ?? 0,
              feeCents: 0,
              taxCents: 0,
              importKey: merger
                ? `rebuild:${op.id}:merger:${t.flow === 'INCOMING' ? 'in' : 'out'}`
                : `rebuild:${op.id}:${op.transactions.indexOf(t)}`,
              note: op.type,
            });
          });
          continue;
        }
        const swap = !fiat.length && incoming.length > 0 && outgoing.length > 0;
        const amounts = assets.map(() => 0),
          allocatedFees = assets.map(() => 0),
          allocatedTaxes = assets.map(() => 0);
        const allocate = (indices: number[], cents: number, target: number[]) => {
          if (!indices.length && cents) throw new RangeError('No asset leg for fiat cost');
          const parts =
            indices.length === 1
              ? [cents]
              : indices.length
                ? split(
                    cents,
                    indices.map((i) => {
                      if (weights[i] === null)
                        throw new RangeError(
                          'Missing price or mapping for proportional allocation',
                        );
                      return weights[i]!;
                    }),
                  )
                : [];
          indices.forEach((i, j) => {
            target[i] = parts[j]!;
          });
        };
        if (swap) {
          if (outgoing.some((i) => values[i] === null))
            throw new RangeError('Swap has no stored sale price');
          const value = rebuildSafe(outgoing.reduce((s, i) => s + BigInt(values[i]!), 0n));
          allocate(outgoing, value, amounts);
          allocate(incoming, value, amounts);
        } else if (fiat.length) {
          if (incoming.length && outgoing.length) {
            const buys = fiat.filter((t) => t.flow === 'OUTGOING'),
              sells = fiat.filter((t) => t.flow === 'INCOMING');
            if (buys.length && sells.length) {
              allocate(
                incoming,
                rebuildSafe(buys.reduce((s, t) => s + BigInt(native(t.amount)), 0n)),
                amounts,
              );
              allocate(
                outgoing,
                rebuildSafe(sells.reduce((s, t) => s + BigInt(native(t.amount)), 0n)),
                amounts,
              );
            } else {
              // A swap/rebalance with a net fiat leg: stored sale value funds the remaining buy.
              if (outgoing.some((i) => values[i] === null))
                throw new RangeError('Net-fiat rebalance has no stored sale price');
              const sale = rebuildSafe(outgoing.reduce((s, i) => s + BigInt(values[i]!), 0n));
              const signedCash = fiat.reduce(
                (s, t) => s + (t.flow === 'INCOMING' ? 1n : -1n) * BigInt(native(t.amount)),
                0n,
              );
              const purchase = rebuildSafe(BigInt(sale) - signedCash);
              if (purchase < 0) throw new RangeError('Net fiat exceeds stored sale value');
              allocate(outgoing, sale, amounts);
              allocate(incoming, purchase, amounts);
            }
          } else {
            if (fiat.some((t) => (t.flow === 'INCOMING') === Boolean(incoming.length)))
              throw new RangeError('Fiat direction conflicts with asset leg');
            allocate(incoming.length ? incoming : outgoing, total, amounts);
          }
        } else if (!REBUILD_REWARDS.has(op.type))
          throw new RangeError('Trade has no fiat or swap counterleg');
        allocate(outgoing.length ? outgoing : incoming, fee, allocatedFees);
        allocate(outgoing, tax, allocatedTaxes);
        assets.forEach((t, i) => {
          if (rebuildLegDay(t) < since) return;
          const key = sourceAmountKey(t.amount),
            m = mapping.get(key);
          if (!m?.securityId) {
            issues.push({
              id: op.id,
              reason: 'unmapped_asset',
              key,
              fiatEffectCents:
                fiat.length || swap
                  ? (t.flow === 'INCOMING' ? -1 : 1) * amounts[i]! -
                    allocatedFees[i]! -
                    allocatedTaxes[i]!
                  : 0,
            });
            return;
          }
          if (!units[i] || (t.flow === 'INCOMING' && units[i]! < 0))
            throw new RangeError('Fee consumes asset units');
          const reward = REBUILD_REWARDS.has(op.type) && !fiat.length;
          const input: RebuildTrade = {
            securityId: m.securityId,
            date: rebuildLegDay(t),
            kind: reward
              ? values[i] === null
                ? 'delivery_in'
                : 'reward'
              : t.flow === 'INCOMING'
                ? 'buy'
                : 'sell',
            unitsE8: units[i]!,
            amountCents: reward ? (values[i] ?? 0) : amounts[i]!,
            feeCents: allocatedFees[i]!,
            taxCents: allocatedTaxes[i]!,
            importKey: `rebuild:${op.id}:${op.transactions.indexOf(t)}`,
            note: op.type,
          };
          if (reward && t.flow !== 'INCOMING')
            throw new RangeError('Asset reward must be incoming');
          if (reward && values[i] === null)
            issues.push({ id: op.id, key, reason: 'reward_no_price' });
          if (!reward) {
            trades.push(input);
            return;
          }
          const rkey = `${input.date.slice(0, 7)}:${m.securityId}:${input.kind}`;
          const r = rewards.get(rkey);
          const types = rewardTypes.get(rkey) ?? new Map<string, number>();
          types.set(op.type, rebuildSafe(BigInt(types.get(op.type) ?? 0) + BigInt(input.unitsE8)));
          rewardTypes.set(rkey, types);
          rewards.set(
            rkey,
            r
              ? {
                  ...r,
                  date: r.date > input.date ? r.date : input.date,
                  unitsE8: rebuildSafe(BigInt(r.unitsE8) + BigInt(input.unitsE8)),
                  amountCents: rebuildSafe(BigInt(r.amountCents) + BigInt(input.amountCents)),
                  count: r.count + 1,
                }
              : {
                  ...input,
                  importKey: `rebuild:reward:${input.date.slice(0, 7)}:${m.securityId}${input.kind === 'delivery_in' ? ':unpriced' : ''}`,
                  count: 1,
                },
          );
        });
      } catch (error) {
        trades.length = tradeCount;
        issues.length = issueCount;
        rewards.clear();
        for (const [key, value] of rewardsBefore) rewards.set(key, value);
        rewardTypes.clear();
        for (const [key, value] of typesBefore) rewardTypes.set(key, value);
        issues.push({
          id: op.id,
          reason: error instanceof Error ? error.message : 'invalid_group',
        });
        for (const t of legs.filter(
          (t) => t.amount.assetId && !mapping.has(sourceAmountKey(t.amount)),
        ))
          issues.push({
            id: op.id,
            key: sourceAmountKey(t.amount),
            reason: 'unmapped_asset',
            fiatEffectCents: null,
          });
      }
    }
  }
  const unitSources = new Map<string, { type: string; unitsE8: number }[]>();
  for (const [key, r] of rewards) {
    trades.push({ ...r, note: `${r.count} source rewards (${r.date.slice(0, 7)})` });
    unitSources.set(
      r.importKey,
      [...rewardTypes.get(key)!].map(([type, unitsE8]) => ({ type, unitsE8 })),
    );
  }
  for (const t of trades)
    if (!unitSources.has(t.importKey))
      unitSources.set(t.importKey, [{ type: t.note, unitsE8: t.unitsE8 }]);
  return { trades, issues, unbooked, fx_converted, fxCashMovements, unhandled, unitSources };
}

/** Flow diagnosis ignores snapshots; the opening reference carries their pre-start effect. */
export function rebuildCreatedUnitSources(
  parts: { type: string; unitsE8: number }[],
  actualUnitsE8: number,
) {
  const allocated =
    parts.length === 1
      ? [Math.abs(actualUnitsE8)]
      : split(
          Math.abs(actualUnitsE8),
          parts.map((p) => Math.abs(p.unitsE8)),
        );
  return parts.map((p, i) => ({ type: p.type, unitsE8: Math.sign(actualUnitsE8) * allocated[i]! }));
}

export function rebuildUnitBreakdown(
  ops: SourceOperation[],
  key: string,
  since: string,
  day: string,
  openingUnitsE8: number,
  created: { type: string; unitsE8: number }[],
) {
  const source = new Map<string, bigint>([['opening', BigInt(openingUnitsE8)]]);
  for (const op of ops) {
    const transactions = op.transactions
      .filter((t) => rebuildLegDay(t) >= since && rebuildLegDay(t) <= day)
      .map((t) => ({ ...t, balanceAfter: null }));
    if (!transactions.length) continue;
    const units =
      op.type === 'stake' || op.type === 'unstake'
        ? 0
        : (sourceBalancesOnDays([{ ...op, transactions }], [day], new Set([key]))
            .get(day)!
            .get(key) ?? 0);
    if (transactions.some((t) => sourceAmountKey(t.amount) === key))
      source.set(op.type, (source.get(op.type) ?? 0n) + BigInt(units));
  }
  const actual = new Map<string, bigint>();
  for (const row of created)
    actual.set(row.type, (actual.get(row.type) ?? 0n) + BigInt(row.unitsE8));
  return [...new Set([...source.keys(), ...actual.keys()])].sort().map((type) => ({
    type,
    sourceUnitsE8: rebuildSafe(source.get(type) ?? 0n),
    createdUnitsE8: rebuildSafe(actual.get(type) ?? 0n),
    differenceE8: rebuildSafe((actual.get(type) ?? 0n) - (source.get(type) ?? 0n)),
  }));
}

/** Exact same-sign subsets of up to eight movements; every movement and booking is claimed once. */
export function matchAggregatedSourceCash(
  movements: { id: string; date: string; amountCents: number }[],
  bookings: SourceMatchBooking[],
) {
  const claimed = new Set<string>(),
    matches: { bookingId: string; movementIds: string[] }[] = [],
    limitedBookingIds: string[] = [];
  for (const b of [...bookings].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )) {
    const candidates = movements.filter(
      (m) =>
        !claimed.has(m.id) &&
        Math.abs(daysBetween(m.date, b.date)) <= 12 &&
        Math.sign(m.amountCents) === Math.sign(b.amountCents) &&
        Math.abs(m.amountCents) <= Math.abs(b.amountCents),
    );
    // ponytail: bounded subset states; expose an inconclusive search rather than freeze an operator run.
    const states = new Map<bigint, string[]>([[0n, []]]);
    for (const m of candidates) {
      for (const [sum, ids] of [...states]) {
        if (ids.length >= 8) continue;
        const next = sum + BigInt(m.amountCents);
        if (next === BigInt(b.amountCents)) {
          const movementIds = [...ids, m.id];
          matches.push({ bookingId: b.id, movementIds });
          movementIds.forEach((id) => claimed.add(id));
          break;
        }
        if (
          Math.abs(Number(next)) < Math.abs(b.amountCents) &&
          (!states.has(next) || states.get(next)!.length > ids.length + 1)
        )
          states.set(next, [...ids, m.id]);
      }
      if (matches.at(-1)?.bookingId === b.id) break;
      if (states.size > 100_000) {
        limitedBookingIds.push(b.id);
        break;
      }
    }
  }
  return { matches, limitedBookingIds };
}
