import { expect, it } from 'vitest';
import type { ReportTables } from '@budget/db';
import type { AssetsDebtsHistory, NetWorthHistory } from '@budget/db';
import { detectVerdictFacts, reportVerdict } from '@budget/domain';
import type { OnePagerData } from './month-api';
import type { Heute } from '../heute/api';
import {
  assetsDebtsVerdictFacts,
  heuteVerdictFacts,
  onePagerVerdictFacts,
  tableVerdictFacts,
  wealthHistoryVerdictFacts,
  wholeVerdictFacts,
} from './verdict-facts';
const tables: ReportTables = {
  asOf: '2025-10-05',
  currentMonth: '2025-10',
  firstMonth: '2025-07',
  lastFullMonth: '2025-09',
  netWorth: 'omitted',
  payees: {},
  targets: { savingsRateBp: 2000, moneyAgeDays: 30 },
  incomeTypes: [{ id: 'salary', name: 'Einkommen', role: 'income' }],
  categories: [
    { id: 'need', name: 'Wohnen', class: 'need', kind: 'fixed', groupId: 'g', groupName: 'Bedarf' },
  ],
  months: ['2025-07', '2025-08', '2025-09', '2025-10'].map((month, i) => ({
    month,
    income: { salary: 200000 },
    spending: { need: i === 3 ? 0 : 88000 },
    assigned: { need: 90000 },
    netWorthCents: null,
    moneyAgeDays: null,
  })),
};
const runningOnePager = (expectedIncomeProgress: OnePagerData['expectedIncomeProgress']) =>
  ({
    month: '2026-03',
    asOf: '2026-03-18',
    partial: true,
    beforeRecords: false,
    result: { savedCents: -60_000 },
    netWorth: { unavailable: true },
    top: [],
    expectedIncomeProgress,
  }) as unknown as OnePagerData;

it('puts the booked running-month result before the dated expected income', () => {
  const data = runningOnePager({
    pendingCount: 1,
    pendingCents: 300_000,
    fromDueDate: '2026-03-31',
    throughDueDate: '2026-03-31',
  });
  const text = reportVerdict(onePagerVerdictFacts(data)).text;

  expect(text).toContain('Zwischenstand');
  expect(text).toContain('18.03.');
  expect(text).toContain('gebuchtes Monatsergebnis');
  expect(text).toContain('−600 €');
  expect(text).toContain('31.03.');
  expect(text).toContain('3.000 €');
  expect(text.length).toBeLessThanOrEqual(140);
});

it('uses a date window for multiple pending incomes and stays explicit without any pending income', () => {
  const multiple = reportVerdict(
    onePagerVerdictFacts(
      runningOnePager({
        pendingCount: 2,
        pendingCents: 350_000,
        fromDueDate: '2026-03-20',
        throughDueDate: '2026-03-31',
      }),
    ),
  ).text;
  expect(multiple).toContain('3.500 €');
  expect(multiple).toContain('2 erwarteten Einnahmen');
  expect(multiple).toContain('20.03. bis 31.03.');
  expect(multiple).not.toContain('am 20.03.');
  expect(multiple.length).toBeLessThanOrEqual(140);

  const noPending = reportVerdict(onePagerVerdictFacts(runningOnePager(null))).text;
  expect(noPending).toContain('Zwischenstand bis 18.03.');
  expect(noPending).toContain('−600 €');
  expect(noPending).not.toContain('erwartete Einnahme');
});

it('keeps a completed month in the ordinary verdict instead of describing a running balance', () => {
  const closed = runningOnePager(null);
  const text = reportVerdict(onePagerVerdictFacts({ ...closed, partial: false })).text;
  expect(text).not.toContain('Zwischenstand');
  expect(text).not.toContain('18.03.');
});

it('keeps Heute salary context in the actual calendar month, not a selected forecast month', () => {
  const heute = (salaryDay: string) =>
    ({
      stand: { today: '2026-03-18' },
      monthResult: { savedCents: -60_000 },
      balance: { salary: { day: salaryDay, cents: 300_000 } },
    }) as unknown as Heute;
  const currentMonth = reportVerdict(heuteVerdictFacts(heute('2026-03-31'))).text;
  expect(currentMonth).toContain('Zwischenstand bis 18.03.');
  expect(currentMonth).toContain('3.000 €');
  expect(currentMonth).toContain('31.03.');

  const nextMonth = reportVerdict(heuteVerdictFacts(heute('2026-04-01'))).text;
  expect(nextMonth).toContain('Zwischenstand bis 18.03.');
  expect(nextMonth).toContain('−600 €');
  expect(nextMonth).not.toContain('3.000 €');
  expect(nextMonth).not.toContain('31.03.');
});

