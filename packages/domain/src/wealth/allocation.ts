import { deviatesMoreThan, mulDivRound, shareBps } from './int';
import { type WealthPosition } from './types';
import { classifyRisk } from './classification';
import { PARAM_SCHEMAS, type RuleParams } from '../rules/params';

/** R13: a class is out of band beyond 5 percentage points ... */
export const MAX_BAND_BP = PARAM_SCHEMAS.R13.parse({}).maxBandBp;
/** ... or 25 % of its own target, whichever is smaller. */
export const RELATIVE_BAND_PERCENT = PARAM_SCHEMAS.R13.parse({}).relativeBandPct;

/** Soll share of one asset class (from `asset_class_target`). */
export interface ClassTarget {
  assetClass: string;
  targetBp: number;
  /** Stored band; when absent or 0 the R13 default `min(500 bp, 25 % of the target)` applies. */
  bandBp?: number;
}

/** R13 band of a target: `min(500 bp, 25 % of the target)`, the 25 % rounded half up to whole bp. */
export function defaultBandBp(
  targetBp: number,
  policy: Pick<RuleParams<'R13'>, 'maxBandBp' | 'relativeBandPct'> = PARAM_SCHEMAS.R13.parse({}),
): number {
  return Math.min(policy.maxBandBp, mulDivRound(targetBp, policy.relativeBandPct, 100));
}

export interface ClassRow {
  assetClass: string;
  valueCents: number;
  /** Actual share in bp; all rows add up to exactly 10 000 (largest remainder, ties by input order). */
  shareBp: number;
  /** `null` for a class that holds positions but has no target. */
  targetBp: number | null;
  bandBp: number | null;
  /** Actual minus target in bp (negative = under-weight). */
  deviationBp: number | null;
  /** Target value minus actual value in cents: positive = this much is missing, negative = surplus. */
  gapCents: number;
  side: 'under' | 'over' | 'even';
  /** Outside the band (R13); never for classes without target. */
  breach: boolean;
  /** Every position of the class is speculative (crypto, P2P, single stocks). */
  speculativeOnly: boolean;
}

export interface AllocationStatus {
  totalCents: number;
  rows: ClassRow[];
  breaches: ClassRow[];
  /** Largest absolute deviation over all classes with a target, bp (0 without targets). */
  maxDeviationBp: number;
  /** No class is out of band. */
  ok: boolean;
}

/**
 * R13 allocation status. Rows follow the order of `classTargets`; classes found only in the
 * positions (positions without a class use the key `''`) come last in order of first appearance.
 * Breach is decided exactly on cents, not on rounded shares, so exactly 5,00 pp is inside the band.
 */
export function allocationStatus(
  positions: ReadonlyArray<WealthPosition>,
  classTargets: ReadonlyArray<ClassTarget>,
  policy: Pick<RuleParams<'R13'>, 'maxBandBp' | 'relativeBandPct'> = PARAM_SCHEMAS.R13.parse({}),
): AllocationStatus {
  const totalCents = positions.reduce((a, p) => a + p.valueCents, 0);
  const keys: string[] = classTargets.map((t) => t.assetClass);
  for (const p of positions) {
    const key = p.assetClass ?? '';
    if (!keys.includes(key)) keys.push(key);
  }
  const values = keys.map((key) =>
    positions.filter((p) => (p.assetClass ?? '') === key).reduce((a, p) => a + p.valueCents, 0),
  );
  const shares = shareBps(values, totalCents);
  const rows: ClassRow[] = keys.map((key, i) => {
    const target = classTargets.find((t) => t.assetClass === key);
    const valueCents = values[i] ?? 0;
    const shareBp = shares[i] ?? 0;
    const inClass = positions.filter((p) => (p.assetClass ?? '') === key);
    const speculativeOnly = inClass.length > 0 && inClass.every((p) => classifyRisk(p).speculative);
    if (!target) {
      return {
        assetClass: key,
        valueCents,
        shareBp,
        targetBp: null,
        bandBp: null,
        deviationBp: null,
        gapCents: 0,
        side: 'even',
        breach: false,
        speculativeOnly,
      };
    }
    const bandBp =
      target.bandBp && target.bandBp > 0 ? target.bandBp : defaultBandBp(target.targetBp, policy);
    const gapCents = mulDivRound(totalCents, target.targetBp, 10_000) - valueCents;
    const exact = BigInt(valueCents) * 10_000n - BigInt(target.targetBp) * BigInt(totalCents);
    return {
      assetClass: key,
      valueCents,
      shareBp,
      targetBp: target.targetBp,
      bandBp,
      deviationBp: shareBp - target.targetBp,
      gapCents,
      side: exact < 0n ? 'under' : exact > 0n ? 'over' : 'even',
      breach: totalCents > 0 && deviatesMoreThan(valueCents, totalCents, target.targetBp, bandBp),
      speculativeOnly,
    };
  });
  const breaches = rows.filter((r) => r.breach);
  const maxDeviationBp = rows.reduce((m, r) => Math.max(m, Math.abs(r.deviationBp ?? 0)), 0);
  return { totalCents, rows, breaches, maxDeviationBp, ok: breaches.length === 0 };
}
