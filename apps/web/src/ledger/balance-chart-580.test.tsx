// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BalanceChart, CHART_HEIGHT, forecastLowIndex, yTicksFor } from './balance-chart';
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

it('puts the Tiefpunkt on the Kontoprognose low, not on a lower Ist dip', () => {
  const ist = [
    { date: '2026-10-01', balanceCents: 250_000 },
    { date: '2026-10-02', balanceCents: 10_000 },
    { date: '2026-10-03', balanceCents: 120_000 },
  ];
  const prognose = [
    { date: '2026-10-03', balanceCents: 120_000 },
    { date: '2026-10-04', balanceCents: 90_025 },
    { date: '2026-10-05', balanceCents: 60_000 },
    { date: '2026-10-06', balanceCents: 60_000 },
    { date: '2026-10-07', balanceCents: 70_000 },
  ];
  const { container } = render(
    <BalanceChart points={ist} windowLabel="3M" previewPoints={prognose} />,
  );
  // Domain rule: forecast days only, earliest on a tie -> 05.10. with 600,00 EUR (not the Ist dip of 100,00).
  expect(container.querySelector('[data-testid="balance-chart-low"]')?.textContent).toBe(
    'Tiefpunkt 600,00 €',
  );
  expect(forecastLowIndex([...ist.slice(0, 2), ...prognose], 2)).toBe(4);
  expect(forecastLowIndex(ist, ist.length)).toBe(-1);
  // Flat forecast: the day today is the earliest low point.
  expect(
    forecastLowIndex(
      [
        { date: '2026-10-01', balanceCents: 1 },
        { date: '2026-10-02', balanceCents: 500 },
        { date: '2026-10-03', balanceCents: 500 },
      ],
      1,
    ),
  ).toBe(1);
});

it('draws 4 to 5 Y ticks and a separate zero line', () => {
  for (const [lo, hi] of [
    [-4_599, 250_000],
    [98_766, 100_000],
    [0, 7],
    [-10_000, 12_345],
  ] as const) {
    const ticks = yTicksFor(lo, hi);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(ticks).not.toContain(0);
  }
  const { container } = render(
    <BalanceChart points={actual} windowLabel="3M" previewPoints={forecast} />,
  );
  expect(container.querySelectorAll('line.graticule').length).toBeGreaterThanOrEqual(4);
});

it('shows one drawing at a time for a foreign currency', () => {
  const usd = actual.map((p) => ({
    ...p,
    valuation: {
      currency: 'USD',
      asOf: p.date,
      eurCents: Math.round(p.balanceCents * 0.75),
      rateMicro: 750_000,
      rateDate: p.date,
      rateSource: 'test',
    },
  }));
  const native = render(<BalanceChart points={usd} windowLabel="3M" currency="USD" />);
  expect(native.container.querySelectorAll('svg.chart')).toHaveLength(1);
  expect(native.container.querySelector('[data-testid="balance-chart"]')).toBeTruthy();
  native.unmount();
  const eur = render(<BalanceChart points={usd} windowLabel="3M" currency="USD" view="eur" />);
  expect(eur.container.querySelectorAll('svg.chart')).toHaveLength(1);
  expect(eur.container.querySelector('[data-testid="balance-chart-eur"]')).toBeTruthy();
});
