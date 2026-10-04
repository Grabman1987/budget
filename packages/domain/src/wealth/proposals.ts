import type { AllocationStatus, ClassRow } from './allocation';
import { mulDivRound } from './int';
import type { ClusterRisk, SpeculativeShare } from './risk';
import { type SecurityKind } from './types';
import { classifyRisk, type RiskMetadata } from './classification';

// ---- rebalancing revision rows ----

export type RebalanceCode =
  'r13_under' | 'r13_over' | 'r14_single' | 'r14_platform' | 'r15_speculative';

export interface RebalanceProposal {
  code: RebalanceCode;
  rule: 'R13' | 'R14' | 'R15';
  /** `add` = steer new money in, `reduce` = stop buying (or sell) until within the limit. */
  direction: 'add' | 'reduce';
  /** Asset class key (R13), else `null`. */
  assetClass: string | null;
  /** Security or platform id (R14), else `null`. */
  subjectId: string | null;
  shareBp: number;
  /** Target (R13) or limit (R14, R15) in bp. */
  referenceBp: number;
  /** Cents missing (`add`) or above the target / limit (`reduce`); always positive. */
  gapCents: number;
}

/**
 * Revision rows of the portfolio: R13 under-weight classes (largest gap first), R13 over-weight
 * classes, R14 single titles and platforms, R15. An over-weight class that consists only of
 * speculative kinds is covered by the R15 row while R15 is breached and gets no R13 row of its own.
 */
export function rebalancingProposals(input: {
  allocation: AllocationStatus;
  cluster: ClusterRisk;
  speculative: SpeculativeShare;
}): RebalanceProposal[] {
  const { allocation, cluster, speculative } = input;
  const out: RebalanceProposal[] = [];
  const r13 = (row: ClassRow, direction: 'add' | 'reduce'): RebalanceProposal => ({
    code: direction === 'add' ? 'r13_under' : 'r13_over',
    rule: 'R13',
    direction,
    assetClass: row.assetClass,
    subjectId: null,
    shareBp: row.shareBp,
    referenceBp: row.targetBp ?? 0,
    gapCents: Math.abs(row.gapCents),
  });
  const under = allocation.breaches.filter((r) => r.side === 'under');
  under.sort((a, b) => b.gapCents - a.gapCents);
  for (const row of under) out.push(r13(row, 'add'));
  for (const row of allocation.breaches) {
    if (row.side !== 'over') continue;
    if (row.speculativeOnly && speculative.breach) continue;
    out.push(r13(row, 'reduce'));
  }
  const limitCents = (limitBp: number): number => mulDivRound(cluster.totalCents, limitBp, 10_000);
  for (const e of cluster.singles) {
    if (!e.breach) continue;
    out.push({
      code: 'r14_single',
      rule: 'R14',
      direction: 'reduce',
      assetClass: null,
      subjectId: e.id,
      shareBp: e.shareBp,
      referenceBp: cluster.limits.singleBp,
      gapCents: e.grossExposureCents - limitCents(cluster.limits.singleBp),
    });
  }
  for (const e of cluster.platforms) {
    if (!e.breach) continue;
    out.push({
      code: 'r14_platform',
      rule: 'R14',
      direction: 'reduce',
      assetClass: null,
      subjectId: e.id,
      shareBp: e.shareBp,
      referenceBp: cluster.limits.platformBp,
      gapCents: e.grossExposureCents - limitCents(cluster.limits.platformBp),
    });
  }
  if (speculative.breach) {
    out.push({
      code: 'r15_speculative',
      rule: 'R15',
      direction: 'reduce',
      assetClass: null,
      subjectId: null,
      shareBp: speculative.shareBp,
      referenceBp: speculative.limitBp,
      gapCents: speculative.overCents,
    });
  }
  return out;
}

// ---- savings-plan proposal ----

export interface SavingsPlan extends RiskMetadata {
  id: string;
  securityId?: string;
  platform?: string | null;
  name: string;
  kind: SecurityKind;
  assetClass: string | null;
  exposures?: readonly { assetClassId: string; weightBp: number }[];
  /** Current monthly rate in cents. */
  monthlyCents: number;
}

export type PlanReason =
  | 'unchanged'
  | 'paused_r15'
  | 'paused_r14_single'
  | 'paused_r14_platform'
  | 'paused_r13_over'
  | 'steer_r13_under'
  | 'redistributed'
  | 'rounded';

