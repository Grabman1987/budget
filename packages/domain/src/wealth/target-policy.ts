export interface ManagedTarget {
  assetClassId: string;
  targetShareBp: number;
  bandBp?: number;
  bandMode?: 'standard' | 'custom';
}
export interface TargetTier {
  /** Inclusive upper boundary in integer cents; null is the final, unbounded tier. */
  upToCents: number | null;
  targets: ManagedTarget[];
  label?: string;
  /** Absent on legacy policies, which retain their automatic activation. */
  enabled?: boolean;
  condition?: string;
}
export interface TargetPolicy {
  targets: ManagedTarget[];
  tiers: TargetTier[];
}

/** UI lower bounds translate to the existing inclusive storage contract without moving a cent. */
export function targetTierStarts(tiers: readonly TargetTier[]): number[] {
  return tiers.map((_, i) => (i === 0 ? 0 : tiers[i - 1]!.upToCents! + 1));
}

export function targetTiersFromStarts(
  stages: readonly (Omit<TargetTier, 'upToCents'> & { fromCents: number })[],
): TargetTier[] {
  if (!stages.length || stages[0]!.fromCents !== 0)
    throw new RangeError('Die erste Vermögensstufe beginnt bei 0,00 €.');
  for (const [i, stage] of stages.entries())
    if (
      !Number.isSafeInteger(stage.fromCents) ||
      stage.fromCents < 0 ||
      (i > 0 && stage.fromCents <= stages[i - 1]!.fromCents)
    )
      throw new RangeError('Vermögensstufen müssen aufsteigende Eurobeträge sein.');
  return stages.map((stage, i) => ({
    ...(stage.label !== undefined ? { label: stage.label } : {}),
    ...(stage.enabled !== undefined ? { enabled: stage.enabled } : {}),
    ...(stage.condition !== undefined ? { condition: stage.condition } : {}),
    upToCents: i === stages.length - 1 ? null : stages[i + 1]!.fromCents - 1,
    targets: stage.targets,
  }));
}

export function validateTargetPolicy(policy: TargetPolicy, activeIds: ReadonlySet<string>): void {
  const validate = (targets: ManagedTarget[]) => {
    if (!targets.length || targets.length > 50)
      throw new RangeError('Bitte zwischen einer und 50 Anlageklassen berücksichtigen.');
    const seen = new Set<string>();
    for (const t of targets) {
      if (!activeIds.has(t.assetClassId))
        throw new RangeError('Bitte eine aktive Anlageklasse wählen.');
      if (seen.has(t.assetClassId))
        throw new RangeError('Eine Anlageklasse ist doppelt angegeben.');
      seen.add(t.assetClassId);
      for (const value of [t.targetShareBp, t.bandBp ?? 0])
        if (!Number.isSafeInteger(value) || value < 0 || value > 10000)
          throw new RangeError('Bitte einen Wert zwischen 0,00 und 100,00 % eingeben.');
      if (t.bandMode && !['standard', 'custom'].includes(t.bandMode))
        throw new RangeError('Bitte Standard oder Individuell als Band wählen.');
    }
    const sum = targets.reduce((total, t) => total + t.targetShareBp, 0);
    if (sum !== 10000)
      throw new RangeError(
        `Die Sollquoten ergeben ${(sum / 100).toFixed(2).replace('.', ',')} %. Erforderlich sind genau 100,00 %.`,
      );
  };
  validate(policy.targets);
  if (policy.tiers.length > 10) throw new RangeError('Höchstens zehn Stufen sind möglich.');
  let previous = -1;
  for (const [i, tier] of policy.tiers.entries()) {
    validate(tier.targets);
    if ((tier.label?.length ?? 0) > 80 || (tier.condition?.length ?? 0) > 240)
      throw new RangeError('Stufenname oder Freigabehinweis ist zu lang.');
    if (tier.enabled !== undefined && typeof tier.enabled !== 'boolean')
      throw new RangeError('Bitte den Freigabestatus der Stufe prüfen.');
    if (i === 0 && tier.enabled === false)
      throw new RangeError('Die erste Vermögensstufe muss freigegeben sein.');
    if (i === policy.tiers.length - 1) {
      if (tier.upToCents !== null)
        throw new RangeError('Die letzte Stufe muss nach oben offen sein.');
    } else {
      if (
        tier.upToCents === null ||
        !Number.isSafeInteger(tier.upToCents) ||
        tier.upToCents < 0 ||
        tier.upToCents <= previous
      )
        throw new RangeError('Stufengrenzen müssen aufsteigende, positive Eurobeträge sein.');
      previous = tier.upToCents;
    }
  }
}

/** Null valuation means no tier can be asserted. Never silently fall back to another policy. */
export function resolveTargetTier(policy: TargetPolicy, investmentCents: number | null) {
  if (!policy.tiers.length) return { targets: policy.targets, tierIndex: null };
  if (investmentCents === null) return { targets: [] as ManagedTarget[], tierIndex: null };
  const found = policy.tiers.findIndex(
    (t) => t.upToCents === null || investmentCents <= t.upToCents,
  );
  // A stored policy without an open last tier is invalid; read it as if the last tier were open.
  let tierIndex = found === -1 ? policy.tiers.length - 1 : found;
  while (tierIndex > 0 && policy.tiers[tierIndex]!.enabled === false) tierIndex--;
  return { targets: policy.tiers[tierIndex]!.targets, tierIndex };
}
