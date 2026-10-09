// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { paceForecastCurve, paceModel } from '@budget/domain';
import { BalanceChart, DailyBudgetLine, HeutePaceChart, type PaceChartData } from './charts';
import type { Heute } from './api';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 360] }));
afterEach(cleanup);
it('labels actual history before today and separates payment numbers from the low point', () => {
  const { container } = render(
    <BalanceChart
      chainOpen={false}
      onToggleChain={() => {}}
      data={
        {
          ...dailyData,
          lead: { freeCents: 10000 },
          stand: { ...dailyData.stand, today: '2026-10-06', period: 'payday', to: '2026-10-17' },
          balance: {
            actual: [
              { day: '2026-09-22', balanceCents: 50000 },
              { day: '2026-10-06', balanceCents: 40000 },
            ],
            forecast: [
              { day: '2026-10-06', balanceCents: 40000, variableCents: 0, items: [] },
              {
                day: '2026-10-10',
                balanceCents: 10000,
                variableCents: 0,
                items: [{ cents: -30000, label: 'Geplante Ausgabe' }],
              },
              { day: '2026-10-17', balanceCents: 10000, variableCents: 0, items: [] },
            ],
            low: { day: '2026-10-10', cents: 10000, index: 1 },
            salary: null,
          },
        } as Heute
      }
    />,
  );
  expect(screen.getByText('bisher')).toBeTruthy();
  const actual = screen.getByText('bisher');
  const today = screen.getByText('heute');
  expect(Number(actual.getAttribute('x'))).toBeLessThan(Number(today.getAttribute('x')));
  const marker = container.querySelector('[data-payment-marker] text')!;
  const low = screen.getByText(/^Tiefpunkt/);
  expect(
    Math.abs(Number(marker.getAttribute('y')) - Number(low.getAttribute('y'))),
  ).toBeGreaterThanOrEqual(20);
});

it('explains which account groups the cash forecast includes and excludes', () => {
  const { container } = render(
    <BalanceChart
      chainOpen={false}
      onToggleChain={() => {}}
      data={
        {
          ...dailyData,
          lead: {
            needCents: 0,
            wantCents: 0,
            openCents: 0,
            freeCents: 28_000,
            daysToPayday: 0,
            chain: [],
            items: { need: [], want: [], open: [] },
          } satisfies Heute['lead'],
          stand: {
            ...dailyData.stand,
            today: '2026-09-15',
            period: 'month',
            to: '2026-10-02',
          },
          balance: {
            actual: [{ day: '2026-09-15', balanceCents: 80_000 }],
            forecast: [
              { day: '2026-09-15', balanceCents: 80_000, variableCents: 0, items: [] },
              { day: '2026-09-16', balanceCents: 80_000, variableCents: 0, items: [] },
            ],
            low: { day: '2026-09-16', cents: 80_000, index: 1 },
            salary: null,
          },
        } as Heute
      }
    />,
  );

  const label = container
    .querySelector('[data-testid="heute-balance-chart"]')
    ?.getAttribute('aria-label');
  expect(label).toMatch(/Budget-Konten/);
  expect(label).toMatch(
    /(Kreditkarten.*(inklusive|eingeschlossen|einbezogen)|(inklusive|eingeschlossen|einbezogen).*Kreditkarten)/i,
  );
  expect(label).toMatch(
    /((Reserve|Reservekonten).*(ohne|ausgeschlossen)|(ohne|ausgeschlossen).*(Reserve|Reservekonten))/i,
  );
});

