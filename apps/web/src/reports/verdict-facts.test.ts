import { expect, it } from 'vitest';
import type { ReportTables } from '@budget/db';
import type { AssetsDebtsHistory, NetWorthHistory } from '@budget/db';
import { detectVerdictFacts } from '@budget/domain';
import {
  assetsDebtsVerdictFacts,
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
