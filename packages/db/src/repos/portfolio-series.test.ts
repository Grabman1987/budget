import { addDays, eachDay } from '@budget/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  cashSeries,
  holdingValuesAsOf,
  netWorthAsOf,
  netWorthDaily,
  portfolioFlows,
  valuationSeries,
} from './portfolio';
import { seedBasics } from './test-helpers';

let opened: OpenedDatabase;

/** Deterministic pseudo-random numbers (no Math.random: the test must be repeatable). */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const FROM = '2026-01-05';
const TO = '2026-06-30';

beforeAll(() => {
  opened = createTestDatabase();
  seedBasics(opened.db); // giro 1.000 EUR on-budget, spar, usd (a USD account)
  const rnd = rng(42);
  const pick = (n: number) => Math.floor(rnd() * n);
  const sql: string[] = [
    `INSERT INTO account (id, name, type, role, on_budget, opening_date, sort_order) VALUES
      ('d1', 'Depot 1', 'brokerage', 'investment', 0, '2023-10-01', 4),
      ('d2', 'Depot 2', 'brokerage', 'investment', 0, '2023-10-01', 5),
      ('ref', 'Referenz', 'checking', 'reserve', 0, '2023-10-01', 6)`,
    `INSERT INTO security (id, name, kind, currency) VALUES
      ('eur', 'EUR-ETF', 'etf', 'EUR'), ('us', 'US-Aktie', 'stock', 'USD'), ('gone', 'Gelöscht', 'stock', 'EUR')`,
    `UPDATE security SET deleted_at = '2026-01-01 00:00:00' WHERE id = 'gone'`,
    `INSERT INTO holding (id, security_id, account_id, as_of, units_e8) VALUES
      ('h1', 'us', 'd1', '2026-01-10', 1000000000), ('h2', 'eur', 'd1', '2026-03-01', 500000000),
      ('h3', 'gone', 'd1', '2026-01-10', 100000000)`,
  ];
  // Rates from before the window (weekly), prices on weekdays with gaps, random trades.
  for (let d = '2025-12-01'; d <= TO; d = addDays(d, 7))
    sql.push(
      `INSERT INTO fx_rate (date, currency, rate_micro) VALUES ('${d}', 'USD', ${850_000 + pick(150_000)})`,
    );
  for (const [id, cur, base] of [
    ['eur', 'EUR', 90_000_000],
    ['us', 'USD', 150_000_000],
  ] as const)
    for (let d = '2025-12-15'; d <= TO; d = addDays(d, 1))
      if (rnd() < 0.7)
        sql.push(
          `INSERT INTO price (security_id, date, price_micro, currency, source) VALUES ('${id}', '${d}', ${base + pick(20_000_000)}, '${cur}', 'import')`,
        );
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const day = addDays('2026-01-01', pick(180));
    const account = ['d1', 'd2'][pick(2)];
    const sec = ['eur', 'us'][pick(2)];
    const kind = ['buy', 'buy', 'sell', 'dividend', 'split', 'fee'][pick(6)] as string;
    const units = pick(300_000_000) + 1_000_000;
    const [u, amount] =
      kind === 'buy'
        ? [units, 10_000 + pick(90_000)]
        : kind === 'sell'
          ? [-units, 10_000 + pick(90_000)]
          : kind === 'split'
            ? [units, 0]
            : [0, 500 + pick(2_000)];
    sql.push(
      `INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents, fee_cents, tax_cents, import_key)
       VALUES ('t${n}', '${sec}', '${account}', '${day}', '${kind}', ${u}, ${amount}, ${pick(200)}, ${pick(100)}, 'k${n}')`,
    );
    n++;
  }
  for (let i = 0; i < 25; i++) {
    const acc = ['giro', 'spar', 'usd'][pick(3)];
    sql.push(
      `INSERT INTO booking (id, account_id, date, amount_cents, currency) VALUES ('b${i}', '${acc}', '${addDays('2026-01-01', pick(180))}', ${pick(200_000) - 80_000}, '${acc === 'usd' ? 'USD' : 'EUR'}')`,
    );
  }
  // Transfers: 500 EUR from giro into the reference account (boundary), 200 EUR ref -> d1 (inside).
  sql.push(
    `INSERT INTO transfer (id) VALUES ('x1'), ('x2'), ('x3')`,
    `INSERT INTO booking (id, account_id, date, amount_cents, transfer_id) VALUES
      ('xa', 'ref', '2026-03-01', 50000, 'x1'), ('xb', 'giro', '2026-03-01', -50000, 'x1'),
      ('xc', 'ref', '2026-04-10', -20000, 'x2'), ('xd', 'd1', '2026-04-10', 20000, 'x2'),
      ('xe', 'ref', '2026-05-02', -10000, 'x3'), ('xf', 'spar', '2026-05-02', 10000, 'x3')`,
  );
  opened.sqlite.exec(sql.join(';\n'));
});

