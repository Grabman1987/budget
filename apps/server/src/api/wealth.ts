import { debtRoutes } from './debts';
import {
  accountValuesAsOf,
  earliestAccountDate,
  netWorthAsOf,
  netWorthDaily,
  priceStand,
  type Db,
} from '@budget/db';
import { addDays, bucketNetWorth, netWorthWindow, periodWindow, type Period } from '@budget/domain';
import { Hono } from 'hono';
import { z } from 'zod';
import { readQuery } from './http';

const PERIODS = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'] as const satisfies readonly Period[];
const networthQuery = z.object({ period: z.enum(PERIODS).default('YTD') });

/** Vermögen read models: Nettovermögen (P5.4); Portfolio, Freiheitszahl and Schulden join later. */
export function wealthRoutes(db: Db, today: () => string): Hono {
  const app = new Hono();
  app.route('/debts', debtRoutes(db, today));

  /**
   * Net worth over a period: the daily series (first point = the start value, the close of the
   * window's start day), bars per week (up to 3 months) or month with own contribution and market,
   * the chain start + own + market = now, and what the net worth consists of per account. `now` is
   * `netWorthAsOf` of today, the same function the Konten overview figure comes from.
   */
  app.get('/networth', (c) => {
    const { period } = readQuery(c, networthQuery);
    const to = today();
    const earliest = earliestAccountDate(db) ?? to;
    const window = periodWindow(period, to, earliest);
    const from = window.from < earliest ? earliest : window.from;
    const startCents = netWorthAsOf(db, from).totalCents;
    const rows = from < to ? netWorthDaily(db, addDays(from, 1), to) : [];
    const chain = netWorthWindow(rows, startCents);
    const nowCents = netWorthAsOf(db, to).totalCents;
    if (chain.nowCents !== nowCents) throw new Error('Net worth series and netWorthAsOf disagree');

    const values = accountValuesAsOf(db, to);
    const byValue = (a: { valueCents: number }, b: { valueCents: number }) =>
      b.valueCents - a.valueCents;
    return c.json({
      period,
      from,
      to,
      stand: priceStand(db, to),
      chain,
      daily: [
        { date: from, netWorthCents: startCents },
        ...rows.map((r) => ({ date: r.date, netWorthCents: r.netWorthCents })),
      ],
      bars: {
        unit: period === '1M' || period === '3M' ? 'week' : 'month',
        buckets: bucketNetWorth(rows, period === '1M' || period === '3M' ? 'week' : 'month'),
      },
      composition: {
        assets: values.filter((a) => a.valueCents > 0).sort(byValue),
        debts: values.filter((a) => a.valueCents < 0).sort((a, b) => a.valueCents - b.valueCents),
      },
    });
  });

  /** The price "Stand" shown in the title block of every Vermögen page. */
  app.get('/stand', (c) => c.json(priceStand(db, today())));

  return app;
}
