/**
 * Stage model (SPEC §4, decision 29.09.2026): the stage follows from net worth. Fundament up to
 * 10.000 €, Aufbau up to 100.000 €, Freiheit up to 1 Mio. €. A limit belongs to the next stage:
 * whoever has reached 10.000 € is in Aufbau. Above 1 Mio. € the person stays in Freiheit, with
 * the progress full.
 */

export interface StageDef {
  stage: 1 | 2 | 3;
  key: 'fundament' | 'aufbau' | 'freiheit';
  label: string;
  /** Net worth at which the stage starts. */
  fromCents: number;
  /** Net worth at which the next stage starts (the goal of this stage). */
  toCents: number;
}

export const STAGES: ReadonlyArray<StageDef> = [
  { stage: 1, key: 'fundament', label: 'Fundament', fromCents: 0, toCents: 1_000_000 },
  { stage: 2, key: 'aufbau', label: 'Aufbau', fromCents: 1_000_000, toCents: 10_000_000 },
  { stage: 3, key: 'freiheit', label: 'Freiheit', fromCents: 10_000_000, toCents: 100_000_000 },
];

export interface StageOf extends StageDef {
  /** Progress inside the stage in basis points (0 to 10.000). */
  progressBp: number;
  /** Net worth still missing to the next stage (0 in the last stage once its goal is reached). */
  remainingCents: number;
}

export function stageOf(netWorthCents: number): StageOf {
  const def =
    STAGES.find((s) => netWorthCents < s.toCents) ?? (STAGES[STAGES.length - 1] as StageDef);
  const span = def.toCents - def.fromCents;
  const inside = Math.min(Math.max(netWorthCents - def.fromCents, 0), span);
  return {
    ...def,
    progressBp: Math.round((inside * 10_000) / span),
    remainingCents: Math.max(0, def.toCents - netWorthCents),
  };
}
