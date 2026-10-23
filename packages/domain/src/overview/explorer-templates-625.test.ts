import { describe, expect, it } from 'vitest';
import { monthsBetween } from '../date';
import { analyseSpending } from '../spending/analysis';
import { buildTableRows, buildYearView, categoryTrend } from '../report-tables/tables';
import {
  explorerTemplate,
  explorerTemplateSources,
  explorerTemplateSummaries,
  explorerTemplateYears,
  isExplorerTemplate,
  type ExplorerTemplateFacts,
} from './explorer-templates';
import type { OverviewSplit } from './figures';

const source = (
  bookingId: string,
  date: string,
  cents: number,
  categoryId: string | null,
  incomeTypeId: string | null = null,
  incomeGroup: OverviewSplit['incomeGroup'] = null,
): OverviewSplit => ({
  bookingId,
  date,
  kind: incomeTypeId ? 'income' : 'spend',
  amountCents: cents,
  categoryId,
  incomeTypeId,
  incomeGroup,
  payeeId: null,
  payeeName: null,
});
const facts: ExplorerTemplateFacts = {
  asOf: '2024-03-05',
  currentMonth: '2024-03',
  firstMonth: '2024-01',
  lastFullMonth: '2024-02',
  categories: [
    {
      id: 'food',
      name: 'Lebensmittel',
      class: 'need',
      kind: 'variable',
      groupId: 'home',
      groupName: 'Haushalt',
    },
    {
      id: 'fun',
      name: 'Freizeit',
      class: 'want',
      kind: 'variable',
      groupId: 'life',
      groupName: 'Freizeit',
    },
    {
      id: 'saving',
      name: 'Rücklage',
      class: 'future',
      kind: 'invest',
      groupId: 'save',
      groupName: 'Zukunft',
    },
  ],
  incomeTypes: [
    { id: 'salary', name: 'Gehalt', role: 'income' },
    { id: 'capital', name: 'Kapitalerträge', role: 'capital' },
    { id: 'refund', name: 'Erstattungen', role: 'refund' },
  ],
  months: [
    {
      month: '2024-01',
      income: { salary: 10001, capital: 777 },
      spending: { food: 1001, fun: 501, saving: 2000 },
      assigned: { food: 1200 },
      netWorthCents: null,
      moneyAgeDays: null,
    },
    {
      month: '2024-02',
      income: { salary: 20002, capital: 888, refund: 50 },
      spending: { food: 2001, fun: 1000, saving: 3000 },
      assigned: { food: 2200 },
      netWorthCents: null,
      moneyAgeDays: null,
    },
    {
      month: '2024-03',
      income: { salary: 30003 },
      spending: { food: 700 },
      assigned: {},
      netWorthCents: null,
      moneyAgeDays: null,
    },
  ],
  splits: [
    source('income-jan', '2024-01-02', 10001, null, 'salary', 'household'),
    source('capital-jan', '2024-01-03', 777, null, 'capital', 'capital'),
    source('shared-cash-booking', '2024-01-04', 1001, 'food'),
    source('shared-cash-booking', '2024-01-04', 501, 'fun'),
    source('saving-budget-transfer', '2024-01-05', 2000, 'saving'),
    source('income-feb', '2024-02-02', 20002, null, 'salary', 'household'),
    source('capital-feb', '2024-02-03', 888, null, 'capital', 'capital'),
    source('uncategorised-refund', '2024-02-03', 50, null, 'refund', 'refund'),
    source('food-feb', '2024-02-04', 2002, 'food'),
    source('category-refund-feb', '2024-02-05', -1, 'food'),
    source('fun-feb', '2024-02-06', 1000, 'fun'),
    source('saving-feb', '2024-02-07', 3000, 'saving'),
    source('income-mar', '2024-03-02', 30003, null, 'salary', 'household'),
    source('food-mar', '2024-03-04', 700, 'food'),
  ],
};
const snapshot = (rows: ReturnType<typeof explorerTemplate>['rows'], keys: string[]) =>
  keys
    .map((key) => {
      const row = rows.find((candidate) => candidate.key === key)!;
      return `${key}:${row.vals.map((value) => (value === null ? 'missing' : value)).join(',')}`;
    })
    .join('|');

