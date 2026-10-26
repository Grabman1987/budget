// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { liquidityReport } from '@budget/domain';
import { LiquidityChart } from './liquidity-chart';
import { lowestPoint } from './liquidity-selection';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 320] }));

const report = liquidityReport({
  startDay: '2026-09-17',
  startCents: 100_000,
  items: [
    { day: '2026-09-25', cents: -180_000, kind: 'fixed', label: 'Miete' },
    { day: '2026-09-30', cents: 250_000, kind: 'income', label: 'Gehalt' },
  ],
  events: [],
  variableMonthlyCents: 30_000,
  horizon: '90d',
  levers: [],
});

describe('LiquidityChart marks', () => {
  afterEach(cleanup);

  it('holds daily balances until the next date in both lines and the whole buffer band', () => {
    const { container } = render(<LiquidityChart report={report} />);
    const paths = container.querySelectorAll('.l-forecast, .l-prev, .band-edge, .band-fill');
    expect(paths).toHaveLength(5);
    for (const path of paths) {
      const d = path.getAttribute('d')!;
      // These straight-segment paths may close the band, but must never interpolate a daily jump.
      expect(d).toMatch(/^M[-\d.,ML]+Z?$/);
      const vertices = [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
        Number(m[1]),
        Number(m[2]),
      ]);
      if (d.endsWith('Z')) vertices.push(vertices[0]!);
      let horizontal = 0;
      let vertical = 0;
      for (let i = 1; i < vertices.length; i++) {
        const [x0, y0] = vertices[i - 1]!;
        const [x1, y1] = vertices[i]!;
        expect(x0 === x1 || y0 === y1, `Diagonal segment in ${path.getAttribute('class')}`).toBe(
          true,
        );
        if (x0 !== x1) horizontal++;
        if (y0 !== y1) vertical++;
      }
      expect(horizontal).toBeGreaterThan(1);
      expect(vertical).toBeGreaterThan(1);
    }
  });

  it('puts the Tiefststand on the minimum of the plotted series, to the cent', () => {
    const { getByTestId } = render(<LiquidityChart report={report} />);
    const low = lowestPoint(report.points)!;
    const mark = getByTestId('liquidity-lowpoint');
    expect(mark.getAttribute('data-cents')).toBe(String(low.cents));
    expect(mark.getAttribute('data-day')).toBe(low.day);
    expect(low.cents).toBe(Math.min(...report.points.map((p) => p.balanceCents)));
    expect(mark.textContent).toContain('TIEFSTSTAND');
  });

  it('draws HEUTE always and GEHALT only when a salary day is known', () => {
    const without = render(<LiquidityChart report={report} />);
    expect(without.getByTestId('liquidity-mark-heute').textContent).toBe('HEUTE');
    expect(without.queryByTestId('liquidity-mark-gehalt')).toBeNull();
    cleanup();
    const withSalary = render(<LiquidityChart report={report} salaryDay="2026-09-30" />);
    expect(withSalary.getByTestId('liquidity-mark-gehalt').textContent).toBe('GEHALT 30.09.');
  });
});
