// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AnswerCards } from './answer-cards';
import type { Heute } from './api';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#source">{children}</a>,
}));
afterEach(cleanup);
const data = {
  stand: { today: '2026-09-26' },
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
  nearestGoal: { id: 'synthetic-goal', name: 'Reise', savedCents: 120_001, remainingCents: 80_000 },
} as unknown as Heute;

it('answers three questions with exact money, source links, proportional bars and a labelled time marker', () => {
  const { container } = render(<AnswerCards data={data} onBudgetClick={() => {}} />);
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    'Nettovermögen',
    'Dieser Monat',
    'Budget',
  ]);
  expect(screen.getByText('35.000,01 €')).toBeTruthy();
  expect(screen.getByText('1.180,01 €')).toBeTruthy();
  expect(screen.getByText('680,01 €')).toBeTruthy();
  expect(
    screen.getByText('Δ Monat: +1.120,01 € davon Einzahlung +800,01 € · Markt +320,00 €'),
  ).toBeTruthy();
  expect(screen.getByText('Vermögen 525.000,01 € · Schulden 490.000,00 €')).toBeTruthy();
  expect(screen.getByText('Einnahmen 3.500,01 €')).toBeTruthy();
  expect(screen.getByText('Ausgaben 2.320,00 €')).toBeTruthy();
  expect(screen.getByText('Ausgegeben 2.320,00 € · Übrig 680,00 €')).toBeTruthy();
  expect(screen.getByText('Tag 26 von 30')).toBeTruthy();
  expect(screen.getByText('Reise · gespart 1.200,01 € · fehlt 800,00 €')).toBeTruthy();
  expect(screen.getAllByRole('img')).toHaveLength(3);
  expect(container.querySelector<HTMLElement>('.heute-answer-marker')!.style.left).toBe(
    `${(26 / 30) * 100}%`,
  );
});

it('keeps zero, overspending, missing valuation and missing goals explicit without invalid bars', () => {
  const edge = {
    ...data,
    nearestGoal: null,
    netWorth: {
      unavailable: {
        message: 'Ein Wertpapierkurs fehlt.',
        reason: 'missing_price',
        asOf: '2026-09-26',
      },
    },
    monthResult: { earnedCents: 0, consumptionCents: 101, savedCents: -101 },
    budgetAnswer: {
      spentCents: 101,
      plannedCents: 0,
      remainingCents: -101,
      day: 26,
      daysInMonth: 30,
    },
    lead: { ...data.lead, freeCents: -1 },
  } as Heute;
  const { container } = render(<AnswerCards data={edge} onBudgetClick={() => {}} />);
  expect(screen.getByText('Ein Wertpapierkurs fehlt.')).toBeTruthy();
  expect(screen.getByText('Einnahmen 0,00 €')).toBeTruthy();
  expect(screen.getByText('−0,01 €')).toBeTruthy();
  expect(screen.queryByText(/gespart/)).toBeNull();
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  expect(container.querySelectorAll('.heute-answer-bar')).toHaveLength(2);
});