export interface PlanProposal {
  id: string;
  name: string;
  currentCents: number;
  proposedCents: number;
  reason: PlanReason;
}

export interface SavingsPlanProposal {
  plans: PlanProposal[];
  /** Monthly total, identical before and after. */
  totalCents: number;
  /** Rate that was taken from paused plans and handed to the others. */
  freedCents: number;
  changed: boolean;
  /** `no_eligible_plan`: every plan would have to be paused, so nothing is changed. */
  note: 'no_eligible_plan' | null;
}

export interface SavingsPlanParams {
  /** R15 breached: speculative plans (crypto, P2P, single stocks) are set to 0. */
  speculativeBreached: boolean;
  /** Same resolved R14 projection as Portfolio; no additions to breached titles/platforms. */
  cluster?: ClusterRisk;
  /** Proposed rates are whole multiples of this step (default 100 = 1 €); the residue goes to the largest plan. */
  stepCents?: number;
}

/** Split `amount` by `weights` (largest remainder, ties to the earlier entry; equal split if all weights are 0). */
function apportion(amount: number, weights: ReadonlyArray<number | bigint>): number[] {
  if (weights.length === 0) return [];
  const w = weights.every((x) => x <= 0)
    ? weights.map(() => 1n)
    : weights.map((x) => (x > 0 ? BigInt(x) : 0n));
  const sum = w.reduce((a, b) => a + b, 0n);
  const shares = w.map((x) => Math.floor(Number((BigInt(amount) * BigInt(x)) / BigInt(sum))));
  const rems = w.map((x) => (BigInt(amount) * x) % sum);
  let missing = amount - shares.reduce((a, b) => a + b, 0);
  const order = rems
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (missing <= 0) break;
    shares[i] = (shares[i] ?? 0) + 1;
    missing -= 1;
  }
  return shares;
}

/**
 * Savings-plan proposal that keeps the monthly total. Money is only redirected, never added:
 * 1. while R15 is breached, speculative plans go to 0 (`paused_r15`);
 * 2. plans of over-band classes go to 0 (`paused_r13_over`), but only when an under-band class can
 *    take the money;
 * 3. the freed rate goes to the under-band classes in proportion to their gap (`steer_r13_under`),
 *    within a class by current rate; without such a class to all Soll-under classes, else to all
 *    remaining plans by current rate (`redistributed`);
 * 4. the changed rates are rounded to `stepCents` by largest remainder so the total stays exact
 *    (`rounded` when only the rounding moved a plan).
 * Nothing freed means nothing changes (no cosmetic rounding of untouched plans).
 */
