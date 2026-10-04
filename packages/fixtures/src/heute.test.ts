import {
  createTestDatabase,
  ensureDefaultRules,
  heute as readHeute,
  matchOccurrences,
  nextSteps,
  refreshOccurrences,
  type Db,
  type Heute,
} from '@budget/db';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from './seed';
import { DEFAULT_ACTIVE_RULE_COUNT } from '@budget/domain';

/**
 * The Heute read model on the synthetic sample ledger at 17.09.2026, against the figures of the
 * prototype (`design/prototype/app.js`) wherever the ledger defines them. Where it does not, the
 * comments say how the real figure differs and why.
 */
vi.setConfig({ testTimeout: 120_000 });

const TODAY = '2026-09-17';

let db: Db;
// These fully quoted sample cases must fail if either section becomes unavailable.
function heute(...args: Parameters<typeof readHeute>) {
  const result = readHeute(...args);
  const { netWorth, financeCheck } = result;
  if ('unavailable' in netWorth || 'unavailable' in financeCheck)
    throw new Error('Sample valuation must be available');
  return { ...result, netWorth, financeCheck };
}
let month: ReturnType<typeof heute>;
let payday: ReturnType<typeof heute>;
let unrefreshed: ReturnType<typeof heute>;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
  ensureDefaultRules(db);
  // Without materialised occurrences the model reads the schedule.
  unrefreshed = heute(db, { today: TODAY, period: 'month' });
  refreshOccurrences(db, TODAY);
  matchOccurrences(db, TODAY);
  month = heute(db, { today: TODAY, period: 'month' });
  payday = heute(db, { today: TODAY, period: 'payday' });
}, 240_000);

describe('prototype figures reproduced', () => {
  it('net worth 84.730 EUR with liquid 9.356, invested 88.000, debt -12.626', () => {
    expect(month.netWorth).toMatchObject({
      totalCents: 8_473_000,
      liquidCents: 935_600,
      investedCents: 8_800_000,
      debtCents: -1_262_600,
      receivableCents: 0,
    });
    const n = month.netWorth;
    expect(n.liquidCents + n.investedCents + n.debtCents).toBe(n.totalCents);
  });

  it('delta to the previous month end: -1.014 EUR, -1,2 % (prototype 85.744 to 84.730)', () => {
    const n = month.netWorth;
    expect(Math.round(n.previousMonthEndCents / 100)).toBe(85_744);
    expect(Math.round(n.deltaCents / 100)).toBe(-1014);
    expect(n.deltaBp).toBe(-118);
    expect(n.series).toHaveLength(12);
    expect(n.series[11]).toEqual({ day: TODAY, cents: 8_473_000 });
    // The prototype's series starts 63.606, 71.456 (whole euros).
    expect(n.series.map((s) => Math.round(s.cents / 100)).slice(0, 2)).toEqual([63_606, 71_456]);
  });

  it('the planning payday is the 15th while the stored salary jump keeps its actual schedule', () => {
    expect(month.stand.payday).toEqual({
      day: '2026-10-15',
      source: 'payday_rule',
      daysToPayday: 28,
    });
    expect(month.balance.salary).toEqual({ day: '2026-09-30', cents: 381_200 });
  });

  it('deducts the literal scheduled bills before 15 October, excluding bills due on payday', () => {
    expect(month.lead.items.open.map((o) => [o.day, o.label, o.cents])).toEqual([
      ['2026-09-20', 'Streaming', 1799],
      ['2026-09-22', 'Mobilfunk', 2500],
      ['2026-09-25', 'Strom', 10_500],
      ['2026-09-30', 'Kontoführung', 690],
      ['2026-10-01', 'Fitnessstudio', 4_200],
      ['2026-10-01', 'Miete', 89_000],
      ['2026-10-03', 'Kreditrate', 41_200],
      ['2026-10-05', 'Zeitung digital', 1_290],
      // USD 20/10 at the fixture's last known EUR rate (rounded to cents).
      ['2026-10-08', 'KI-Assistent', 1_695],
      ['2026-10-10', 'Kfz-Versicherung', 4_800],
      ['2026-10-10', 'Unfallversicherung', 2_800],
      ['2026-10-12', 'Cloud-Speicher', 299],
      ['2026-10-12', 'Geschenke (Oktober)', 10_000],
      ['2026-10-14', 'KI-Bildtool', 848],
    ]);
    expect(month.lead.openCents).toBe(171_621);
  });

  it('five envelopes are pinned in the prototype order', () => {
    expect(month.pinned.map((p) => p.name)).toEqual([
      'Lebensmittel',
      'Treibstoff',
      'Lieferdienste',
      'Freizeit',
      'Essen gehen',
    ]);
    // Lebensmittel: spent 388 EUR of the month, as in the prototype.
    expect(month.pinned[0]?.spentCents).toBe(38_800);
    expect(month.pinned[2]).toMatchObject({ name: 'Lieferdienste', overspentCents: 1019 });
  });

  it('the upcoming 14 days list the three bills and the salary', () => {
    const rows = month.upcoming14.map((o) => `${o.dueDate} ${o.name}`);
    for (const r of ['2026-09-20 Streaming', '2026-09-22 Mobilfunk', '2026-09-25 Strom'])
      expect(rows).toContain(r);
    expect(month.upcoming14.find((o) => o.name === 'Gehalt')).toMatchObject({
      dueDate: '2026-09-30',
      amountCents: 381_200,
      kind: 'inflow',
    });
    expect(month.upcoming14.every((o) => o.dueDate >= TODAY && o.dueDate <= '2026-10-01')).toBe(
      true,
    );
  });

  it('the Finanz-Check counts enabled rules and keeps the six key ones, most severe first', () => {
    expect(month.financeCheck.counts.total).toBe(DEFAULT_ACTIVE_RULE_COUNT);
    expect(month.financeCheck.keyRules.map((r) => r.code).sort()).toEqual(
      ['R01', 'R02', 'R03', 'R07', 'R08', 'R15'].sort(),
    );
    expect(month.financeCheck.keyRules[0]?.status).toBe('bad');
  });
});

