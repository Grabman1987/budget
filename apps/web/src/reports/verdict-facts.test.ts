import { expect, it } from 'vitest';
import type { ReportTables } from '@budget/db';
import { tableVerdictFacts } from './verdict-facts';
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
