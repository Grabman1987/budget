/** Synthetic stored signal series for tests only; closes are made-up numbers, never market data. */
import { usEquityScheduledSessions, usEquitySessionCompletedAt } from '@budget/domain';
import type { Db } from '../client';
import { price, priceAudit, security } from '../schema';
import { SIGNAL_INDEX } from './strategy-signal-evidence';

export function seedSignalInstrument(db: Db, over: Partial<typeof security.$inferInsert> = {}) {
  db.insert(security)
    .values({
      id: SIGNAL_INDEX.id,
      name: SIGNAL_INDEX.name,
      symbol: SIGNAL_INDEX.symbol,
      kind: 'other',
      currency: SIGNAL_INDEX.currency,
      allocationIncluded: false,
      quoteUrl: SIGNAL_INDEX.quoteUrl,
      quoteExchange: SIGNAL_INDEX.quoteExchange,
      ...over,
    })
    .run();
}

/** Scheduled sessions from `fromMonth` (YYYY-MM) up to and including `last`. */
export function scheduledSessionsThrough(fromMonth: string, last: string): string[] {
  const days: string[] = [];
  for (let m = fromMonth; m <= last.slice(0, 7);) {
    days.push(...(usEquityScheduledSessions(m) ?? []).filter((d) => d <= last));
    const [y, mo] = m.split('-').map(Number) as [number, number];
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }
  return days;
}

export interface SeedCloseOptions {
  source?: 'ariva' | 'yfinance' | 'manual';
  currency?: string;
  /** Hours after the session end that the close was stored (negative: before it ended). */
  observedAfterHours?: number;
  withAudit?: boolean;
}

/** Rising synthetic closes (points x 1e6) for the given sessions, with audit rows. */
export function seedSignalCloses(
  db: Db,
  sessions: readonly string[],
  options: (date: string, index: number) => SeedCloseOptions = () => ({}),
) {
  sessions.forEach((date, index) => {
    const o = options(date, index);
    const priceMicro = (10_000 + index) * 1_000_000;
    const source = o.source ?? 'ariva';
    db.insert(price)
      .values({
        securityId: SIGNAL_INDEX.id,
        date,
        priceMicro,
        currency: o.currency ?? 'USD',
        source,
      })
      .run();
    if (o.withAudit !== false)
      db.insert(priceAudit)
        .values({
          id: `audit-${date}`,
          securityId: SIGNAL_INDEX.id,
          date,
          oldPriceMicro: null,
          newPriceMicro: priceMicro,
          oldSource: null,
          newSource: source,
          ts: new Date(
            Date.parse(usEquitySessionCompletedAt(date)) + (o.observedAfterHours ?? 5) * 3_600_000,
          ).toISOString(),
        })
        .run();
  });
}