describe('daily series equal the as-of readers', () => {
  it('valuationSeries equals holdingValuesAsOf on every day of the window', () => {
    const series = valuationSeries(opened.db, { from: FROM, to: TO });
    const days = eachDay(FROM, TO);
    expect(series.days).toEqual(days);
    expect(series.positions.length).toBeGreaterThanOrEqual(3);
    expect(series.totalCents.some((v) => v > 0)).toBe(true);
    expect(series.positions.some((p) => p.securityId === 'gone')).toBe(false);
    // Every 4th day plus the last one keeps the test fast and still covers every weekday.
    days.forEach((day, i) => {
      if (i % 4 !== 0 && day !== TO) return;
      const expected = holdingValuesAsOf(opened.db, day);
      const got = series.positions
        .map((p) => ({
          accountId: p.accountId,
          securityId: p.securityId,
          unitsE8: p.unitsE8[i],
          valueCents: p.valueCents[i],
        }))
        .filter((p) => p.unitsE8 !== 0);
      expect(
        got.map((p) => [p.accountId, p.securityId, p.unitsE8, p.valueCents]),
        day,
      ).toEqual(expected.map((h) => [h.accountId, h.securityId, h.unitsE8, h.valueCents]));
      expect(series.totalCents[i], day).toBe(expected.reduce((a, h) => a + h.valueCents, 0));
    });
  });

  it('netWorthDaily equals netWorthAsOf on 50 random days and splits own and market', () => {
    const daily = netWorthDaily(opened.db, FROM, TO);
    expect(daily[0]?.date).toBe(FROM);
    expect(daily.at(-1)?.date).toBe(TO);
    const rnd = rng(7);
    for (let i = 0; i < 50; i++) {
      const row = daily[Math.floor(rnd() * daily.length)]!;
      expect(row.netWorthCents, row.date).toBe(netWorthAsOf(opened.db, row.date).totalCents);
    }
    // Change = market + own on every day; the cumulative sums add up to the total change.
    for (const row of daily) expect(row.changeCents).toBe(row.marketCents + row.ownCents);
    const last = daily.at(-1)!;
    expect(last.cumulativeMarketCents + last.cumulativeOwnCents).toBe(
      last.netWorthCents - netWorthAsOf(opened.db, addDays(FROM, -1)).totalCents,
    );
  });

  it('cashSeries per account equals the balances of netWorthAsOf', () => {
    const days = ['2026-01-04', '2026-03-15', TO];
    const cash = cashSeries(opened.db, days, ['giro', 'usd', 'ref']);
    days.forEach((day, i) => {
      const nw = netWorthAsOf(opened.db, day);
      for (const id of ['giro', 'usd', 'ref'])
        expect(cash.get(id)?.[i], `${id} ${day}`).toBe(nw.byAccount[id]);
    });
  });
});

describe('portfolio flows', () => {
  it('securities view: buys in, sales out, only the window and the chosen accounts', () => {
    const all = portfolioFlows(opened.db, { from: '2026-01-01', to: TO });
    const d2 = portfolioFlows(opened.db, { accounts: ['d2'], from: '2026-01-01', to: TO });
    const later = portfolioFlows(opened.db, { from: '2026-04-01', to: TO });
    expect(all.length).toBeGreaterThan(0);
    expect(d2.length).toBeGreaterThan(0);
    expect(later.every((f) => f.date > '2026-04-01')).toBe(true);
    expect([...all].map((f) => f.date)).toEqual([...all].map((f) => f.date).sort());
    expect(d2.reduce((a, f) => a + f.cents, 0)).not.toBe(all.reduce((a, f) => a + f.cents, 0));
  });

  it('depot view: only the transfer that crosses the boundary', () => {
    expect(
      portfolioFlows(opened.db, {
        view: 'depot',
        accounts: ['d1'],
        referenceAccounts: ['ref'],
        from: '2026-01-01',
        to: TO,
      }),
    ).toEqual([
      { date: '2026-03-01', cents: 50_000 }, // from giro
      { date: '2026-05-02', cents: -10_000 }, // to spar; the move to d1 is internal
    ]);
    // Without d1 in the portfolio the move to d1 is a withdrawal, too.
    expect(
      portfolioFlows(opened.db, {
        view: 'depot',
        referenceAccounts: ['ref'],
        from: '2026-04-01',
        to: TO,
      }),
    ).toEqual([
      { date: '2026-04-10', cents: -20_000 },
      { date: '2026-05-02', cents: -10_000 },
    ]);
  });
});
