import { describe, expect, it } from 'vitest';
import { dayCounts, ruleTimelines, type HistoryMatrix } from './history';

const cell = (asOf: string, status: 'ok' | 'warn' | 'bad') => ({ asOf, status, valueText: null });

const matrix: HistoryMatrix = {
  days: ['2026-06-30', '2026-07-31', '2026-08-31', '2026-09-17'],
  rules: [
    {
      code: 'R02',
      name: 'Notgroschen',
      stage: 2,
      cells: [
        cell('2026-06-30', 'bad'),
        cell('2026-07-31', 'ok'),
        cell('2026-08-31', 'bad'),
        cell('2026-09-17', 'bad'),
      ],
    },
    {
      code: 'R01',
      name: 'Verteilung',
      stage: 2,
      cells: [
        cell('2026-06-30', 'ok'),
        cell('2026-07-31', 'ok'),
        cell('2026-08-31', 'ok'),
        cell('2026-09-17', 'ok'),
      ],
    },
    // No data in July: the strip shows a gap, and the run since August is two days long.
    {
      code: 'R03',
      name: 'Geldalter',
      stage: 1,
      cells: [cell('2026-06-30', 'warn'), cell('2026-08-31', 'warn'), cell('2026-09-17', 'warn')],
    },
    { code: 'R07', name: 'Liquidität', stage: 1, cells: [cell('2026-06-30', 'ok')] },
  ],
};

describe('ruleTimelines', () => {
  const lines = ruleTimelines(matrix);
  const by = (code: string) => lines.find((l) => l.code === code)!;

  it('orders by severity of the current status, not evaluable last, then by code', () => {
    expect(lines.map((l) => l.code)).toEqual(['R02', 'R03', 'R01', 'R07']);
  });

  it('dates the unbroken run of the current status', () => {
    expect(by('R02')).toMatchObject({ current: 'bad', sinceDay: '2026-08-31', sinceStart: false });
    expect(by('R03')).toMatchObject({ current: 'warn', sinceDay: '2026-08-31', sinceStart: false });
  });

  it('marks a run that reaches the first day as possibly older', () => {
    expect(by('R01')).toMatchObject({ current: 'ok', sinceDay: '2026-06-30', sinceStart: true });
  });

  it('keeps one cell per day and a gap where the rule had no result', () => {
    expect(by('R03').strip.map((c) => c.status)).toEqual(['warn', null, 'warn', 'warn']);
    expect(by('R07')).toMatchObject({ current: null, sinceDay: null, sinceStart: false });
    expect(by('R07').strip.map((c) => c.status)).toEqual(['ok', null, null, null]);
  });
});

describe('dayCounts', () => {
  it('counts the stored statuses per day and the rules without a result', () => {
    expect(dayCounts(matrix)).toEqual([
      { asOf: '2026-06-30', ok: 2, warn: 1, bad: 1, notEvaluated: 0 },
      { asOf: '2026-07-31', ok: 2, warn: 0, bad: 0, notEvaluated: 2 },
      { asOf: '2026-08-31', ok: 1, warn: 1, bad: 1, notEvaluated: 1 },
      { asOf: '2026-09-17', ok: 1, warn: 1, bad: 1, notEvaluated: 1 },
    ]);
  });
});
