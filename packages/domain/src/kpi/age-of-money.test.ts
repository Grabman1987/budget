import { describe, expect, it } from 'vitest';
import { ageOfMoney, ageOfMoneyAt, type MoneyEvent } from './age-of-money';

const ev = (day: string, cents: number): MoneyEvent => ({ day, cents });

describe('ageOfMoney (R03)', () => {
  it('spends the oldest money first: an outflow is as old as the lots it consumes', () => {
    const r = ageOfMoney([ev('2026-01-01', 1000), ev('2026-01-11', 1000), ev('2026-01-21', -500)]);
    expect(r).toEqual({ days: 20, outflowsCounted: 1 });
  });

  it('weights a mixed outflow by amount and averages the outflows', () => {
    const r = ageOfMoney([
      ev('2026-01-01', 100),
      ev('2026-01-11', 100),
      // consumes 100 of age 20 and 100 of age 10: 15 days
      ev('2026-01-21', -200),
      ev('2026-01-31', 100),
      // the rest of nothing: lot of Jan 31 at age 10 -> average of 15 and 10
      ev('2026-02-10', -100),
    ]);
    expect(r).toEqual({ days: 13, outflowsCounted: 2 });
  });

  it('only the last 10 outflows count', () => {
    const events: MoneyEvent[] = [ev('2026-01-01', 1_000_000)];
    for (let i = 0; i < 15; i++) events.push(ev(`2026-03-${String(i + 1).padStart(2, '0')}`, -100));
    const r = ageOfMoney(events);
    expect(r.outflowsCounted).toBe(10);
    // the last ten outflows are on 6.3. to 15.3.: ages 64 to 73 days, average 68,5 rounds up
    expect(r.days).toBe(69);
  });

  it('as-of day: later events are ignored', () => {
    const events = [ev('2026-01-01', 1000), ev('2026-01-11', -100), ev('2026-03-01', -100)];
    expect(ageOfMoney(events, '2026-02-01')).toEqual({ days: 10, outflowsCounted: 1 });
    expect(ageOfMoney(events).outflowsCounted).toBe(2);
  });

  it('input order does not matter; on one day inflows come first (age 0)', () => {
    const r = ageOfMoney([ev('2026-01-05', -300), ev('2026-01-05', 300)]);
    expect(r).toEqual({ days: 0, outflowsCounted: 1 });
  });

  it('overspending: the part without money has no age; outflows without any money are skipped', () => {
    const r = ageOfMoney([
      ev('2025-12-31', -500), // nothing there: skipped
      ev('2026-01-01', 100),
      ev('2026-01-11', -300), // only 100 of age 10 exists
    ]);
    expect(r).toEqual({ days: 10, outflowsCounted: 1 });
  });

  it('is null without outflows, without events and with zero amounts', () => {
    expect(ageOfMoney([])).toEqual({ days: null, outflowsCounted: 0 });
    expect(ageOfMoney([ev('2026-01-01', 500)])).toEqual({ days: null, outflowsCounted: 0 });
    expect(ageOfMoney([ev('2026-01-01', 0)]).days).toBeNull();
  });

  it('a smaller window can be chosen', () => {
    const events = [ev('2026-01-01', 1000), ev('2026-01-02', -10), ev('2026-01-31', -10)];
    expect(ageOfMoney(events, undefined, 1)).toEqual({ days: 30, outflowsCounted: 1 });
  });
});

describe('ageOfMoneyAt', () => {
  // The previous one-day implementation: sort and replay the events up to the day, every call.
  function reference(events: MoneyEvent[], asOf?: string, window = 10) {
    const sorted = events
      .map((e, i) => ({ ...e, i }))
      .filter((e) => e.cents !== 0 && (asOf === undefined || e.day <= asOf))
      .sort(
        (a, b) =>
          (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) ||
          (a.cents > 0 ? 0 : 1) - (b.cents > 0 ? 0 : 1) ||
          a.i - b.i,
      );
    const lots: { day: string; left: number }[] = [];
    let head = 0;
    const ages: { centDays: number; consumed: number }[] = [];
    for (const e of sorted) {
      if (e.cents > 0) {
        lots.push({ day: e.day, left: e.cents });
        continue;
      }
      let need = -e.cents;
      let centDays = 0;
      let consumed = 0;
      for (let lot = lots[head]; need > 0 && lot; lot = lots[head]) {
        const take = Math.min(lot.left, need);
        centDays +=
          take *
          ((Date.parse(`${e.day}T00:00:00Z`) - Date.parse(`${lot.day}T00:00:00Z`)) / 86_400_000);
        consumed += take;
        lot.left -= take;
        need -= take;
        if (lot.left === 0) head++;
      }
      if (consumed > 0) ages.push({ centDays, consumed });
    }
    const last = ages.slice(-window);
    if (last.length === 0) return { days: null, outflowsCounted: 0 };
    const mean = last.reduce((a, x) => a + x.centDays / x.consumed, 0) / last.length;
    return { days: Math.round(mean), outflowsCounted: last.length };
  }

  it('answers every day exactly like one ageOfMoney call per day', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
    const events: MoneyEvent[] = [];
    for (let i = 0; i < 400; i++) {
      const day = `2026-${String(1 + Math.floor(rnd() * 9)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
      events.push(ev(day, (rnd() < 0.3 ? 1 : -1) * Math.round(rnd() * 90_000)));
    }
    const days = [
      '2025-12-31',
      '2026-01-01',
      '2026-03-31',
      '2026-02-14',
      '2026-09-30',
      '2027-01-01',
      undefined,
    ];
    expect(ageOfMoneyAt(events, days)).toEqual(days.map((d) => reference(events, d)));
    for (const d of days) expect(ageOfMoney(events, d)).toEqual(reference(events, d));
  });
});
