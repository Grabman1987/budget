// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { liquidityReport } from '@budget/domain';
import { setAmountsHidden } from '@budget/ui';
import { LiquidityChart } from './liquidity-chart';
import { SankeyChart, SAMPLE_SANKEY } from '../charts/sankey-chart';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 320] }));

describe('phone chart variants', () => {
  afterEach(() => setAmountsHidden(false));

  it('masks money in the phone chart alternative when privacy is enabled', () => {
    setAmountsHidden(true);
    render(<SankeyChart width={320} label={'Einnahmen 100,00 \u20ac'} />);
    expect(screen.getByTestId('sankey-chart').getAttribute('aria-label')).not.toContain('100,00');
  });
  it.each(['90d', '6m', '12m'] as const)(
    'spaces liquidity ticks at least 60 px apart (%s)',
    (horizon) => {
      const report = liquidityReport({
        startDay: '2026-09-17',
        startCents: 100_000,
        items: [],
        events: [],
        variableMonthlyCents: 10_000,
        horizon,
        levers: [],
      });
      const { container } = render(<LiquidityChart report={report} />);
      const labels = [...container.querySelectorAll('text[y="252"]')];
      expect(labels.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < labels.length; i++) {
        expect(
          Number(labels[i]!.getAttribute('x')) - Number(labels[i - 1]!.getAttribute('x')),
        ).toBeGreaterThanOrEqual(60);
      }
    },
  );

  it('keeps income, pool and class values readable in the phone flow legend', () => {
    render(<SankeyChart width={320} model={SAMPLE_SANKEY} />);
    const list = screen.getByRole('list', { name: 'Geldfluss nach Stufen' });
    for (const column of SAMPLE_SANKEY.columns.slice(0, 3)) {
      for (const node of column) expect(list.textContent).toContain(node.name);
    }
    expect(list.textContent).toContain('Bedarf');
    expect(list.textContent).toContain('€');
    expect(list.textContent).toContain('%');
  });
});
