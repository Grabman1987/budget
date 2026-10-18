// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BalanceChart, CHART_HEIGHT, lowPointIndex } from './balance-chart';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [null, 600] }));

// Independent literals: five recorded days, then a three-day Kontoprognose that dips and ends lowest.
const actual = [
  { date: '2026-10-01', balanceCents: 250_000 },
  { date: '2026-10-02', balanceCents: 180_050 },
  { date: '2026-10-03', balanceCents: 120_000 },
];
const forecast = [
  { date: '2026-10-03', balanceCents: 120_000 },
  { date: '2026-10-04', balanceCents: 90_025 },
  { date: '2026-10-05', balanceCents: -4_599 },
];
const numbers = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

it('is at most 140 px high', () => {
  expect(CHART_HEIGHT).toBeLessThanOrEqual(140);
  const { container } = render(<BalanceChart points={actual} windowLabel="3M" />);
  expect(container.querySelector('svg.chart')?.getAttribute('height')).toBe('140');
});

it('hover values and the Tiefpunkt equal the Kontoprognose to the cent', () => {
  const { container } = render(
    <BalanceChart points={actual} windowLabel="3M" previewPoints={forecast} />,
  );
  const slider = screen.getByRole('slider');
  const tooltip = () => container.querySelector('.kchart-tooltip')?.textContent ?? '';
  fireEvent.focus(slider);
  expect(tooltip()).toContain('05.10.2026');
  expect(tooltip()).toContain('−45,99');
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(tooltip()).toContain('04.10.2026');
  expect(tooltip()).toContain('900,25');
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(tooltip()).toContain('1.200,00');
  expect(container.querySelector('[data-testid="balance-chart-low"]')?.textContent).toBe(
    'Tiefpunkt −45,99 €',
  );
});

it('keeps the minimum inside the plot and joins Ist and Prognose at Heute', () => {
  const { container } = render(
    <BalanceChart points={actual} windowLabel="3M" previewPoints={forecast} />,
  );
  const lines = [...container.querySelectorAll('path.l-actual, path.l-forecast')];
  expect(lines.length).toBeGreaterThanOrEqual(2);
  for (const line of lines) {
    const n = numbers(line.getAttribute('d') ?? '');
    const ys = n.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(CHART_HEIGHT - 24);
  }
  const first = (cls: string) =>
    numbers(container.querySelector(`path.${cls}`)!.getAttribute('d')!);
  const ist = numbers(container.querySelector('path.l-actual')!.getAttribute('d')!);
  const prog = first('l-forecast');
  // Last Ist coordinates equal the first Prognose coordinates (same day, same value).
  expect(ist.slice(-2)).toEqual(prog.slice(0, 2));
  const today = container.querySelector('[data-testid="balance-chart-today"] line');
  expect(Number(today?.getAttribute('x1'))).toBeCloseTo(ist.slice(-2)[0]!, 5);
});

it('marks a Tiefpunkt at the end only when a forecast exists', () => {
  const at = (cents: number[]) =>
    cents.map((balanceCents, i) => ({ date: `2026-10-0${i + 1}`, balanceCents }));
  expect(lowPointIndex(at([3, 2, 1]))).toBe(-1);
  expect(lowPointIndex(at([3, 2, 1]), 1)).toBe(2);
  expect(lowPointIndex(at([1, 2, 3]), 1)).toBe(-1);
});
