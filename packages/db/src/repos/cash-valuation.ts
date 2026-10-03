import { cashValuation, type CashRate } from '@budget/domain';
import { fxRateOnOrBefore } from './prices';
import type { Executor } from './types';

/** Request-local cache; uses the same stored on-or-before rate as overview cash valuation. */
export function cashValuer(db: Executor) {
  const rates = new Map<string, CashRate | undefined>();
  return (amountCents: number, currency: string, day: string) => {
    const key = `${currency}/${day}`;
    if (currency !== 'EUR' && !rates.has(key)) rates.set(key, fxRateOnOrBefore(db, currency, day));
    return cashValuation(amountCents, currency, day, rates.get(key));
  };
}
