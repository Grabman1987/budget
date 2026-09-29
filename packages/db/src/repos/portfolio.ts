import { marketValueCents, unitsHeld } from '@budget/domain';
import { and, isNull, lte } from 'drizzle-orm';
import { holding, price, security, trade } from '../schema';
import type { Executor } from './types';

export interface HoldingValue {
  securityId: string;
  unitsE8: number;
  priceMicro: number;
  valueCents: number;
}

/**
 * Market value of every product on a date: units held (latest holding snapshot plus later
 * trades) times the latest price on or before that date. Soft-deleted rows are ignored;
 * products without a price are valued 0.
 */
export function holdingValuesAsOf(db: Executor, asOf: string): HoldingValue[] {
  const securities = db
    .select({ id: security.id })
    .from(security)
    .where(isNull(security.deletedAt))
    .all();
  const snapshots = db
    .select()
    .from(holding)
    .where(and(lte(holding.asOf, asOf), isNull(holding.deletedAt)))
    .all();
  const trades = db
    .select({ securityId: trade.securityId, date: trade.date, unitsE8: trade.unitsE8 })
    .from(trade)
    .where(and(lte(trade.date, asOf), isNull(trade.deletedAt)))
    .all();
  const prices = db.select().from(price).where(lte(price.date, asOf)).all();

  return securities.map(({ id }) => {
    const snapshot = snapshots
      .filter((h) => h.securityId === id)
      .sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
    const units = unitsHeld(
      snapshot ? { asOf: snapshot.asOf, unitsE8: snapshot.unitsE8 } : undefined,
      trades.filter((t) => t.securityId === id),
      asOf,
    );
    const latest = prices
      .filter((p) => p.securityId === id)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const priceMicro = latest?.priceMicro ?? 0;
    return {
      securityId: id,
      unitsE8: units,
      priceMicro,
      valueCents: marketValueCents(units, priceMicro),
    };
  });
}
