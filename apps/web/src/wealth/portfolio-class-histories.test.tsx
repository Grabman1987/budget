// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import type { PortfolioPerformanceHistory } from '@budget/db';
import { afterEach, expect, it, vi } from 'vitest';
import { PortfolioClassHistories } from './portfolio-class-histories';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [null, 400] }));
const dates = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'];
const points = (values: (number | null)[]) =>
  dates.map((date, i) => ({ date, portfolio: values[i]!, benchmark: null }));
const history: Pick<PortfolioPerformanceHistory, 'index' | 'classes'> = {
  index: points([100, 110, 115, 121, 133.1]),
  classes: [
    {
      assetClassId: 'held',
      name: 'Synthetic held',
      currentHolding: true,
      valueCents: 13310,
      performance: null,
      index: points([100, 110, null, 121, 133.1]),
    },
    {
      assetClassId: 'sold',
      name: 'Synthetic sold',
      currentHolding: false,
      valueCents: 0,
      performance: null,
      index: points([100, 105, null, null, null]),
    },
    {
      assetClassId: null,
      name: 'Ohne Anlageklasse',
      currentHolding: false,
      valueCents: 0,
      performance: null,
      index: points([null, null, null, null, null]),
    },
  ],
};

afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
});

it('keeps the canonical class order, shared monthly dates and literal index values with open gaps', () => {
  const before = JSON.stringify(history);
  render(<PortfolioClassHistories history={history} />);
  const figures = screen.getAllByTestId('portfolio-class-history');
  expect(figures.map((figure) => within(figure).getByRole('heading').textContent)).toEqual([
    'Synthetic held',
    'Synthetic sold',
    'Ohne Anlageklasse',
  ]);
  expect(figures[0]!.querySelectorAll('.portfolio-class-history-line .l-actual')).toHaveLength(2);
  expect(figures[1]!.querySelectorAll('.portfolio-class-history-line .l-actual')).toHaveLength(1);
  expect(figures[2]!.querySelectorAll('.portfolio-class-history-line .l-actual')).toHaveLength(0);
  expect(figures[0]!.textContent).toContain('Letzter Index: 133,1');
  expect(figures[1]!.textContent).toContain('Letzter Index: Nicht verfügbar');
  for (const figure of figures) {
    expect(figure.textContent).toContain('31.01.2026');
    expect(figure.textContent).toContain('31.05.2026');
    expect(figure.querySelector('[data-testid="portfolio-flow-marker"]')).toBeNull();
  }
  const table = screen.getByTestId('portfolio-class-history-table');
  const rows = table.querySelectorAll('tr');
  expect(rows[2]!.textContent).toBe('28.02.2026110105Nicht verfügbar');
  expect(rows[3]!.textContent).toBe('31.03.2026Nicht verfügbarNicht verfügbarNicht verfügbar');
  expect(rows[5]!.textContent).toBe('31.05.2026133,1Nicht verfügbarNicht verfügbar');
  expect(JSON.stringify(history)).toBe(before);
});

it('replaces every mini and table date when the selected period response changes', () => {
  const { rerender, container } = render(<PortfolioClassHistories history={history} />);
  rerender(
    <PortfolioClassHistories
      history={{
        index: history.index.slice(-2),
        classes: history.classes.map((cls) => ({ ...cls, index: cls.index.slice(-2) })),
      }}
    />,
  );
  expect(container.textContent).not.toContain('31.01.2026');
  expect(container.textContent).toContain('30.04.2026');
  expect(container.textContent).toContain('31.05.2026');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
});

it('masks known indexes in captions and table and restores the same values without changing data', () => {
  const before = JSON.stringify(history);
  const { container } = render(<PortfolioClassHistories history={history} />);
  expect(container.textContent).toContain('133,1');
  act(() => setAmountsHidden(true));
  expect(container.textContent).toContain('Letzter Index: •••');
  expect(container.textContent).not.toMatch(/133[,.]1|\b121\b|\b110\b|\b105\b/);
  expect(container.querySelector('table')!.textContent).toContain('Nicht verfügbar');
  act(() => setAmountsHidden(false));
  expect(container.textContent).toContain('Letzter Index: 133,1');
  expect(JSON.stringify(history)).toBe(before);
});
