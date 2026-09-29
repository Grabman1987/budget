import { cents, type Cents } from '../money/cents';

/**
 * Dimension chains must add up as displayed. When the euro-rounded parts miss the displayed
 * result by a few euros, the largest part of that segment absorbs the difference, so the chain
 * keeps matching the headline. Port of `balanceChain` in `design/prototype/reports-core.js`.
 */

export type ChainOp = '+' | '-' | '=';

export interface ChainTerm {
  label: string;
  /** Exact amount of the term (a subtracted term is given as its positive magnitude). */
  value: Cents;
  /** Operator in front of the term; omitted on the first term. `=` marks a result. */
  op?: ChainOp;
  /** Show an explicit `+` in front of positive values. */
  signed?: boolean;
  /** Emphasise the term as the chain's result. */
  result?: boolean;
}

/** Largest gap, in euros, that rounding alone may explain. Anything bigger is a real mismatch. */
const MAX_ABSORBED_EUROS = 4;

function roundToEuro(value: number): number {
  const abs = Math.abs(value);
  const euros = Math.trunc(abs / 100) + (abs % 100 >= 50 ? 1 : 0);
  return (value < 0 ? -euros : euros) * 100;
}

interface Movable {
  index: number;
  value: number;
  sign: 1 | -1;
}

export function balanceChain(
  terms: readonly ChainTerm[],
  precision: 'euro' | 'cent' = 'euro',
): ChainTerm[] {
  if (precision === 'cent') return terms.map((t) => ({ ...t }));

  const out = terms.map((t) => ({ ...t, value: cents(roundToEuro(t.value)) }));
  let segment: Movable[] = [];
  let sum = 0;
  for (let i = 0; i < out.length; i++) {
    const term = out[i];
    if (!term) continue;
    if (term.op === '=') {
      const gap = term.value - sum;
      if (gap !== 0 && Math.abs(gap) <= MAX_ABSORBED_EUROS * 100 && segment.length > 0) {
        const largest = segment.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a));
        const target = out[largest.index];
        if (target) target.value = cents(largest.value + gap * largest.sign);
      }
      // The result starts the next segment and is never moved itself.
      sum = term.value;
      segment = [];
      continue;
    }
    const sign = term.op === '-' ? -1 : 1;
    sum += sign * term.value;
    segment.push({ index: i, value: term.value, sign });
  }
  return out;
}
