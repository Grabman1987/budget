import type { TradeKind } from './series';

/**
 * Rules of one trade (Portfolio Performance vocabulary), shared by the API and the repositories:
 * the sign of the units per kind and the cash a trade moves on its investment account.
 */

/** Units per kind: buy and delivery in > 0, sell and delivery out < 0, split <> 0, others 0. */
export function unitsRuleViolation(kind: TradeKind, unitsE8: number): string | null {
  if (!Number.isSafeInteger(unitsE8)) return 'Units must be a whole number of 1e-8 units';
  switch (kind) {
    case 'buy':
    case 'delivery_in':
      return unitsE8 > 0 ? null : `A ${kind} adds units: units must be positive`;
    case 'sell':
    case 'delivery_out':
      return unitsE8 < 0 ? null : `A ${kind} removes units: units must be negative`;
    case 'split':
      return unitsE8 !== 0 ? null : 'A split changes the units: units must not be 0';
    default:
      return unitsE8 === 0 ? null : `A ${kind} moves money only: units must be 0`;
  }
}

export interface TradeMoney {
  kind: TradeKind;
  amountCents: number;
  feeCents: number;
  taxCents: number;
}

/** Fee and tax on top of the gross amount only exist on these kinds. */
const WITH_FEE_AND_TAX: ReadonlySet<TradeKind> = new Set(['sell', 'dividend', 'interest']);

/** Amounts are whole non-negative cents; fee and tax only where they make sense (buy: fee only). */
export function moneyRuleViolation(t: TradeMoney): string | null {
  for (const [name, v] of [
    ['amount', t.amountCents],
    ['fee', t.feeCents],
    ['tax', t.taxCents],
  ] as const)
    if (!Number.isSafeInteger(v) || v < 0)
      return `The ${name} must be a whole number of cents, 0 or more`;
  if (t.taxCents > 0 && !WITH_FEE_AND_TAX.has(t.kind)) return `A ${t.kind} has no tax`;
  if (t.feeCents > 0 && t.kind !== 'buy' && !WITH_FEE_AND_TAX.has(t.kind))
    return `A ${t.kind} has no separate fee`;
  if (
    (t.kind === 'sell' || t.kind === 'dividend' || t.kind === 'interest') &&
    t.feeCents + t.taxCents > t.amountCents
  )
    return 'Fee and tax cannot exceed the gross amount';
  return null;
}

/**
 * Cash a trade moves on its investment account (signed cents): buy = -(amount + fee), sell =
 * amount - fee - tax, dividend and interest = amount - fee - tax, a standalone fee or tax =
 * -amount. Deliveries and splits move no money. The settlement booking carries exactly this.
 */
export function settlementCents(t: TradeMoney): number {
  switch (t.kind) {
    case 'buy':
      return -(t.amountCents + t.feeCents);
    case 'sell':
    case 'dividend':
    case 'interest':
      return t.amountCents - t.feeCents - t.taxCents;
    case 'fee':
    case 'tax':
      return -t.amountCents;
    default:
      return 0;
  }
}

/** Dividends and interest are income (Kapitalerträge) on the settlement booking. */
export const isIncomeTrade = (kind: TradeKind): boolean =>
  kind === 'dividend' || kind === 'interest';
