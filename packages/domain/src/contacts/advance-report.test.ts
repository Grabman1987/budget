import { describe, expect, it } from 'vitest';
import { summarizeAdvances } from './advance-report';

const outlay = (
  splitId: string,
  date: string,
  amountCents: number,
  purposeCategoryId: string | null = null,
) => ({ splitId, date, amountCents, purposeCategoryId });

describe('summarizeAdvances', () => {
  const report = summarizeAdvances({
    today: '2026-11-28',
    months: 3,
    outlays: [
      outlay('a', '2026-09-10', 10000, 'food'),
      outlay('b', '2026-10-05', 5001, 'food'),
      outlay('c', '2026-10-20', 3000),
      outlay('d', '2026-11-02', 2000, 'fun'),
    ],
    settlements: [
      { outlaySplitId: 'a', date: '2026-10-15', amountCents: 10000, waived: false },
      { outlaySplitId: 'b', date: '2026-11-10', amountCents: 4000, waived: false },
      { outlaySplitId: 'b', date: '2026-11-11', amountCents: 1001, waived: true },
    ],
  });

  it('lists the months newest first with advanced, repaid, waived and open at month end', () => {
    expect(report.months.map((m) => m.month)).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(
      report.months.map((m) => [m.advancedCents, m.repaidCents, m.waivedCents, m.openCents]),
    ).toEqual([
      [2000, 4000, 1001, 5000],
      [8001, 10000, 0, 8001],
      [10000, 0, 0, 10000],
    ]);
  });

  it('splits what was advanced by purpose, no purpose last', () => {
    expect(report.months[1]!.byPurpose).toEqual([
      { purposeCategoryId: 'food', cents: 5001 },
      { purposeCategoryId: null, cents: 3000 },
    ]);
    expect(report.purposeTotals).toEqual([
      { purposeCategoryId: 'food', cents: 15001 },
      { purposeCategoryId: 'fun', cents: 2000 },
      { purposeCategoryId: null, cents: 3000 },
    ]);
  });

  it('averages the days to full settlement (waiver counts as settled) and finds the peak', () => {
    // a: 35 days, b: 37 days (last settlement 11.11.); c and d are still open.
    expect(report.settledOutlays).toBe(2);
    expect(report.averageDaysToSettle).toBe(36);
    expect(report.peakOpenCents).toBe(15001);
  });

  it('treats a settlement dated before its outlay as same-day and ignores unknown outlays', () => {
    const r = summarizeAdvances({
      today: '2026-11-28',
      months: 1,
      outlays: [outlay('a', '2026-11-05', 1000)],
      settlements: [
        { outlaySplitId: 'a', date: '2026-11-01', amountCents: 1000, waived: false },
        { outlaySplitId: 'gone', date: '2026-11-02', amountCents: 999, waived: false },
      ],
    });
    expect(r.months[0]).toMatchObject({ advancedCents: 1000, repaidCents: 1000, openCents: 0 });
    expect(r.averageDaysToSettle).toBe(0);
    expect(r.peakOpenCents).toBe(1000);
  });

  it('is empty without advances and crosses the year boundary', () => {
    const r = summarizeAdvances({ today: '2026-02-15', outlays: [], settlements: [] });
    expect(r.months).toHaveLength(12);
    expect(r.months[2]!.month).toBe('2025-12');
    expect(r.months[11]!.month).toBe('2025-03');
    expect(r).toMatchObject({ averageDaysToSettle: null, peakOpenCents: 0, purposeTotals: [] });
    expect(r.months.every((m) => m.openCents === 0)).toBe(true);
  });
});
