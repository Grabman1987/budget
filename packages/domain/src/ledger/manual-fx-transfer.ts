import { z } from 'zod';
import { cents } from '../money';
import { cashValuation, convertCashCents, type CashValuation } from './cash-valuation';

const identity = z.string().refine((value) => value.trim().length > 0);
const currency = z.string().regex(/^[A-Z]{3}$/);
const positiveInteger = z.number().int().positive();
const nativeLeg = z.strictObject({
  accountId: identity,
  currency,
  // Native cents mean hundredths of the named currency, as in the existing cash domain.
  amountCents: positiveInteger,
  onBudget: z.boolean(),
});
const rate = z.strictObject({ date: z.iso.date(), rateMicro: positiveInteger, source: identity });
const executionQuote = rate.extend({ baseCurrency: currency, quoteCurrency: currency });
const fee = z.strictObject({
  side: z.enum(['from', 'to']),
  currency,
  amountCents: positiveInteger,
  categoryId: identity,
  source: identity,
});
const inputSchema = z.strictObject({
  date: z.iso.date(),
  from: nativeLeg,
  to: nativeLeg,
  /** One base unit buys rateMicro / 1e6 quote units. Never inferred from the principals. */
  executionQuote,
  /** Required only when crossing budget/tracking scope; never defaults to general income. */
  principalCategoryId: identity.nullable(),
  costs: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('none') }),
    z.strictObject({ kind: z.literal('separate'), fees: z.array(fee).min(1) }),
    z.strictObject({ kind: z.enum(['embedded-fee', 'spread', 'unknown']) }),
  ]),
  /** Caller supplies the existing resolver's dated EUR-per-native-unit observations. */
  referenceRates: z.strictObject({ from: rate.optional(), to: rate.optional() }),
});

export type ManualFxTransferInput = z.infer<typeof inputSchema>;

export interface FxPrincipalLeg {
  accountId: string;
  currency: string;
  amountCents: number;
  categoryId: string | null;
  transferAccountId: string;
}

export interface FxFeePosting {
  accountId: string;
  currency: string;
  amountCents: number;
  categoryId: string;
  source: string;
}

export type ManualFxTransferPlan =
  | { status: 'manual-review'; reason: 'invalid-input' | 'unsupported-costs' | 'unsafe-amount' }
  | {
      status: 'ready';
      date: string;
      principalLegs: [FxPrincipalLeg, FxPrincipalLeg];
      fees: FxFeePosting[];
      executionQuote: ManualFxTransferInput['executionQuote'];
      quoteComparison: {
        currency: string;
        expectedCents: number;
        actualCents: number;
        differenceCents: number;
      };
      referenceValuation: {
        principal: [CashValuation, CashValuation];
        fees: CashValuation[];
        /** Destination minus source at dated reference FX; disclosure, never a cash booking. */
        executionEffectEurCents: number | null;
        totalChangeEurCents: number | null;
      };
    };

function sumSafe(amounts: readonly number[]): number {
  return cents(Number(amounts.reduce((sum, amount) => sum + BigInt(amount), 0n)));
}

function sumValuations(values: readonly CashValuation[]): number | null {
  if (values.some((value) => value.eurCents === null)) return null;
  return sumSafe(values.map((value) => value.eurCents!));
}

/**
 * Non-writing preparation only. Native principals are authoritative, including discrepancies
 * against the explicit quote. Rounding reuses existing cash conversion (half away from zero).
 * No rate-derived fee, income, balancing leg or historical pairing is manufactured.
 *
 * This plan is not a persistence authorization: account eligibility, category existence, locks,
 * atomic writes, audit, idempotency and grouped undo remain gates for the later repository stage.
 * Existing same-currency transfer writers and shared financial figures are not connected here.
 */
export function planManualFxTransfer(input: unknown): ManualFxTransferPlan {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: 'manual-review', reason: 'invalid-input' };
  const {
    date,
    from,
    to,
    executionQuote: quote,
    costs,
    principalCategoryId,
    referenceRates,
  } = parsed.data;
  if (costs.kind !== 'none' && costs.kind !== 'separate')
    return { status: 'manual-review', reason: 'unsupported-costs' };

  const forward = quote.baseCurrency === from.currency && quote.quoteCurrency === to.currency;
  const reverse = quote.baseCurrency === to.currency && quote.quoteCurrency === from.currency;
  const crossesBudget = from.onBudget !== to.onBudget;
  const explicitFees = costs.kind === 'separate' ? costs.fees : [];
  if (
    from.accountId === to.accountId ||
    from.currency === to.currency ||
    (!forward && !reverse) ||
    quote.date > date ||
    crossesBudget !== (principalCategoryId !== null) ||
    explicitFees.some((charge) => charge.currency !== parsed.data[charge.side].currency)
  )
    return { status: 'manual-review', reason: 'invalid-input' };

  try {
    // Divide by the original reverse quote, never a rounded reciprocal or an implied rate.
    const expectedCents = convertCashCents(
      from.amountCents,
      forward ? quote.rateMicro : 1_000_000,
      forward ? 1_000_000 : quote.rateMicro,
    );
    const principalLegs: [FxPrincipalLeg, FxPrincipalLeg] = [
      {
        accountId: from.accountId,
        currency: from.currency,
        amountCents: -from.amountCents,
        categoryId: crossesBudget && from.onBudget ? principalCategoryId : null,
        transferAccountId: to.accountId,
      },
      {
        accountId: to.accountId,
        currency: to.currency,
        amountCents: to.amountCents,
        categoryId: crossesBudget && to.onBudget ? principalCategoryId : null,
        transferAccountId: from.accountId,
      },
    ];
    const fees = explicitFees.map((charge) => ({
      accountId: parsed.data[charge.side].accountId,
      currency: charge.currency,
      amountCents: -charge.amountCents,
      categoryId: charge.categoryId,
      source: charge.source,
    }));
    for (const leg of principalLegs) {
      sumSafe([
        leg.amountCents,
        ...fees
          .filter((charge) => charge.accountId === leg.accountId)
          .map((charge) => charge.amountCents),
      ]);
    }
    const principal: [CashValuation, CashValuation] = [
      cashValuation(-from.amountCents, from.currency, date, referenceRates.from),
      cashValuation(to.amountCents, to.currency, date, referenceRates.to),
    ];
    const feeValues = explicitFees.map((charge) =>
      cashValuation(-charge.amountCents, charge.currency, date, referenceRates[charge.side]),
    );
    return {
      status: 'ready',
      date,
      principalLegs,
      fees,
      executionQuote: quote,
      quoteComparison: {
        currency: to.currency,
        expectedCents,
        actualCents: to.amountCents,
        differenceCents: sumSafe([to.amountCents, -expectedCents]),
      },
      referenceValuation: {
        principal,
        fees: feeValues,
        executionEffectEurCents: sumValuations(principal),
        totalChangeEurCents: sumValuations([...principal, ...feeValues]),
      },
    };
  } catch (error) {
    if (error instanceof RangeError) return { status: 'manual-review', reason: 'unsafe-amount' };
    throw error;
  }
}