describe('figures that differ from the prototype, by design of the ledger', () => {
  // The prototype's envelopes are hand-set (Frei verfuegbar 1.084,60, Pace -178, Tiefpunkt 612).
  // The ledger derives them from 36 months of bookings, so these are the real figures.
  it('free until payday follows the ledger envelopes, the chain adds up', () => {
    expect(month.lead.freeCents).toBe(98_826);
    expect(month.lead.needCents + month.lead.wantCents - month.lead.openCents).toBe(
      month.lead.freeCents,
    );
    const [need, want, open, free] = month.lead.chain.map((t) => t.value);
    expect((need ?? 0) + (want ?? 0) - (open ?? 0)).toBe(free);
  });

  it('pace: known fixed payments are timed once; the forecast curve ends at the forecast', () => {
    const f = month.pace.figures;
    expect(f).toMatchObject({ spentCents: 256_795, planToDateCents: 260_567, deltaCents: -3_772 });
    expect(f.over).toBe(false);
    expect(month.pace.todayDay).toBe(17);
    expect(month.pace.forecast).toHaveLength(14);
    expect(month.pace.forecast.at(-1)).toBe(f.forecastEndCents);
    expect(month.pace.actual).toHaveLength(18);
    expect(month.pace.plan).toHaveLength(31);
    expect(month.pace.previous).toHaveLength(31);
  });

  it('balance: 17 actual days, the forecast reaches the salary jump, the low is the day before', () => {
    expect(month.balance.actual).toHaveLength(17);
    expect(month.balance.actual.at(-1)).toEqual({ day: TODAY, balanceCents: 116_700 });
    expect(month.stand.budgetBalanceCents).toBe(116_700);
    const fc = month.balance.forecast;
    expect(fc[0]).toMatchObject({ day: TODAY, balanceCents: 116_700 });
    expect(fc.at(-1)?.day).toBe('2026-10-22');
    expect(month.balance.low).toMatchObject({ day: '2026-09-29', cents: 19_101 });
    expect(Math.min(...fc.map((d) => d.balanceCents))).toBe(month.balance.low?.cents);
    expect(fc.find((d) => d.day === '2026-09-30')!.balanceCents).toBeGreaterThan(
      fc.find((d) => d.day === '2026-09-29')!.balanceCents + 300_000,
    );
  });

  it('next steps list the overspent envelopes, most overspent first', () => {
    const steps = month.nextSteps.items;
    expect(steps.every((s) => s.kind === 'overspent' && s.urgent)).toBe(true);
    expect(steps.map((s) => s.cents)).toEqual([...steps.map((s) => s.cents)].sort((a, b) => b - a));
    expect(steps.find((s) => s.categoryName === 'Lieferdienste')?.cents).toBe(1019);
    expect(month.nextSteps.count).toBe(steps.length);
    expect(nextSteps(db, TODAY)).toEqual(month.nextSteps);
  });

  it('the last bookings are the five newest, up to today', () => {
    expect(month.lastBookings).toHaveLength(5);
    expect(month.lastBookings.every((b) => b.date <= TODAY)).toBe(true);
  });
});

