// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StackedMonthsChart } from './month-charts';
import { CategoryChart } from './table-charts';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 420] }));

describe('negative chart values', () => {
  it('draws signed stacked layers on either side of zero and uses the same red tooltip swatch', () => {
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
    const negative = container.querySelector('.bar-neg2')!;
    expect(Number(negative.getAttribute('height'))).toBeGreaterThan(0);
    expect(Number(negative.getAttribute('y'))).toBeCloseTo(
      Number(positive.getAttribute('y')) + Number(positive.getAttribute('height')),
      1,
    );
    fireEvent.focus(screen.getByRole('group', { name: 'Muster' }));
    const tooltip = screen.getByRole('status');
    expect(tooltip.textContent).toContain('Korrektur−12,00 €');
    expect(tooltip.querySelectorAll('rect')[1]?.getAttribute('fill')).toBe('var(--red)');
  });
  it('keeps a category net refund visible below zero', () => {
    const { container } = render(
      <CategoryChart
        name="Musterkategorie"
        cls="need"
        points={[{ month: '2026-01', spentCents: -12345, assignedCents: 20000 }]}
      />,
    );
    const bar = container.querySelector('rect[fill="var(--red)"]')!;
    expect(bar).not.toBeNull();
    expect(Number(bar.getAttribute('height'))).toBeGreaterThan(0);
    expect(Number(bar.getAttribute('y')) + Number(bar.getAttribute('height'))).toBeLessThan(200);
  });
});
