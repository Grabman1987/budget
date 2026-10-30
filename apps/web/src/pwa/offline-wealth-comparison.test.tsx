// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Heute } from '../heute/api';
import { OfflineState } from './offline-state';
import { readSnapshots } from './snapshots';
import { forecast35dFixture } from '../heute/forecast.test-fixture';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false }));
const epoch = vi.hoisted(() => ({ changed: undefined as (() => void) | undefined }));
vi.mock('../shell/redesign-flag', () => flags);

vi.mock('./snapshots', () => ({
  readSnapshots: vi.fn(),
  subscribeSnapshotEpoch: (changed: () => void) => {
    epoch.changed = changed;
    return () => {
      epoch.changed = undefined;
    };
  },
}));
afterEach(() => {
  cleanup();
  flags.REDESIGN_ENABLED = false;
  vi.clearAllMocks();
});

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
    expect(screen.getByText(/^Stand vom/).textContent).toBe(
      `Stand vom ${new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' }).format(1)}`,
    );
    expect(label.nextElementSibling?.textContent).toBe(expected);
    expect(screen.getByText('Nettovermögen').nextElementSibling?.textContent).toBe('150,01 €');
  },
);

it('T2 shows the saved canonical 35-day low instead of the different budget-window low', async () => {
  flags.REDESIGN_ENABLED = true;
  window.history.replaceState(null, '', '/?monat=2026-03');
  const data = savedHeute(null);
  data.balance.low = { day: '2026-03-19', index: 1, cents: 777_777 };
  vi.mocked(readSnapshots).mockResolvedValue({
    heute: {
      kind: 'heute',
      key: '/api/heute?month=2026-03&period=month',
      fetchedAt: Date.parse('2026-03-18T08:30:00+01:00'),
      epoch: 'synthetic',
      data: {
        ...data,
        forecast35d: forecast35dFixture(),
      },
    },
  });
  render(<OfflineState onCapture={() => {}} />);
  const forecast = await screen.findByRole('region', { name: 'Kontoprognose · 35 Tage' });
  expect(forecast.textContent).toContain('875,00 €');
  expect(forecast.textContent).toContain('22.04.2026');
  expect(forecast.textContent).not.toContain('7.777,77');
  expect(forecast.textContent).toContain('18.03.2026');
  expect(
    within(forecast).getByRole('list', { name: 'Gespeicherte 35-Tage-Kontoprognose' }).children,
  ).toHaveLength(36);
});

async function savedForecast(data: Heute, path = '/?monat=2026-03') {
  window.history.replaceState(null, '', path);
  vi.mocked(readSnapshots).mockResolvedValue({
    heute: {
      kind: 'heute',
      key: '/api/heute?month=2026-03&period=month',
      fetchedAt: Date.parse('2026-03-18T08:30:00+01:00'),
      epoch: 'synthetic',
      data,
    },
  });
  await act(async () => {
    render(<OfflineState onCapture={() => {}} />);
  });
}

it('T2 keeps OFF on its existing budget-window presentation', async () => {
  const data = savedHeute(null);
  data.balance.low = { day: '2026-03-19', index: 1, cents: 777_777 };
  data.forecast35d = forecast35dFixture();
  await savedForecast(data);
  expect(screen.queryByRole('region', { name: 'Kontoprognose · 35 Tage' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Kontoverlauf und Prognose' })).toBeTruthy();
  expect(screen.getByText(/Tiefpunkt 2026-03-19/).textContent).toContain('7.777,77');
});

it('T2 keeps older saved responses unavailable under the 35-day label', async () => {
  flags.REDESIGN_ENABLED = true;
  const data = savedHeute(null);
  data.balance.low = { day: '2026-03-19', index: 1, cents: 777_777 };
  await savedForecast(data);
  const region = screen.getByRole('region', { name: 'Kontoprognose · 35 Tage' });
  expect(region.textContent).toContain(
    '35-Tage-Prognose in diesem gespeicherten Stand nicht verfügbar.',
  );
  expect(region.textContent).not.toContain('7.777,77');
  expect(screen.getByText(/Tiefpunkt im Budgetzeitraum/)).toBeTruthy();
});

it('T2 preserves a known zero low instead of labelling it missing', async () => {
  flags.REDESIGN_ENABLED = true;
  const data = savedHeute(null);
  const forecast = forecast35dFixture();
  forecast.report.startCents = 0;
  forecast.report.points = forecast.report.points.map((point) => ({
    ...point,
    balanceCents: 0,
    bufferCents: 0,
    plainCents: 0,
  }));
  forecast.report.low = { day: '2026-03-18', index: 0, cents: 0 };
  data.forecast35d = forecast;
  await savedForecast(data);
  const region = screen.getByRole('region', { name: 'Kontoprognose · 35 Tage' });
  expect(region.querySelector('strong')?.textContent).toBe('0,00 € · 18.03.2026');
});

it.each([
  [
    { asOf: '2026-03-18', horizon: '35d', levers: [], available: false, report: null },
    'Ohne Budget-Konto gibt es keine Kontoprognose.',
  ],
  [
    {
      asOf: '2026-03-18',
      horizon: '35d',
      levers: [],
      unavailable: {
        reason: 'missing_fx',
        asOf: '2026-03-18',
        message: 'Ein benötigter Wechselkurs fehlt.',
      },
    },
    'Ein benötigter Wechselkurs fehlt.',
  ],
] satisfies Array<[NonNullable<Heute['forecast35d']>, string]>)(
  'T2 explains an unavailable saved forecast without fabricating a low',
  async (forecast, message) => {
    flags.REDESIGN_ENABLED = true;
    const data = savedHeute(null);
    data.forecast35d = forecast;
    await savedForecast(data);
    const region = screen.getByRole('region', { name: 'Kontoprognose · 35 Tage' });
    expect(region.textContent).toContain(message);
    expect(region.querySelector('strong')).toBeNull();
  },
);

it.each(['/?monat=2026-04', '/?monat=2026-03&period=payday'])(
  'T2 denies mixed saved context at %s',
  async (path) => {
    flags.REDESIGN_ENABLED = true;
    const data = savedHeute(null);
    data.forecast35d = forecast35dFixture();
    await savedForecast(data, path);
    expect(screen.queryByRole('region', { name: 'Kontoprognose · 35 Tage' })).toBeNull();
    expect(screen.getByText('Kein gespeicherter Abruf vorhanden.')).toBeTruthy();
  },
);

it('T2 removes the canonical financial result on the existing snapshot-epoch revocation signal', async () => {
  flags.REDESIGN_ENABLED = true;
  const data = savedHeute(null);
  data.forecast35d = forecast35dFixture();
  await savedForecast(data);
  expect(screen.getByRole('region', { name: 'Kontoprognose · 35 Tage' })).toBeTruthy();
  act(() => epoch.changed?.());
  expect(screen.queryByRole('region', { name: 'Kontoprognose · 35 Tage' })).toBeNull();
  expect(screen.getByText('Kein gespeicherter Abruf vorhanden.')).toBeTruthy();
});

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
