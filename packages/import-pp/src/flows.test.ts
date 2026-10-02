import { describe, expect, it } from 'vitest';
import { matchFlows, type FlowItem } from './flows';

const f = (date: string, cents: number): FlowItem => ({ date, cents });

describe('matchFlows', () => {
  it('matches the same amount within a few days first', () => {
    const r = matchFlows([f('2026-01-05', 10_000)], [f('2026-01-07', 10_000)]);
    expect(r.exact).toBe(1);
    expect(r.ppOnly).toEqual([]);
    expect(r.appOnly).toEqual([]);
  });

  it('uses each flow once and takes the closest day', () => {
    const r = matchFlows(
      [f('2026-01-05', 100), f('2026-01-10', 100)],
      [f('2026-01-09', 100), f('2026-01-30', 100)],
    );
    expect(r.exact).toBe(1);
    expect(r.dateShifted).toEqual([
      { pp: f('2026-01-05', 100), app: f('2026-01-30', 100), days: 25 },
    ]);
  });

  it('calls the same amount further apart a date shift, but not beyond 45 days', () => {
    const r = matchFlows([f('2026-01-01', 500)], [f('2026-01-20', 500)]);
    expect(r.dateShifted).toHaveLength(1);
    expect(r.dateShifted[0]!.days).toBe(19);
    const far = matchFlows([f('2026-01-01', 500)], [f('2026-03-20', 500)]);
    expect(far.ppOnly).toHaveLength(1);
    expect(far.appOnly).toHaveLength(1);
  });

  it('finds several PP flows that are one app flow, and the other way round', () => {
    const r = matchFlows(
      [
        f('2026-02-01', 2_500),
        f('2026-02-02', 2_500),
        f('2026-02-03', 5_000),
        f('2026-05-01', 10_000),
      ],
      [f('2026-02-02', 10_000), f('2026-05-01', 4_000), f('2026-05-02', 6_000)],
    );
    expect(r.split).toHaveLength(2);
    const [a, b] = r.split;
    expect(a!.app).toEqual([f('2026-02-02', 10_000)]);
    expect(a!.pp).toHaveLength(3);
    expect(b!.pp).toEqual([f('2026-05-01', 10_000)]);
    expect(b!.app).toHaveLength(2);
    expect(r.ppOnly).toEqual([]);
    expect(r.appOnly).toEqual([]);
  });

  it('does not mix signs or invent a sum', () => {
    const r = matchFlows(
      [f('2026-02-01', 3_000), f('2026-02-02', -1_000)],
      [f('2026-02-02', 2_500)],
    );
    expect(r.split).toEqual([]);
    expect(r.ppOnly).toHaveLength(2);
    expect(r.appOnly).toHaveLength(1);
  });

  it('adds up what is left of a month', () => {
    const r = matchFlows(
      [f('2026-03-02', 1_000), f('2026-03-20', 3_000)],
      [f('2026-03-10', 1_500), f('2026-03-28', 2_500)],
    );
    expect(r.aggregate).toHaveLength(1);
    expect(r.aggregate[0]!.month).toBe('2026-03');
    expect(r.ppOnly).toEqual([]);
  });

  it('cancels a deposit and a removal of the same amount on one side', () => {
    const r = matchFlows(
      [f('2026-05-01', 12_000), f('2026-05-03', -12_000), f('2026-05-20', 900)],
      [f('2026-05-20', 900)],
    );
    expect(r.exact).toBe(1);
    expect(r.roundTrips).toEqual([
      { side: 'pp', out: f('2026-05-03', -12_000), back: f('2026-05-01', 12_000) },
    ]);
    expect(r.ppOnly).toEqual([]);
  });

  it('puts app flows before the start of PP history aside', () => {
    const r = matchFlows(
      [f('2024-01-10', 100)],
      [f('2023-10-19', -800_000), f('2024-01-10', 100)],
      {
        ppFrom: '2023-12-15',
      },
    );
    expect(r.appBeforePp).toEqual([f('2023-10-19', -800_000)]);
    expect(r.appOnly).toEqual([]);
  });

  it('leaves what nothing explains', () => {
    const r = matchFlows([f('2026-04-01', 123)], [f('2026-06-30', -77)]);
    expect(r.ppOnly).toEqual([f('2026-04-01', 123)]);
    expect(r.appOnly).toEqual([f('2026-06-30', -77)]);
  });
});