const dailyData = {
  stand: { payday: { day: '2026-10-15' } },
  dailyBudget: { remainingDays: 10, perDayCents: 3800 },
} as Heute;
it('shows the daily budget with a formula on hover and keyboard focus', () => {
  render(<DailyBudgetLine data={dailyData} />);
  expect(screen.getByText('≈ 38 € pro Tag · noch 10 Tage bis zum Gehalt')).toBeTruthy();
  const info = screen.getByRole('button', { name: 'Tagesbudget erklären' });
  fireEvent.mouseEnter(info);
  expect(screen.getByRole('tooltip').textContent).toBe(
    'Frei verfügbar bis Gehalt geteilt durch die verbleibenden Tage einschließlich heute bis zum nächsten Gehalt (am Gehaltstag: ein Tag), auf ganze Euro gerundet.',
  );
  fireEvent.mouseLeave(info);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.focus(info);
  expect(screen.getByRole('tooltip')).toBeTruthy();
  fireEvent.keyDown(info, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
});
it.each([0, -1])('shows alarm copy without a daily figure for lead %i', (freeCents) => {
  const { container } = render(
    <DailyBudgetLine
      data={
        {
          ...dailyData,
          lead: { freeCents },
          dailyBudget: { remainingDays: 10, perDayCents: null },
        } as Heute
      }
    />,
  );
  expect(screen.getByText('Kein Spielraum bis zum Gehalt am 15.10.')).toBeTruthy();
  expect(container.querySelector('.heute-daily-budget.is-alarm')).toBeTruthy();
  expect(container.textContent).not.toContain('pro Tag');
});
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
    expected: [0, 1500, 3000],
    forecast: [],
    fixedDays: [],
    figures: {
      spentCents: 3000,
      planToDateCents: 3000,
      expectedToDateCents: 3000,
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
it('keeps context series off by default and toggles their drawing and legend together', () => {
  const { container } = render(<HeutePaceChart data={data} />);
  expect(container.querySelector('.chart-legend')?.textContent).toBe('IstDeckel');
  expect(container.querySelector('.pace-income-line')).toBeNull();
  expect(container.querySelector('.l-prev')).toBeNull();
  expect(container.querySelector('.l-plan:not(.pace-limit-line)')).toBeNull();
  const toggle = screen.getByRole('button', { name: 'Mehr anzeigen' });
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(toggle);
  expect(container.querySelector('path.pace-income-line')?.getAttribute('d')).toContain('L');
  expect(container.querySelector('.chart-legend')?.textContent).toContain('Dezember · Vormonat');
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(toggle);
  expect(container.querySelector('.chart-legend')?.textContent).toBe('IstDeckel');
  fireEvent.focus(screen.getByRole('group', { name: /Pace 2026-01/ }));
  expect(screen.getByRole('status').textContent).toContain('Einnahmen bis dahin');
  expect(screen.getByRole('status').textContent).toContain('Ist');
  expect(screen.getByRole('status').textContent).toContain('Differenz');
});
it.each([2999, 3000, 3001])('colours forecast by its endpoint %i against the cap', (end) => {
  const { container } = render(
    <HeutePaceChart
      data={{
        ...data,
        stand: { today: '2026-01-02' },
        pace: {
          ...data.pace,
          todayDay: 2,
          forecast: [3000, end],
          figures: { ...data.pace.figures, forecastEndCents: end, forecastAvailable: true },
        },
      }}
    />,
  );
  expect(container.querySelector('.chart-legend')?.textContent).toContain('Hochrechnung');
  expect(container.querySelector('.l-forecast')?.getAttribute('d')).toMatch(/^M/);
  expect(container.querySelector('.l-forecast')?.classList.contains('is-over-cap')).toBe(
    end > 3000,
  );
  expect(
    container.querySelector('.chart-legend .l-forecast')?.classList.contains('is-over-cap'),
  ).toBe(end > 3000);
  const actualEnd = container
    .querySelector('path.l-actual')
    ?.getAttribute('d')
    ?.match(/L([^L]+)$/)?.[1];
  expect(container.querySelector('path.l-forecast')?.getAttribute('d')?.split('L')[0]).toBe(
    `M${actualEnd}`,
  );
  expect(container.querySelector('.l-plan')).toBeTruthy();
});

it('uses the scheduled plan for the today marker, while retaining all tooltip values in order', () => {
  const { container } = render(
    <HeutePaceChart
      data={{
        stand: { today: '2026-09-26' },
        pace: {
          ...data.pace,
          month: '2026-09',
          daysInMonth: 30,
          todayDay: 26,
          expected: Array.from({ length: 31 }, (_, d) => d * 10_000),
          plan: Array.from({ length: 31 }, (_, d) => (d === 26 ? 245_000 : d * 9_000)),
          actual: Array.from({ length: 27 }, (_, d) => (d ? 232_000 : 0)),
          forecast: [232_000, 240_923, 249_846, 258_769, 267_692],
          figures: {
            ...data.pace.figures,
            spentCents: 232_000,
            planToDateCents: 245_000,
            expectedToDateCents: 260_000,
            forecastEndCents: 267_692,
            forecastAvailable: true,
            limitCents: 300_000,
          },
        },
      }}
    />,
  );
  expect(screen.queryByTestId('pace-header')).toBeNull();
  expect(screen.getByText('Plan bis heute 2.450 €')).toBeTruthy();
  expect(container.querySelector('.pace-plan-marker')).toBeTruthy();
  const group = screen.getByRole('group', { name: /Pace 2026-09/ });
  fireEvent.focus(group);
  for (let d = 0; d < 26; d++) fireEvent.keyDown(group, { key: 'ArrowRight' });
  const tooltip = screen.getByRole('status');
  expect(tooltip.textContent).toContain('Ist2.320,00 €');
  expect(tooltip.textContent).toContain('Plan bis heute2.450,00 €');
  expect(tooltip.textContent).toContain('Deckel3.000,00 €');
  expect(tooltip.textContent).toContain('Hochrechnung2.320,00 €');
  expect(
    Array.from(tooltip.querySelectorAll('.chart-tooltip-row span'))
      .slice(0, 4)
      .map((el) => el.textContent),
  ).toEqual(['Ist', 'Hochrechnung', 'Deckel', 'Plan bis heute']);
  expect(tooltip.lastElementChild?.textContent).toBe(
    'Hochrechnung = Ausgegeben + offene Fixkosten + Rest des variablen Plans (ab Tag 7 hochgerechnet)',
  );
  expect(container.querySelector('.chart-legend')?.textContent).toContain('Ist');
  expect(container.querySelector('.chart-legend')?.textContent).toContain('Deckel');
  expect(container.querySelector('.pace-limit-line')?.getAttribute('d')).toMatch(/^M.+L/);
  expect(container.querySelectorAll('.l-today')).toHaveLength(1);
  expect(container.querySelectorAll('.svg-label').length).toBeGreaterThan(0);
});

it('shows under-plan actuals beside the over-cap forecast from the same September pace model', () => {
  const input = {
    month: '2026-09',
    today: '2026-09-15',
    limitCents: 10_000,
    fixed: [{ day: '2026-09-15', cents: 4_000, settled: false }],
    fixedSpentCents: 0,
    spending: [{ day: '2026-09-15', cents: 3_500 }],
  } as const;
  const model = paceModel(input);
  const { container } = render(
    <HeutePaceChart
      data={{
        ...data,
        stand: { today: '2026-09-15' },
        pace: {
          ...data.pace,
          month: model.month,
          daysInMonth: model.daysInMonth,
          todayDay: model.todayDay,
          plan: model.plan,
          expected: model.expected,
          actual: model.actual,
          previous: model.previous,
          fixedDays: model.fixedDays,
          forecast: paceForecastCurve(model, input.fixed),
          income: [],
          figures: model.figures,
        },
      }}
    />,
  );

  expect(screen.getByText('Plan bis heute 70 €')).toBeTruthy();
  expect(container.querySelector('.chart-legend')?.textContent).toBe('IstHochrechnungDeckel');
  expect(container.querySelector('path.l-actual')).toBeTruthy();
  expect(container.querySelector('path.l-forecast.is-over-cap')).toBeTruthy();
  expect(screen.getByRole('group', { name: /Pace 2026-09/ }).getAttribute('aria-label')).toContain(
    'Ist 35,00 €, Plan bis heute 70,00 €, Hochrechnung 110,00 € über Deckel, Deckel 100,00 €',
  );

  const group = screen.getByRole('group', { name: /Pace 2026-09/ });
  fireEvent.focus(group);
  for (let d = 0; d < 15; d++) fireEvent.keyDown(group, { key: 'ArrowRight' });
  let tooltip = screen.getByRole('status');
  expect(tooltip.textContent).toContain('Ist35,00 €');
  expect(tooltip.textContent).toContain('Plan bis heute70,00 €');
  expect(tooltip.textContent).toContain('Deckel100,00 €');
  expect(tooltip.textContent).toContain(
    'Hochrechnung = Ausgegeben + offene Fixkosten + Rest des variablen Plans (ab Tag 7 hochgerechnet)',
  );

  for (let d = 15; d < 30; d++) fireEvent.keyDown(group, { key: 'ArrowRight' });
  tooltip = screen.getByRole('status');
  expect(tooltip.textContent).toContain('Hochrechnung110,00 €');
});
