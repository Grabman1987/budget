import { assignmentSplits } from '../assignment-rules';

/** Percent values are basis points; fixed shares are integer cents of the gross line. */
export function bookingLineShares(
  amountCents: number,
  shares: ReadonlyArray<{ mode: 'percent' | 'amount'; value: number }>,
): { categoryCents: number; contactCents: number[] } {
  const invalid = () =>
    new RangeError('Die Kontakt-Anteile überschreiten den Zeilenbetrag oder sind ungültig.');
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0 ||
    shares.some(
      (s) =>
        !Number.isSafeInteger(s.value) || s.value < 0 || (s.mode === 'percent' && s.value > 10000),
    )
  )
    throw invalid();
  const percent = shares.filter((s) => s.mode === 'percent');
  const weight = percent.reduce((sum, s) => sum + s.value, 0);
  if (!Number.isSafeInteger(weight) || weight > 10000) throw invalid();
  // Existing largest-remainder allocation; category first wins equal fractional remainders.
  const allocated = assignmentSplits(amountCents, [
    { categoryId: 'category', weightBp: 10000 - weight },
    ...percent.map((s, i) => ({ categoryId: String(i), weightBp: s.value })),
  ]);
  let index = 1;
  const contactCents = shares.map((s) =>
    s.mode === 'amount' ? s.value : allocated[index++]!.amountCents,
  );
  const sum = contactCents.reduce((total, value) => total + value, 0);
  if (!Number.isSafeInteger(sum) || sum > amountCents) throw invalid();
  return { categoryCents: amountCents - sum, contactCents };
}
