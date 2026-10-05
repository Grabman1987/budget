/** Cent-exact residual of the existing savings, investment and net-worth read models. */
export function reconcileWholePicture(
  startCents: number,
  endCents: number,
  savedCents: number,
  marketCents: number,
) {
  const deltaCents = endCents - startCents;
  const otherCents = deltaCents - savedCents - marketCents;
  if (
    ![startCents, endCents, savedCents, marketCents, deltaCents, otherCents].every(
      Number.isSafeInteger,
    )
  )
    throw new RangeError('Whole-picture cents exceed the safe integer range');
  return { deltaCents, otherCents };
}

/** Recorded payments less net booked interest/fees; fee refunds never create extra payments. */
export function recordedPrincipal(paymentCents: number, costCents: number) {
  return Math.max(0, paymentCents - Math.max(0, costCents));
}
