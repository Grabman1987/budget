/** Money is an integer number of cents. Floats never represent stored amounts. */
export type Cents = number & { readonly __brand: 'Cents' };

/** Validate and brand an integer cent value. Throws on floats, NaN and unsafe integers. */
export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Cents must be a safe integer, got ${String(value)}`);
  }
  // Normalise -0 so that Object.is and JSON round trips behave.
  return (value === 0 ? 0 : value) as Cents;
}