describe('windows', () => {
  it('"Bis Gehalt" runs from today to the payday', () => {
    expect(payday.stand).toMatchObject({ period: 'payday', from: TODAY, to: '2026-10-15' });
    expect(payday.balance.actual).toEqual([{ day: TODAY, balanceCents: 116_700 }]);
    expect(payday.balance.forecast).toHaveLength(36);
    expect(payday.lead).toEqual(month.lead);
    expect(payday.pace.figures).toEqual(month.pace.figures);
  });

  it('a past month shows its actual balance and a complete pace, no forecast', () => {
    const past = heute(db, { today: TODAY, period: 'payday', month: '2026-08' });
    expect(past.stand).toMatchObject({ period: 'month', from: '2026-08-01', to: '2026-08-31' });
    expect(past.balance.actual).toHaveLength(31);
    expect(past.balance.forecast).toEqual([]);
    expect(past.balance.salary).toBeNull();
    expect(past.pace.todayDay).toBe(31);
    expect(past.pace.figures.openFixedCents).toBe(0);
    // Lead and net worth refer to today.
    expect(past.lead).toEqual(month.lead);
    expect(past.netWorth.totalCents).toBe(8_473_000);
  });
});

describe('without materialised occurrences', () => {
  it('reads payday, open bills and the forecast from the schedule', () => {
    expect(unrefreshed.stand.payday).toEqual(month.stand.payday);
    const noIds = (h: Heute) => h.lead.items.open.map((o) => [o.day, o.label, o.cents]);
    expect(noIds(unrefreshed)).toEqual(noIds(month));
    expect({ ...unrefreshed.lead, items: [] }).toEqual({ ...month.lead, items: [] });
    expect(unrefreshed.balance).toEqual(month.balance);
    expect(unrefreshed.pace.figures).toEqual(month.pace.figures);
    expect(unrefreshed.upcoming14.every((o) => o.occurrenceId === null)).toBe(true);
    expect(month.upcoming14.every((o) => o.occurrenceId !== null)).toBe(true);
  });
});

describe('an empty ledger', () => {
  it('answers with zeros and the business-day 15th as payday', () => {
    const empty = heute(createTestDatabase().db, { today: '2026-02-10' });
    expect(empty.stand.payday).toEqual({
      day: '2026-02-13',
      source: 'payday_rule',
      daysToPayday: 3,
    });
    expect(empty.lead.freeCents).toBe(0);
    expect(empty.netWorth.totalCents).toBe(0);
    expect(empty.netWorth.deltaBp).toBeNull();
    expect(empty.pinned).toEqual([]);
    expect(empty.nextSteps).toEqual({ items: [], count: 0 });
    expect(empty.lastBookings).toEqual([]);
  });
});
