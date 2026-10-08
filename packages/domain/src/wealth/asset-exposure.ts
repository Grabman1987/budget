export interface AssetExposureWeight {
  assetClassId: string | null;
  weightBp: number;
}

/** Exact signed-cent split; deterministic ties follow class id. Unknown remainder stays visible. */
export function splitAssetExposure(valueCents: number, weights: readonly AssetExposureWeight[]) {
  if (!Number.isSafeInteger(valueCents)) throw new RangeError('Ungültiger Centbetrag.');
  const sum = weights.reduce((a, w) => a + w.weightBp, 0);
  if (weights.some((w) => !Number.isInteger(w.weightBp) || w.weightBp < 0) || sum > 10000)
    throw new RangeError('Die Klassengewichte dürfen höchstens 100,00 % ergeben.');
  const entries = [...weights].sort((a, b) =>
    (a.assetClassId ?? '\uffff').localeCompare(b.assetClassId ?? '\uffff'),
  );
  if (sum < 10000) entries.push({ assetClassId: null, weightBp: 10000 - sum });
  const sign = valueCents < 0 ? -1 : 1;
  const abs = Math.abs(valueCents);
  // Exact in plain numbers while abs * 10000 stays a safe integer (up to ~9 billion euros); only
  // larger values need BigInt. Both paths floor the same way and keep the same remainders.
  const exact = abs * 10000 <= Number.MAX_SAFE_INTEGER;
  const total = exact ? 0n : BigInt(abs);
  const parts = entries.map((e) => {
    if (exact) {
      const num = abs * e.weightBp;
      return { ...e, valueCents: Math.floor(num / 10000), remainder: num % 10000 };
    }
    const num = total * BigInt(e.weightBp);
    return { ...e, valueCents: Number(num / 10000n), remainder: Number(num % 10000n) };
  });
  let rest = Math.abs(valueCents) - parts.reduce((a, p) => a + p.valueCents, 0);
  for (const p of [...parts].sort((a, b) =>
    a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1,
  )) {
    if (rest-- <= 0) break;
    p.valueCents++;
  }
  return parts.map(({ assetClassId, weightBp, valueCents: value }) => ({
    assetClassId,
    weightBp,
    valueCents: value === 0 ? 0 : sign * value,
  }));
}
