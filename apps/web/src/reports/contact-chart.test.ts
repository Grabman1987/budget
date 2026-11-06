import { describe, expect, it } from 'vitest';
import { chartWindow } from './contact-chart';
import type { ContactReportStatement } from './contact-api';

const statement = (rows: [string, number][]) =>
  ({
    asOf: '2026-11-06',
    movements: rows.map(([date, balanceCents]) => ({ date, balanceCents })),
  }) as unknown as ContactReportStatement;

describe('chartWindow', () => {
  it('keeps every movement without a window', () => {
    expect(chartWindow(statement([['2026-01-01', 100]]))).toEqual({
      rows: [{ date: '2026-01-01', balanceCents: 100 }],
      startCents: 0,
      startLabel: 'Start',
    });
  });

  it('shows the last 35 days and carries the earlier balance in', () => {
    const view = chartWindow(
      statement([
        ['2026-09-01', 500],
        ['2026-10-02', 700],
        ['2026-10-03', 900],
        ['2026-11-05', 0],
      ]),
      35,
    );
    expect(view.startCents).toBe(700);
    expect(view.rows.map((row) => row.date)).toEqual(['2026-10-03', '2026-11-05']);
  });

  it('shows the current balance flat when nothing moved in the window', () => {
    const view = chartWindow(statement([['2026-01-01', 1234]]), 35);
    expect(view.rows).toEqual([]);
    expect(view.startCents).toBe(1234);
  });
});