it('uses the shared household savings definition and excludes the running month from records', () => {
  const facts = tableVerdictFacts('sparquote', tables, '2025-09');
  expect(facts.metric).toEqual({
    label: 'Sparquote',
    value: 5600,
    unit: 'percent',
    better: 'higher',
  });
  expect(facts.history?.map((p) => p.value)).toEqual([5600, 5600, 5600]);
  expect(facts.savingsTargetBp).toBe(2000);
  expect(facts.categoryStreaks).toEqual([
    {
      category: 'Wohnen',
      margins: ['2025-07', '2025-08', '2025-09'].map((month) => ({ month, value: 2000 })),
    },
  ]);
  expect(facts.partial).toBe(false);
  expect(tableVerdictFacts('gesamt', tables, '2025-10').partial).toBe(true);
});
it('uses the selected historical end instead of leaking newer months', () => {
  expect(tableVerdictFacts('jahr', tables, '2025-08').history?.map((p) => p.month)).toEqual([
    '2025-07',
    '2025-08',
  ]);
});
it('derives budget margins from the planned categories: zero means nothing went over', () => {
  const over: ReportTables = {
    ...tables,
    months: tables.months.map((m, i) => ({ ...m, spending: { need: i === 1 ? 95000 : 88000 } })),
  };
  expect(tableVerdictFacts('konsum', over, '2025-09').budgetMargins).toEqual([
    { month: '2025-07', value: 0 },
    { month: '2025-08', value: -5000 },
    { month: '2025-09', value: 0 },
  ]);
  const types = detectVerdictFacts(tableVerdictFacts('konsum', tables, '2025-09')).map(
    (f) => f.type,
  );
  expect(types).toContain('streak-budget');
});
it('feeds wealth changes from the daily series and the whole-picture rows', () => {
  const history = {
    from: '2025-06-30',
    to: '2025-09-30',
    chain: {
      startCents: 100000,
      ownCents: 30000,
      marketCents: 5000,
      nowCents: 135000,
      deltaCents: 35000,
    },
    daily: [
      { date: '2025-07-31', netWorthCents: 110000 },
      { date: '2025-08-15', netWorthCents: 115000 },
      { date: '2025-08-31', netWorthCents: 120000 },
      { date: '2025-09-30', netWorthCents: 135000 },
    ],
  } as unknown as NetWorthHistory;
  const facts = wealthHistoryVerdictFacts('vermoegen', history);
  expect(facts.wealthChanges).toEqual([
    { month: '2025-07', value: 10000 },
    { month: '2025-08', value: 10000 },
    { month: '2025-09', value: 15000 },
  ]);
  expect(detectVerdictFacts(facts).map((f) => f.type)).toContain('streak-wealth');
  const row = {
    month: '2025-09',
    savedCents: 1000,
    marketCents: 200,
    startCents: 5000,
    endCents: 6200,
    deltaCents: 1200,
  };
  const rows = [8, 9, 10].map((m) => ({ ...row, month: `2025-${String(m).padStart(2, '0')}` }));
  const whole = wholeVerdictFacts(row as never, false, rows as never);
  expect(whole.wealthChanges?.map((p) => p.month)).toEqual(['2025-08', '2025-09']);
  expect(whole.details?.map((d) => [d.label, d.value])).toEqual([
    ['Gespart', 1000],
    ['Markt', 200],
    ['Nettovermögen', 1200],
  ]);
});
it('derives the debt reduction from the last two month ends', () => {
  const month = (m: string, net: number, debts: number) => ({
    month: m,
    netCents: net,
    debtsCents: debts,
    incomplete: false,
  });
  const history = {
    from: '2025-07-31',
    to: '2025-09-30',
    months: [
      month('2025-07', 100000, -50000),
      month('2025-08', 110000, -45000),
      month('2025-09', 120000, -40000),
    ],
    change: { deltaCents: 20000 },
  } as unknown as AssetsDebtsHistory;
  const facts = assetsDebtsVerdictFacts('vermoegen-schulden', history);
  expect(facts.debt).toEqual({ currentCents: 40000, previousCents: 45000 });
  expect(detectVerdictFacts(facts).find((f) => f.type === 'debt-down')?.value).toBe(5000);
});
