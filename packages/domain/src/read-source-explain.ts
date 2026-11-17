import { sourceInteger, type SourceOperation } from './read-source';

/**
 * Operation-level view of a source operation (pure, read-only). Several source transactions
 * (fiat out, token in, fee in the platform token) belong to one operation; this view states what
 * the operation does per asset. EUR values come from the source only: a leg without a stated
 * fiat amount has no value here, never an estimated one, and no cost basis or tax is derived.
 */
export type OperationClass =
  | 'purchase'
  | 'sale'
  | 'swap'
  | 'reward'
  | 'staking_transfer'
  | 'fiat_transfer'
  | 'fee_only'
  | 'other';

export interface OperationAssetEffect {
  assetId: string;
  /** Units credited/debited by the primary legs (absolute, e8). */
  grossE8: number;
  /** Fee units in this same asset (own fee leg or fee field), e8. */
  feeE8: number;
  /** Signed effect on the holding: incoming gross minus fee, or outgoing gross plus fee. */
  netE8: number;
}
export interface OperationSummary {
  class: OperationClass;
  assets: OperationAssetEffect[];
  /** Fiat value stated by the source for the primary fiat legs (cents), else null. */
  fiatCents: number | null;
}

const INTERNAL = /(^|_)(un)?stak(e|ing)(_|$)/;
const REWARD = /(^|_)(reward|bonus|premium|giveaway)(_|$)/;
const SECONDARY_TX = new Set(['fee', 'tax', 'transfer', 'stake', 'unstake']);

export function summarizeOperation(op: SourceOperation): OperationSummary {
  const internal = INTERNAL.test(op.type);
  const primary = op.transactions.filter((t) => !SECONDARY_TX.has(t.type));
  const byAsset = new Map<string, OperationAssetEffect>();
  const effect = (assetId: string) => {
    const e = byAsset.get(assetId) ?? { assetId, grossE8: 0, feeE8: 0, netE8: 0 };
    byAsset.set(assetId, e);
    return e;
  };
  if (!internal) {
    for (const t of op.transactions) {
      const assetId = t.amount.assetId;
      const units = assetId ? Math.abs(sourceInteger(t.amount.value, 8) ?? 0) : 0;
      const isFeeLeg = t.type === 'fee' || t.type === 'tax';
      if (assetId && isFeeLeg) effect(assetId).feeE8 += units;
      else if (assetId) {
        const e = effect(assetId);
        e.grossE8 += units;
        if (t.fee?.assetId === assetId) e.feeE8 += Math.abs(sourceInteger(t.fee.value, 8) ?? 0);
      }
    }
    for (const e of byAsset.values()) {
      const incoming = op.transactions.some(
        (t) => t.amount.assetId === e.assetId && !SECONDARY_TX.has(t.type) && t.flow === 'INCOMING',
      );
      // A fee leg in the same asset always reduces the holding; a primary leg adds or removes it.
      const primaryUnits = e.grossE8;
      e.netE8 = incoming ? primaryUnits - e.feeE8 : -(primaryUnits + e.feeE8);
      if (primaryUnits === 0) e.netE8 = -e.feeE8;
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
  else if (hasAsset && incomingAsset && /(^|_)(buy|savings_plan)(_|$)/.test(op.type))
    cls = 'purchase';
  else if (!hasAsset && hasFiat) cls = 'fiat_transfer';
  return {
    class: cls,
    assets: [...byAsset.values()].sort((a, b) => a.assetId.localeCompare(b.assetId)),
    fiatCents: fiat.length ? fiat.reduce((n, t) => n + Math.abs(t.amount.cents!), 0) : null,
  };
}

export type HoldingCause =
  'mapping_problem' | 'missing_movement' | 'partly_missing_movement' | 'real_difference';

export interface HoldingCauseResult {
  cause: HoldingCause;
  /** Source minus app (same scale as the inputs). */
  differenceE8: number;
  /** Net effect of the open (not yet matched) movements of this asset. */
  openMovementsE8: number;
  openMovementCount: number;
}

/**
 * Why does the app's holding differ from the source's? A missing mapping is a mapping problem.
 * If the open source movements of the asset add up exactly to the difference, the cause is a
 * missing movement; if they only explain part of it (same direction, smaller), the cause is
 * partly a missing movement; everything else is a real difference that needs the owner.
 */
export function explainHoldingDifference(input: {
  mapped: boolean;
  appE8: number;
  sourceE8: number | null;
  openOperations: SourceOperation[];
  assetId: string;
}): HoldingCauseResult {
  const net = input.openOperations
    .map((op) => summarizeOperation(op).assets.find((a) => a.assetId === input.assetId)?.netE8)
    .filter((n): n is number => n !== undefined && n !== 0);
  const open = net.reduce((a, b) => a + b, 0);
  const diff = (input.sourceE8 ?? input.appE8) - input.appE8;
  const base = { differenceE8: diff, openMovementsE8: open, openMovementCount: net.length };
  if (!input.mapped || input.sourceE8 === null) return { cause: 'mapping_problem', ...base };
  if (diff !== 0 && open === diff) return { cause: 'missing_movement', ...base };
  const sameDirection = open !== 0 && Math.sign(open) === Math.sign(diff);
  return {
    cause:
      sameDirection && Math.abs(open) < Math.abs(diff)
        ? 'partly_missing_movement'
        : 'real_difference',
    ...base,
  };
}
