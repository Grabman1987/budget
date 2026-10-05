// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HeutePaceChart, type PaceChartData } from './charts';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 360] }));
afterEach(cleanup);
const data: PaceChartData = {
  stand: { today: '2026-02-05' },
  pace: {
    month: '2026-01',
    previousMonth: '2025-12',
    daysInMonth: 31,
    todayDay: 31,
    actual: [0, 1000, 3000],
    income: [0, 2000, 2000],
    previous: [0, 500, 1500],
    plan: [0, 1500, 3000],
    forecast: [],
    fixedDays: [],
    figures: {
      spentCents: 3000,
      planToDateCents: 3000,
      forecastEndCents: 3000,
      forecastAvailable: false,
      deltaCents: 0,
      limitCents: 3000,
      variableSoFarCents: 3000,
      openFixedCents: 0,
      over: false,
    },
  },
};
it('draws income and only labels drawn series in a completed month at half width', () => {
  const { container } = render(<HeutePaceChart data={data} />);
  expect(container.querySelector('.pace-income-line')?.getAttribute('d')).toContain('L');
  expect(container.querySelector('.chart-legend')?.textContent).toContain('Einnahmen');
  expect(container.querySelector('.chart-legend')?.textContent).not.toContain('Prognose');
  expect(container.querySelector('.chart-legend')?.textContent).toContain('Dezember · Vormonat');
  fireEvent.focus(screen.getByRole('group', { name: /Pace 2026-01/ }));
  expect(screen.getByRole('status').textContent).toContain('Einnahmen bis dahin');
  expect(screen.getByRole('status').textContent).toContain('Ausgaben bis dahin');
  expect(screen.getByRole('status').textContent).toContain('Differenz');
});
it('draws and labels the darker forecast starting at the actual point', () => {
  const { container } = render(
    <HeutePaceChart
      data={{
        ...data,
        stand: { today: '2026-01-02' },
        pace: { ...data.pace, todayDay: 2, forecast: [3000, 4000, 5000] },
      }}
    />,
  );
  expect(container.querySelector('.chart-legend')?.textContent).toContain('Prognose');
  expect(container.querySelector('.l-forecast')?.getAttribute('d')).toMatch(/^M/);
  expect(container.querySelector('.l-plan')).toBeTruthy();
});
