import { describe, expect, it } from 'vitest';
import { freeUntilPayday, type FreeEnvelope, type OpenOutflow } from './free-until-payday';

// Envelopes of design/prototype/app.js (carry + assigned - spent), in cents.
const env = (
  id: string,
  cls: FreeEnvelope['class'],
  carry: number,
  assigned: number,
  spent: number,
): FreeEnvelope => ({ id, name: id, class: cls, availableCents: carry + assigned - spent });

const ENVELOPES: FreeEnvelope[] = [
  env('lebensmittel', 'need', 2800, 57_200, 38_800),
  env('treibstoff', 'need', 0, 14_000, 15_240),
  env('haushalt', 'need', 0, 12_000, 3550),
  env('gesundheit', 'need', 8000, 4000, 0),
  env('oeffis', 'need', 0, 4500, 0),
  env('nebenkosten', 'need', 0, 15_000, 0),
  env('versicherungen', 'need', 16_072, 4018, 0),
  env('kleidung', 'need', 20_000, 5000, 3000),
  env('lieferdienste', 'want', 0, 8000, 6200),
  env('freizeit', 'want', 0, 12_000, 5600),
  env('essen', 'want', 0, 15_000, 12_100),
  env('hobby', 'want', 4659, 5000, 0),
  env('streaming', 'want', 0, 1799, 0),
  env('reisen', 'want', 10_000, 5000, 0),
  env('geschenke', 'want', 1701, 2000, 0),
  env('notgroschen', 'future', 315_000, 25_000, 0),
  env('investieren', 'future', 0, 40_000, 0),
];
const OPEN: OpenOutflow[] = [
  { id: 'a', label: 'Streaming-Abo', day: '2026-09-20', cents: 1799 },
  { id: 'b', label: 'Mobilfunk', day: '2026-09-22', cents: 2500 },
  { id: 'c', label: 'Strom', day: '2026-09-25', cents: 10_500 },
];

describe('freeUntilPayday: prototype sample on 17.09.2026, payday 30.09.', () => {
  const r = freeUntilPayday({
    envelopes: ENVELOPES,
    openOutflows: OPEN,
    payday: '2026-09-30',
    today: '2026-09-17',
  });

  it('available of Bedarf and Wunsch (future envelopes excluded) minus open bills', () => {
    expect(r.needCents).toBe(102_000);
    expect(r.wantCents).toBe(41_259);
    expect(r.openCents).toBe(14_799);
    expect(r.freeCents).toBe(128_460);
    expect(r.daysToPayday).toBe(13);
  });

  it('the Maßkette adds up as displayed (whole euros)', () => {
    expect(r.chain.map((t) => [t.op, t.value])).toEqual([
      [undefined, 102_000],
      ['+', 41_300],
      ['-', 14_800],
      ['=', 128_500],
    ]);
    expect(r.chain[3]?.result).toBe(true);
  });

  it('exact precision keeps the cents', () => {
    const exact = freeUntilPayday({
      envelopes: ENVELOPES,
      openOutflows: OPEN,
      payday: '2026-09-30',
      today: '2026-09-17',
      precision: 'cent',
    });
    expect(exact.chain.map((t) => t.value)).toEqual([102_000, 41_259, 14_799, 128_460]);
  });

  it('keeps the drill-down items behind each term', () => {
    expect(r.items.need).toHaveLength(8);
    expect(r.items.want).toHaveLength(7);
    expect(r.items.open.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(r.items.need.reduce((a, e) => a + e.availableCents, 0)).toBe(r.needCents);
  });
});

describe('freeUntilPayday edge cases', () => {
  it('a rounding gap of a euro is absorbed by the largest term', () => {
    const r = freeUntilPayday({
      envelopes: [env('a', 'need', 0, 1049, 0), env('b', 'want', 0, 1049, 0)],
      openOutflows: [],
      payday: '2026-09-30',
      today: '2026-09-17',
    });
    expect(r.freeCents).toBe(2098);
    expect(r.chain.map((t) => t.value)).toEqual([1100, 1000, 0, 2100]);
  });

  it('only bills due before payday count; overdue open bills count too', () => {
    const r = freeUntilPayday({
      envelopes: [env('a', 'need', 0, 100_000, 0)],
      openOutflows: [
        { id: 'late', label: 'overdue', day: '2026-09-10', cents: 1000 },
        { id: 'pay', label: 'on payday', day: '2026-09-30', cents: 5000 },
        { id: 'next', label: 'next month', day: '2026-10-01', cents: 7000 },
      ],
      payday: '2026-09-30',
      today: '2026-09-17',
    });
    expect(r.openCents).toBe(1000);
    expect(r.items.open.map((o) => o.id)).toEqual(['late']);
  });

  it('overspent envelopes lower it; negative result and empty input', () => {
    const r = freeUntilPayday({
      envelopes: [env('a', 'need', 0, 1000, 3000), env('b', 'want', 0, 500, 0)],
      openOutflows: [{ id: 'x', label: 'x', day: '2026-09-20', cents: 4000 }],
      payday: '2026-09-30',
      today: '2026-09-30',
      precision: 'cent',
    });
    expect(r.needCents).toBe(-2000);
    expect(r.freeCents).toBe(-5500);
    expect(r.daysToPayday).toBe(0);
    const empty = freeUntilPayday({
      envelopes: [],
      openOutflows: [],
      payday: '2026-09-30',
      today: '2026-09-17',
    });
    expect(empty.freeCents).toBe(0);
  });
});
