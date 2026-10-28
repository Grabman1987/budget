// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Heute } from '../heute/api';
import { OfflineState } from './offline-state';
import { readSnapshots } from './snapshots';

vi.mock('./snapshots', () => ({
  readSnapshots: vi.fn(),
  subscribeSnapshotEpoch: () => () => {},
}));
afterEach(cleanup);

it.each([
  [null, 'Nicht verfügbar'],
  [0, '0,00 €'],
  [-123, '−1,23 €'],
  [123, '1,23 €'],
] as const)(
  'renders saved annual wealth change %s without hiding known cents',
  async (change, expected) => {
    window.history.replaceState(null, '', '/?monat=2026-03');
    vi.mocked(readSnapshots).mockResolvedValue({
      heute: {
        kind: 'heute',
        key: '/api/heute?month=2026-03&period=month',
        fetchedAt: 1,
        epoch: 'synthetic',
        data: savedHeute(change),
      },
    });
    render(<OfflineState onCapture={() => {}} />);
    const label = await screen.findByText('Veränderung zum Vorjahr');
    expect(label.nextElementSibling?.textContent).toBe(expected);
    expect(screen.getByText('Nettovermögen').nextElementSibling?.textContent).toBe('150,01 €');
  },
);

function savedHeute(yearDeltaCents: number | null): Heute {
  return {
    stand: {
      today: '2026-03-18',
      month: '2026-03',
      period: 'month',
      from: '2026-03-01',
      to: '2026-04-02',
      payday: { day: '2026-03-31', source: 'payday_rule', daysToPayday: 13 },
      budgetBalanceCents: 0,
    },
    lead: {
      needCents: 0,
      wantCents: 0,
      openCents: 0,
      freeCents: 0,
      daysToPayday: 13,
      chain: [],
      items: { need: [], want: [], open: [] },
    },
    dailyBudget: { remainingDays: 13, perDayCents: null },
    budgetAnswer: { spentCents: 0, plannedCents: 0, remainingCents: 0, day: 18, daysInMonth: 31 },
    monthResult: { earnedCents: 0, consumptionCents: 0, savedCents: 0 },
    nearestGoal: null,
    balance: { actual: [], forecast: [], salary: null, low: null },
    pace: {
      month: '2026-03',
      previousMonth: '2026-02',
      daysInMonth: 31,
      todayDay: 18,
      plan: [],
      expected: [],
      actual: [],
      income: [],
      previous: [],
      forecast: [],
      fixedDays: [],
      figures: {
        spentCents: 0,
        planToDateCents: 0,
        expectedToDateCents: 0,
        deltaCents: 0,
        forecastEndCents: 0,
        forecastAvailable: false,
        limitCents: 0,
        variableSoFarCents: 0,
        openFixedCents: 0,
        over: false,
      },
    },
    netWorth: {
      totalCents: 15_001,
      liquidCents: 15_001,
      assetsCents: 15_001,
      liabilitiesCents: 0,
      investedCents: 0,
      receivableCents: 0,
      debtCents: 0,
      asOf: '2026-03-18',
      monthChange: { deltaCents: 0, investmentsInCents: 0, marketCents: 0 },
      yearAgoDay: '2025-03-18',
      yearAgoCents: null,
      yearDeltaCents,
      previousMonthEndCents: null,
      deltaCents: null,
      deltaBp: null,
      series: [],
    },
    financeCheck: {
      counts: { ok: 0, warn: 0, bad: 0, total: 0, notEvaluated: 0 },
      keyRules: [],
      actionRules: [],
    },
    attention: {
      inboxCount: 0,
      pendingCount: 0,
      pendingBefore: '2026-03-11',
      loanTermsMissing: false,
    },
    pinned: [],
    upcoming14: [],
    upcomingEvents: [],
    accountReminders: [],
    lastBookings: [],
    nextSteps: { items: [], count: 0 },
  };
}
