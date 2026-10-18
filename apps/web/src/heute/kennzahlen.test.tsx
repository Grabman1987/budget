// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BudgetMonthView } from '../budget/budget-api';
import type { Heute } from './api';
import { Kennzahlen } from './kennzahlen';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#source">{children}</a>,
}));
afterEach(cleanup);

const heute = {
  stand: {
    today: '2026-09-26',
    month: '2026-09',
    period: 'month',
    payday: { day: '2026-09-30', daysToPayday: 4 },
  },
  lead: { freeCents: 68_001 },
  monthResult: { earnedCents: 350_001, consumptionCents: 232_000, savedCents: 118_001 },
  budgetAnswer: {
    spentCents: 232_000,
    plannedCents: 300_000,
    remainingCents: 68_000,
    day: 26,
    daysInMonth: 30,
  },
  netWorth: {
    totalCents: 3_500_001,
    assetsCents: 52_500_001,
    liabilitiesCents: 49_000_000,
    monthChange: { deltaCents: 112_001, investmentsInCents: 80_001, marketCents: 32_000 },
  },
  balance: { salary: { day: '2026-09-30', cents: 381_200 } },
  nearestGoal: null,
} as unknown as Heute;

/** Two envelopes (+12,34 € and −2,00 €) and a month with 100,00 € still to distribute. */
const month = {
  summary: {
    toBeAssignedCents: 10_000,
    assignedCents: 40_000,
    carryInCents: 20_000,
    incomeCents: 30_000,
    uncoveredCents: 0,
    heldCents: 0,
    envelopes: [
      { categoryId: 'a', availableCents: 1_234, assignedCents: 0, activityCents: 0 },
      { categoryId: 'b', availableCents: -200, assignedCents: 0, activityCents: 0 },
    ],
  },
  groups: [{ id: 'g', name: 'Gruppe', sortOrder: 0 }],
  categories: [
    { id: 'a', groupId: 'g', name: 'A', class: 'need', kind: 'variable', sortOrder: 0 },
    { id: 'b', groupId: 'g', name: 'B', class: 'need', kind: 'variable', sortOrder: 1 },
  ],
} as unknown as BudgetMonthView;

const query = (over: Partial<UseQueryResult<BudgetMonthView>> = {}) =>
  ({
    data: month,
    isPending: false,
    isError: false,
    error: null,
    refetch: () => Promise.resolve(),
    ...over,
  }) as unknown as UseQueryResult<BudgetMonthView>;

it('shows Zu verteilen, Verfügbar im Budget and Nettovermögen from the existing figures', () => {
  render(<Kennzahlen data={heute} budget={query()} onLeadClick={() => {}} />);
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    'Zu verteilen',
    'Verfügbar im Budget',
    'Nettovermögen',
  ]);
  const value = (kennzahl: string) =>
    document.querySelector(`[data-kennzahl="${kennzahl}"]`)?.textContent;
  expect(value('zu-verteilen')).toBe('100,00 €');
  expect(value('verfuegbar')).toBe('10,34 €');
  expect(value('nettovermoegen')).toBe('35.000,01 €');
});

it('keeps every context line within 40 characters', () => {
  render(<Kennzahlen data={heute} budget={query()} onLeadClick={() => {}} />);
  const lines = [...document.querySelectorAll('.heute-kennzahl-line')].map((p) => p.textContent!);
  expect(lines).toEqual(['Zugewiesen 400 €', 'Ausgegeben 2.320 € von 3.000 €', 'Δ Monat +1.120 €']);
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(40);
});

