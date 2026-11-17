import { sourceInteger, type SourceOperation } from './read-source';
import { internalTransferKeys, isInternalStakeType } from './read-source-match';

/**
 * Operation-level view of a source operation (pure, read-only). Several source transactions
 * (fiat out, token in, fee in the platform token) belong to one operation; this view states what
 * the operation does per asset. EUR values come from the source only: a leg without a stated
 * fiat amount has no value here, never an estimated one, and no cost basis or tax is derived.
 * A value the source states in a form we cannot read exactly is unknown (null), never zero.
 */
export type OperationClass =
  | 'purchase'
  | 'sale'
  | 'swap'
  | 'reward'
  | 'staking_transfer'
  | 'fiat_transfer'
  | 'token_transfer'
  | 'fee_only'
  | 'other';

export interface OperationAssetEffect {
  assetId: string;
  /** Units credited/debited by the primary legs (absolute, e8); null if unreadable. */
  grossE8: number | null;
  /** Fee units in this same asset (own fee leg or fee field), e8; null if unreadable. */
  feeE8: number | null;
  /** Signed effect on the holding: incoming gross minus fee, or outgoing gross plus fee; null if unknown. */
  netE8: number | null;
}
export interface OperationSummary {
  class: OperationClass;
  assets: OperationAssetEffect[];
  /** Fiat value stated by the source for the primary fiat legs (cents), else null. */
  fiatCents: number | null;
}

const REWARD = /(^|_)(reward|bonus|premium|giveaway)(_|$)/;
const SECONDARY_TX = new Set(['fee', 'tax', 'stake', 'unstake']);

