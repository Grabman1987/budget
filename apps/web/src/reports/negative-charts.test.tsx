// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StackedMonthsChart } from './month-charts';
import { CategoryChart, SavingsChart } from './table-charts';
import { BarsAroundZero } from '@budget/ui';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 420] }));

describe('negative chart values', () => {
  it('draws signed historical layers around zero in quiet ink', () => {
    const { container } = render(
      <StackedMonthsChart
        months={['2026-01']}
        series={[
          { key: 'income', name: 'Einnahmen', fillClass: 'mr-fill-ink', perMonth: [5000] },
          { key: 'refund', name: 'Korrektur', fillClass: 'mr-fill-pale', perMonth: [-1200] },
        ]}
        label="Muster"
        testId="synthetic"
      />,
    );
    const positive = container.querySelector('.mr-fill-ink')!;
    const negative = container.querySelector('.bar-neg-ink')!;
    expect(Number(negative.getAttribute('height'))).toBeGreaterThan(0);
    expect(Number(negative.getAttribute('y'))).toBeCloseTo(
      Number(positive.getAttribute('y')) + Number(positive.getAttribute('height')),
      1,
    );
    fireEvent.focus(screen.getByRole('group', { name: 'Muster' }));
    const tooltip = screen.getByRole('status');
    expect(tooltip.textContent).toContain('Korrektur−12,00 €');
    expect(tooltip.querySelectorAll('rect')[1]?.getAttribute('fill')).toBe('var(--ink-2)');
  });
  it('keeps a category net refund visible below zero in quiet ink', () => {
    const { container } = render(
      <CategoryChart
        name="Musterkategorie"
        cls="need"
        points={[{ month: '2026-01', spentCents: -12345, assignedCents: 20000 }]}
      />,
    );
    const bar = container.querySelector('rect[fill="var(--ink-2)"]')!;
    expect(bar).not.toBeNull();
    expect(Number(bar.getAttribute('height'))).toBeGreaterThan(0);
    expect(Number(bar.getAttribute('y')) + Number(bar.getAttribute('height'))).toBeLessThan(200);
  });
  it('draws negative historical savings rates in quiet ink', () => {
    const { container } = render(
      <SavingsChart
        points={[{ month: '2026-01', rateBp: -250, rollingBp: 100, grossBp: null }]}
        targetBp={2000}
        label="Historische Sparquote"
      />,
    );
    expect(container.querySelector('.bar-neg-ink')).not.toBeNull();
  });
  it('preserves the shared chart primitive red default for current alerts', () => {
    const { container } = render(
      <svg>
        <BarsAroundZero bars={[{ x: 12, value: -100 }]} y={(value) => 100 - value} barWidth={8} />
      </svg>,
    );
    expect(container.querySelector('.bar-neg2')).not.toBeNull();
  });
  it('uses a quiet negative chart bar without changing the zero-crossing geometry', () => {
    const { container } = render(
      <StackedMonthsChart
        months={['2026-01']}
        series={[
          { key: 'refund', name: 'Korrektur', fillClass: 'mr-fill-pale', perMonth: [-1200] },
        ]}
        label="Muster"
        testId="negative-history"
      />,
    );
    const bar = container.querySelector('rect.bar-neg-ink')!;
    expect(Number(bar.getAttribute('height'))).toBeGreaterThan(0);
  });
});