describe('owner625 templates over canonical report facts', () => {
  it('snapshots the exact12-month heatmap categories and net refund against the replaced analysis', () => {
    const model = explorerTemplate(facts, { id: 'heatmap', period: '1J' });
    expect(model.months).toEqual(['2024-01', '2024-02']);
    expect(snapshot(model.rows, ['cat:food', 'cat:fun'])).toMatchInlineSnapshot(
      '"cat:food:1001,2001|cat:fun:501,1000"',
    );
    expect(model.rows.map((row) => explorerTemplateSummaries(row).total)).toEqual([3002, 1501]);
    const old = analyseSpending({
      categories: facts.categories,
      spend: Object.fromEntries(facts.months.map((month) => [month.month, month.spending])),
      months: ['2024-01', '2024-02'],
      previousMonths: null,
      available: ['2024-01', '2024-02'],
    });
    expect(model.rows.map((row) => row.vals)).toEqual(old.heatRows.map((row) => row.values));
    expect(model.rows.some((row) => row.key === 'cat:saving')).toBe(false);
  });

  it('snapshots the selected year, preserves unavailable months and the replaced rounded means', () => {
    const model = explorerTemplate(facts, { id: 'year', period: 'YTD', year: 2024 });
    expect(model.months).toHaveLength(12);
    expect(snapshot(model.rows, ['cat:food'])).toMatchInlineSnapshot(
      '"cat:food:1001,2001,missing,missing,missing,missing,missing,missing,missing,missing,missing,missing"',
    );
    const food = model.rows.find((row) => row.key === 'cat:food')!;
    const fun = model.rows.find((row) => row.key === 'cat:fun')!;
    expect(explorerTemplateSummaries(food)).toEqual({ total: 3002, average: 1501 });
    expect(explorerTemplateSummaries(fun)).toEqual({ total: 1501, average: 751 });
    const old = buildTableRows(
      buildYearView(facts.months, 2024, facts.lastFullMonth).months,
      facts,
      true,
    );
    expect(model.rows).toEqual(old);
    expect(explorerTemplateYears(facts)).toEqual([2024]);
  });

  it('snapshots household/consumption/savings for the total table including the labelled current month', () => {
    const model = explorerTemplate(facts, { id: 'total', period: '3J' });
    expect(snapshot(model.rows, ['inc', 'cons', 'future', 'rest'])).toMatchInlineSnapshot(
      '"inc:10001,20002,30003|cons:1502,3001,700|future:2000,3000,0|rest:6499,14001,29303"',
    );
    expect(model.partialMonth).toBe('2024-03');
    expect(model.rows).toEqual(buildTableRows(facts.months, facts, true));
    expect(model.rows.find((row) => row.key === 'inc')!.vals).toEqual([10001, 20002, 30003]);
  });

  it('snapshots the one-category line and mean from the replaced category trend without plan contamination', () => {
    const model = explorerTemplate(facts, { id: 'category', period: '1J', categoryId: 'food' });
    expect(snapshot(model.rows, ['cat:food'])).toMatchInlineSnapshot('"cat:food:1001,2001"');
    expect(explorerTemplateSummaries(model.rows[0]!)).toEqual({ total: 3002, average: 1501 });
    expect(model.rows[0]!.vals).toEqual(
      categoryTrend(facts.months, 'food', ['2024-01', '2024-02']).map((point) => point.spentCents),
    );
    expect(model.categoryId).toBe('food');
  });

  it('opens split contributions, preserving refund signs and excluding other categories in the same booking', () => {
    const model = explorerTemplate(facts, { id: 'heatmap', period: '1J' });
    expect(explorerTemplateSources(facts, model, 'cat:food', '2024-01')).toEqual([
      { bookingId: 'shared-cash-booking', date: '2024-01-04', cents: 1001 },
    ]);
    expect(explorerTemplateSources(facts, model, 'cat:food', '2024-02')).toEqual([
      { bookingId: 'food-feb', date: '2024-02-04', cents: 2002 },
      { bookingId: 'category-refund-feb', date: '2024-02-05', cents: -1 },
    ]);
  });

  it('reconciles every clickable monetary cell/total across ALL4 templates with exact signed source contributions', () => {
    for (const id of ['heatmap', 'year', 'total', 'category'] as const) {
      const model = explorerTemplate(facts, {
        id,
        period: id === 'total' ? '3J' : '1J',
        year: 2024,
        categoryId: 'food',
      });
      for (const row of model.rows) {
        if (row.kind === 'pct') continue;
        for (const [index, amount] of row.vals.entries()) {
          const sources = explorerTemplateSources(facts, model, row.key, model.months[index]!);
          expect(
            sources.reduce((sum, source) => sum + source.cents, 0),
            `${id}/${row.key}/${index}`,
          ).toBe(amount ?? 0);
        }
        const total = explorerTemplateSummaries(row).total;
        expect(
          explorerTemplateSources(facts, model, row.key, 'summe').reduce(
            (sum, source) => sum + source.cents,
            0,
          ),
        ).toBe(total);
      }
    }
  });

  it('never opens current partial-year sources behind missing year cells or a full-year total', () => {
    const model = explorerTemplate(facts, { id: 'year', period: 'YTD', year: 2024 });
    expect(explorerTemplateSources(facts, model, 'cat:food', '2024-03')).toEqual([]);
    expect(
      explorerTemplateSources(facts, model, 'cat:food', 'summe').map((row) => row.bookingId),
    ).toEqual(['shared-cash-booking', 'food-feb', 'category-refund-feb']);
    expect(explorerTemplateSources(facts, model, 'sq', '2024-01')).toEqual([]);
    expect(explorerTemplateSources(facts, model, 'unknown', '2024-01')).toEqual([]);
  });

  it('keeps explicit current-month ranges, unknown categories and empty ledgers honest', () => {
    const selected = explorerTemplate(facts, {
      id: 'category',
      period: '2024-03..2024-03',
      categoryId: 'food',
    });
    expect(selected.rows[0]!.vals).toEqual([700]);
    expect(selected.partialMonth).toBe('2024-03');
    expect(
      explorerTemplate(facts, { id: 'category', period: '1J', categoryId: 'missing' }).rows,
    ).toEqual([]);
    expect(
      explorerTemplate({ ...facts, firstMonth: null }, { id: 'heatmap', period: '1J' }).rows,
    ).toEqual([]);
    expect(isExplorerTemplate('year')).toBe(true);
    expect(isExplorerTemplate('arbitrary')).toBe(false);
  });

  it('uses exactly12 heat months and36 total months when the ledger has a longer known history', () => {
    const long: ExplorerTemplateFacts = {
      ...facts,
      firstMonth: '2020-01',
      currentMonth: '2024-03',
      lastFullMonth: '2024-02',
      months: monthsBetween('2020-01', '2024-03').map((month) => ({
        month,
        income: {},
        spending: { food: 100 },
        assigned: {},
        netWorthCents: null,
        moneyAgeDays: null,
      })),
    };
    const heat = explorerTemplate(long, { id: 'heatmap', period: '1J' });
    expect(heat.months).toHaveLength(12);
    expect(heat.months[0]).toBe('2023-03');
    expect(heat.months.at(-1)).toBe('2024-02');
    expect(explorerTemplateSummaries(heat.rows[0]!).total).toBe(1200);
    const total = explorerTemplate(long, { id: 'total', period: '3J' });
    expect(total.months).toHaveLength(36);
    expect(total.months[0]).toBe('2021-04');
    expect(total.months.at(-1)).toBe('2024-03');
    expect(explorerTemplateSummaries(total.rows.find((row) => row.key === 'need')!).total).toBe(
      3600,
    );
  });
});