export function savingsPlanProposal(
  plans: ReadonlyArray<SavingsPlan>,
  allocation: AllocationStatus,
  params: SavingsPlanParams,
): SavingsPlanProposal {
  const step = params.stepCents ?? 100;
  if (!Number.isSafeInteger(step) || step <= 0) throw new RangeError('stepCents must be positive');
  const totalCents = plans.reduce((a, p) => a + p.monthlyCents, 0);
  const unchanged = (note: SavingsPlanProposal['note']): SavingsPlanProposal => ({
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      currentCents: p.monthlyCents,
      proposedCents: p.monthlyCents,
      reason: 'unchanged',
    })),
    totalCents,
    freedCents: 0,
    changed: false,
    note,
  });

  const weightOf = (p: SavingsPlan, cls: string): number =>
    p.exposures === undefined
      ? (p.assetClass ?? '') === cls
        ? 10000
        : 0
      : cls === ''
        ? 10000 - p.exposures.reduce((a, w) => a + w.weightBp, 0)
        : (p.exposures.find((w) => w.assetClassId === cls)?.weightBp ?? 0);
  const rowsOf = (p: SavingsPlan) => allocation.rows.filter((r) => weightOf(p, r.assetClass) > 0);

  const paused = new Map<string, PlanReason>();
  if (params.speculativeBreached) {
    for (const p of plans) if (classifyRisk(p).speculative) paused.set(p.id, 'paused_r15');
  }
  for (const p of plans) {
    if (paused.has(p.id)) continue;
    if (params.cluster?.singles.some((e) => e.breach && e.id === (p.securityId ?? p.id)))
      paused.set(p.id, 'paused_r14_single');
    else if (
      classifyRisk(p).platform &&
      params.cluster?.platforms.some((e) => e.breach && e.id === p.platform)
    )
      paused.set(p.id, 'paused_r14_platform');
  }
  const live = (): SavingsPlan[] => plans.filter((p) => !paused.has(p.id));
  const hasPlan = (row: ClassRow): boolean => live().some((p) => weightOf(p, row.assetClass) > 0);

  // Receivers: under-band classes with a live plan; else every Soll-under class with a live plan.
  const breachedUnder = allocation.breaches.filter((r) => r.side === 'under' && r.gapCents > 0);
  const anyUnder = allocation.rows.filter((r) => r.side === 'under' && r.gapCents > 0);

  if (breachedUnder.some(hasPlan)) {
    for (const p of live()) {
      const rows = rowsOf(p);
      if (
        rows.reduce((sum, row) => sum + weightOf(p, row.assetClass), 0) === 10000 &&
        rows.every((row) => row.breach && row.side === 'over')
      )
        paused.set(p.id, 'paused_r13_over');
    }
  }
  const receivers = (() => {
    const strict = breachedUnder.filter(hasPlan);
    return strict.length > 0
      ? { rows: strict, strict: true }
      : { rows: anyUnder.filter(hasPlan), strict: false };
  })();

  const freedCents = plans.filter((p) => paused.has(p.id)).reduce((a, p) => a + p.monthlyCents, 0);
  if (paused.size === 0 || freedCents === 0) return unchanged(null);
  const remaining = live();
  if (remaining.length === 0) return unchanged('no_eligible_plan');

  // Distribute the freed rate.
  const extra = new Map<string, number>();
  let steerTargets = new Set<string>();
  if (receivers.rows.length > 0) {
    const classShare = apportion(
      freedCents,
      receivers.rows.map((r) => r.gapCents),
    );
    receivers.rows.forEach((row, i) => {
      const members = remaining.filter((p) => weightOf(p, row.assetClass) > 0);
      const parts = apportion(
        classShare[i] ?? 0,
        members.map((p) => BigInt(p.monthlyCents) * BigInt(weightOf(p, row.assetClass))),
      );
      members.forEach((p, j) => extra.set(p.id, (extra.get(p.id) ?? 0) + (parts[j] ?? 0)));
    });
    if (receivers.strict) steerTargets = new Set(receivers.rows.map((r) => r.assetClass));
  } else {
    const parts = apportion(
      freedCents,
      remaining.map((p) => p.monthlyCents),
    );
    remaining.forEach((p, j) => extra.set(p.id, parts[j] ?? 0));
  }

  // Round the live plans to whole steps, keeping their sum exact.
  const exact = remaining.map((p) => p.monthlyCents + (extra.get(p.id) ?? 0));
  const floors = exact.map((v) => Math.floor(v / step) * step);
  const rems = exact.map((v, i) => v - (floors[i] ?? 0));
  const sumExact = exact.reduce((a, b) => a + b, 0);
  let missing = sumExact - floors.reduce((a, b) => a + b, 0);
  const rounded = [...floors];
  const byRem = rems.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRem) {
    if (missing < step) break;
    rounded[i] = (rounded[i] ?? 0) + step;
    missing -= step;
  }
  if (missing > 0) {
    let big = 0;
    exact.forEach((v, i) => {
      if (v > (exact[big] ?? 0)) big = i;
    });
    rounded[big] = (rounded[big] ?? 0) + missing;
  }
  const proposed = new Map<string, number>(remaining.map((p, i) => [p.id, rounded[i] ?? 0]));

  const out: PlanProposal[] = plans.map((p) => {
    const reason = paused.get(p.id);
    const proposedCents = reason ? 0 : (proposed.get(p.id) ?? p.monthlyCents);
    let why: PlanReason;
    if (reason) why = reason;
    else if (proposedCents === p.monthlyCents) why = 'unchanged';
    else if (
      proposedCents > p.monthlyCents &&
      [...steerTargets].some((cls) => weightOf(p, cls) > 0)
    )
      why = 'steer_r13_under';
    else if (
      proposedCents > p.monthlyCents &&
      (extra.get(p.id) ?? 0) > 0 &&
      steerTargets.size === 0
    ) {
      why = 'redistributed';
    } else why = 'rounded';
    return { id: p.id, name: p.name, currentCents: p.monthlyCents, proposedCents, reason: why };
  });
  return {
    plans: out,
    totalCents,
    freedCents,
    changed: out.some((p) => p.proposedCents !== p.currentCents),
    note: null,
  };
}