it('replaces the middle figure by Frei bis Gehalt in the mode Bis Gehalt', () => {
  const onLeadClick = vi.fn();
  render(
    <Kennzahlen
      data={{ ...heute, stand: { ...heute.stand, period: 'payday' } } as Heute}
      budget={query()}
      onLeadClick={onLeadClick}
    />,
  );
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    'Zu verteilen',
    'Frei bis Gehalt',
    'Nettovermögen',
  ]);
  const lead = screen.getByTestId('heute-lead-value');
  expect(lead.textContent).toBe('680,01 €');
  fireEvent.click(lead);
  expect(onLeadClick).toHaveBeenCalledOnce();
  expect(screen.getByText('Bis 30.09. · noch 4 Tage')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Herleitung Frei bis Gehalt' }));
  const note = document.getElementById('kennzahl-frei-bis-gehalt-note')!;
  expect(note.textContent).toContain('Plan-Rest 680,00 €');
  expect(note.textContent).toContain('kein Kontoguthaben');
  expect(note.textContent).toContain('Nächster erwarteter Geldeingang: 30.09. · 3.812,00 €');
});

it('marks only negative money as an alert', () => {
  const negative = {
    ...month,
    summary: { ...month.summary, toBeAssignedCents: -1 },
  } as unknown as BudgetMonthView;
  render(<Kennzahlen data={heute} budget={query({ data: negative })} onLeadClick={() => {}} />);
  expect(document.querySelector('[data-kennzahl="zu-verteilen"]')!.className).toContain(
    'heute-alert',
  );
  expect(document.querySelector('[data-kennzahl="nettovermoegen"]')!.className).not.toContain(
    'heute-alert',
  );
});

it('opens the derivation behind the info button', () => {
  render(<Kennzahlen data={heute} budget={query()} onLeadClick={() => {}} />);
  const info = screen.getByRole('button', { name: 'Herleitung Zu verteilen' });
  expect(info.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(info);
  expect(info.getAttribute('aria-expanded')).toBe('true');
  const note = document.getElementById(info.getAttribute('aria-controls')!)!;
  expect(within(note).getByText(/Dieselbe Zahl wie im Plan/)).toBeTruthy();
  // The explanation of the former Monatsergebnis card stays reachable here.
  expect(
    within(note).getByText(/Haushaltseinnahmen 3\.500,01 € im September 2026 nach Buchungsdatum/),
  ).toBeTruthy();
  expect(within(note).getByRole('link', { name: 'Planmonat September 2026 ansehen' })).toBeTruthy();
});

it('keeps a failed budget in its own tile and the other figures visible', () => {
  render(
    <Kennzahlen
      data={heute}
      budget={query({ data: undefined, isError: true, error: new Error('kaputt') })}
      onLeadClick={() => {}}
    />,
  );
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  expect(document.querySelector('[data-kennzahl="nettovermoegen"]')?.textContent).toBe(
    '35.000,01 €',
  );
});

it('says why the net worth is missing without inventing a number', () => {
  const missing = {
    ...heute,
    netWorth: { unavailable: { message: 'Ein Wertpapierkurs fehlt.', reason: 'missing_price' } },
  } as unknown as Heute;
  const { container } = render(
    <Kennzahlen data={missing} budget={query()} onLeadClick={() => {}} />,
  );
  expect(screen.getByText('Ein Wertpapierkurs fehlt.')).toBeTruthy();
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
});

it('labels the current figures for another month and shows the nearest goal only when there is one', () => {
  const away = {
    ...heute,
    stand: { ...heute.stand, month: '2026-08' },
    nearestGoal: { name: 'Reise', savedCents: 120_001, remainingCents: 80_000 },
  } as unknown as Heute;
  const { unmount } = render(<Kennzahlen data={away} budget={query()} onLeadClick={() => {}} />);
  expect(screen.getByText('Stand heute · 26.09.2026')).toBeTruthy();
  expect(screen.getByText('Reise · gespart 1.200,01 € · fehlt 800,00 €')).toBeTruthy();
  unmount();
  render(<Kennzahlen data={heute} budget={query()} onLeadClick={() => {}} />);
  expect(screen.queryByText(/Stand heute/)).toBeNull();
  expect(screen.queryByText(/gespart/)).toBeNull();
});