/** Exact integer sum; null as soon as a part is unknown or the sum leaves the safe range. */
const sum = (...parts: Array<number | null>): number | null => {
  let total = 0;
  for (const p of parts) {
    if (p === null) return null;
    total += p;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
};
const units = (v: string): number | null => {
  const n = sourceInteger(v, 8);
  return n === null ? null : Math.abs(n);
};

type Tx = SourceOperation['transactions'][number];

export function summarizeOperation(op: SourceOperation): OperationSummary {
  const internal = isInternalStakeType(op.type);
  const internalKeys = internalTransferKeys(op);
  const isInternalLeg = (t: Tx) =>
    t.type === 'transfer' &&
    internalKeys.has(
      t.amount.assetId ? 'asset:' + t.amount.assetId : 'currency:' + t.amount.currencyId,
    );
  const primary = op.transactions.filter((t) => !SECONDARY_TX.has(t.type) && !isInternalLeg(t));
  const byAsset = new Map<string, OperationAssetEffect & { incoming: boolean }>();
  const effect = (assetId: string) => {
    const e = byAsset.get(assetId) ?? { assetId, grossE8: 0, feeE8: 0, netE8: 0, incoming: false };
    byAsset.set(assetId, e);
    return e;
  };
  if (!internal) {
    for (const t of op.transactions) {
      const assetId = t.amount.assetId;
      if (!assetId || isInternalLeg(t)) continue;
      const e = effect(assetId);
      if (t.type === 'fee' || t.type === 'tax') e.feeE8 = sum(e.feeE8, units(t.amount.value));
      else if (!SECONDARY_TX.has(t.type)) {
        e.grossE8 = sum(e.grossE8, units(t.amount.value));
        if (t.flow === 'INCOMING') e.incoming = true;
        if (t.fee?.assetId === assetId) e.feeE8 = sum(e.feeE8, units(t.fee.value));
      }
    }
    for (const e of byAsset.values()) {
      // A fee-only effect (no primary leg) always reduces the holding.
      e.netE8 =
        e.grossE8 === null || e.feeE8 === null
          ? null
          : e.grossE8 === 0
            ? -e.feeE8
            : e.incoming
              ? e.grossE8 - e.feeE8
              : -sum(e.grossE8, e.feeE8)!;
    }
  }
  const fiat = primary.filter((t) => !t.amount.assetId && t.amount.cents !== null);
  const hasAsset = primary.some((t) => t.amount.assetId);
  const hasFiat = primary.some((t) => !t.amount.assetId);
  const incomingAsset = primary.some((t) => t.amount.assetId && t.flow === 'INCOMING');
  const outgoingAsset = primary.some((t) => t.amount.assetId && t.flow === 'OUTGOING');
  let cls: OperationClass = 'other';
  if (internal) cls = 'staking_transfer';
  else if (!primary.length) cls = 'fee_only';
  else if (hasAsset && incomingAsset && outgoingAsset) cls = 'swap';
  else if (hasAsset && !hasFiat && REWARD.test(op.type)) cls = 'reward';
  else if (hasAsset && hasFiat && incomingAsset) cls = 'purchase';
  else if (hasAsset && hasFiat && outgoingAsset) cls = 'sale';
  else if (hasAsset && primary.every((t) => t.type === 'transfer')) cls = 'token_transfer';
  else if (hasAsset && incomingAsset && /(^|_)(buy|savings_plan)(_|$)/.test(op.type))
    cls = 'purchase';
  else if (!hasAsset && hasFiat) cls = 'fiat_transfer';
  return {
    class: cls,
    assets: [...byAsset.values()]
      .map(({ assetId, grossE8, feeE8, netE8 }) => ({ assetId, grossE8, feeE8, netE8 }))
      .sort((a, b) => a.assetId.localeCompare(b.assetId)),
    fiatCents: fiat.length ? sum(...fiat.map((t) => Math.abs(t.amount.cents!))) : null,
  };
}

export type HoldingCause =
  | 'mapping_problem'
  | 'source_unreadable'
  | 'missing_movement'
  | 'partly_missing_movement'
  | 'real_difference';

export interface HoldingCauseResult {
  cause: HoldingCause;
  /** Source minus app (same scale as the inputs); null when the source value is unreadable. */
  differenceE8: number | null;
  /** Net effect of the open (not yet matched) movements of this asset; null if any is unknown. */
  openMovementsE8: number | null;
  openMovementCount: number;
}

/**
 * Why does the app's holding differ from the source's? A missing mapping is a mapping problem; a
 * source value we cannot read exactly (duplicate or invalid rows, unsupported precision) is
 * `source_unreadable`. If the open source movements of the asset add up exactly to the
 * difference, the cause is a missing movement; if they only explain part (same direction,
 * smaller), partly; everything else is a real difference that needs the owner. An unreadable open
 * movement never counts as zero: the cause stays a real difference.
 */
export function explainHoldingDifference(input: {
  mapped: boolean;
  appE8: number;
  sourceE8: number | null;
  /** The source value exists but cannot be read exactly (duplicate rows, invalid, precision). */
  sourceUnreadable?: boolean;
  openOperations: SourceOperation[];
  assetId: string;
}): HoldingCauseResult {
  const nets = input.openOperations
    .map((op) => summarizeOperation(op).assets.find((a) => a.assetId === input.assetId))
    .filter((a): a is OperationAssetEffect => a !== undefined && a.netE8 !== 0);
  const open = sum(...nets.map((a) => a.netE8));
  const diff = input.sourceE8 === null ? null : sum(input.sourceE8, -input.appE8);
  const base = { differenceE8: diff, openMovementsE8: open, openMovementCount: nets.length };
  if (!input.mapped) return { cause: 'mapping_problem', ...base };
  if (diff === null || input.sourceUnreadable) return { cause: 'source_unreadable', ...base };
  if (open === null || open === 0) return { cause: 'real_difference', ...base };
  if (open === diff) return { cause: 'missing_movement', ...base };
  const sameDirection = Math.sign(open) === Math.sign(diff);
  return {
    cause:
      sameDirection && Math.abs(open) < Math.abs(diff)
        ? 'partly_missing_movement'
        : 'real_difference',
    ...base,
  };
}
