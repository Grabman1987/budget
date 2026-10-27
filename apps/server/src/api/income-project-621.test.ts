import {
  accounts, categories, cashflowReport, createBooking, createEntity, createTestDatabase,
  createTransfer, incomeExpenseReport, INCOME_TYPES, monthIncomeReport, schema, undo,
  updateBooking, type OpenedDatabase,
} from '@budget/db';
import { incomeExpenseNet } from '@budget/domain';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

const ctx = { actor: 'synthetic-621' };
const today = '2026-09-17';
let opened: OpenedDatabase;
let app: Hono;
let salaryA: string;
const cashPath = '/cashflow?period=2026-08..2026-08';
const incomePath = '/reports/month/income?month=2026-08';
const tablePath = '/report-tables/income-expense';
const scope = (path: string, id: string) => `${path}${path.includes('?') ? '&' : '?'}projectId=${encodeURIComponent(id)}`;

beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  for (const id of ['a', 'b', 'empty'])
    createEntity(opened.db, schema.project, { id, name: id === 'empty' ? 'Synthetic empty' : 'Synthetic same name' }, ctx);
  accounts.create(opened.db, { id: 'depot', name: 'Synthetic depot', type: 'brokerage', role: 'investment', onBudget: false, openingDate: '2023-10-01' }, ctx);
  categories.create(opened.db, { id: 'etf', name: 'Synthetic future', groupId: 'g', class: 'future' }, ctx);
  const book = (projectId: string, amountCents: number, split: { categoryId?: string; incomeTypeId?: string }, accountId = 'giro') =>
    createBooking(opened.db, { accountId, projectId, date: '2026-08-15', amountCents, splits: [{ ...split, amountCents }] }, ctx);
  salaryA = book('a', 100001, { incomeTypeId: INCOME_TYPES.salary.id });
  book('b', 200002, { incomeTypeId: INCOME_TYPES.salary.id });
  book('a', -10000, { categoryId: 'miete' });
  book('a', 500, { categoryId: 'miete' });
  book('a', -3000, { categoryId: 'etf' });
  book('b', -20000, { categoryId: 'reise' });
  book('a', 700, { incomeTypeId: INCOME_TYPES.capital.id });
  book('a', 1300, { incomeTypeId: INCOME_TYPES.capital.id }, 'depot');
  app = createLedgerApi({ db: opened.db, today: () => today, stepUp: async (_c, next) => next() });
});
afterEach(() => opened.close());
async function read<T>(path: string): Promise<T> {
  const response = await app.request(path);
  expect(response.status).toBe(200);
  return await response.json() as T;
}
type Cash = ReturnType<typeof cashflowReport>;
type Income = ReturnType<typeof monthIncomeReport>;
type Tables = ReturnType<typeof incomeExpenseReport>;

it('retains every no-filter legacy payload and independently reconciles each distinct August view to cents', async () => {
  const changes = opened.sqlite.prepare('SELECT total_changes() AS n').get();
  const income = await read<Income>(incomePath);
  const cash = await read<Cash>(cashPath);
  const table = await read<Tables>(tablePath);
  expect(income).toEqual(monthIncomeReport(opened.db, today, '2026-08'));
  expect(cash).toEqual(cashflowReport(opened.db, today, '2026-08..2026-08'));
  expect(table).toEqual(incomeExpenseReport(opened.db, today));
  expect(income.income).toMatchObject({ earnedCents: 300003, capitalCents: 700 });
  expect(cash.totals).toMatchObject({ incomeCents: 300003, consumptionCents: 29500, netCents: 270503, futureCents: 3000, capitalCents: 2000 });
  expect(incomeExpenseNet(table.months.find((month) => month.month === '2026-08')!, table)).toBe(267503);
  expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
});

it('scopes all three original readers by project ID, nets refunds once and labels unsupported measures unavailable', async () => {
  for (const [id, earned, consumption, future, cashNet, tableNet, capital] of [
    ['a', 100001, 9500, 3000, 90501, 87501, 2000],
    ['b', 200002, 20000, 0, 180002, 180002, 0],
  ] as const) {
    const income = await read<Income>(scope(incomePath, id));
    const cash = await read<Cash>(scope(cashPath, id));
    const table = await read<Tables>(scope(tablePath, id));
    expect(income).toMatchObject({ project: { id, name: 'Synthetic same name' }, asOf: '2026-08-31', income: { earnedCents: earned }, expected: null, expectedMaterialised: null, foreignCurrencyCount: null, expectedUnavailable: 'not_project_attributed' });
    expect(cash).toMatchObject({ project: { id }, asOf: '2026-09-17', totals: { incomeCents: earned, consumptionCents: consumption, futureCents: future, netCents: cashNet, capitalCents: capital } });
    expect(table).toMatchObject({ project: { id }, asOf: '2026-09-17', unavailable: ['assigned', 'moneyAgeDays', 'netWorthCents', 'targets'] });
    const august = table.months.find((month) => month.month === '2026-08')!;
    expect(incomeExpenseNet(august, table)).toBe(tableNet);
    expect(august).not.toHaveProperty('assigned');
    expect(table).not.toHaveProperty('targets');
    expect(table).not.toHaveProperty('netWorth');
    expect(table.splits.every((split) => split.bookingId && opened.db.select().from(schema.booking).where(eq(schema.booking.id, split.bookingId)).get()?.projectId === id)).toBe(true);
  }
});

it('classifies neutral transfer partners before scope, even when their project attribution differs', async () => {
  const transfer = createTransfer(opened.db, { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-08-20', amountCents: 32100, projectId: 'a' }, ctx);
  updateBooking(opened.db, transfer.toBookingId, { projectId: 'b' }, ctx);
  expect((await read<Cash>(scope(cashPath, 'a'))).totals).toMatchObject({ incomeCents: 100001, consumptionCents: 9500, netCents: 90501 });
  expect((await read<Cash>(scope(cashPath, 'b'))).totals).toMatchObject({ incomeCents: 200002, consumptionCents: 20000, netCents: 180002 });
  for (const id of ['a', 'b']) {
    const table = await read<Tables>(scope(tablePath, id));
    expect(table.splits.map((split) => split.bookingId)).not.toContain(transfer.fromBookingId);
    expect(table.splits.map((split) => split.bookingId)).not.toContain(transfer.toBookingId);
  }
});

it('rereads attribution after the existing metadata writer and one Undo without changing global cents', async () => {
  updateBooking(opened.db, salaryA, { projectId: 'b' }, { ...ctx, groupId: 'synthetic-reassign' });
  expect((await read<Income>(scope(incomePath, 'a'))).income.earnedCents).toBe(0);
  expect((await read<Income>(scope(incomePath, 'b'))).income.earnedCents).toBe(300003);
  expect((await read<Income>(incomePath)).income.earnedCents).toBe(300003);
  undo(opened.db, { groupId: 'synthetic-reassign' }, ctx);
  expect((await read<Income>(scope(incomePath, 'a'))).income.earnedCents).toBe(100001);
  expect((await read<Income>(scope(incomePath, 'b'))).income.earnedCents).toBe(200002);
});

it('distinguishes empty, archived, deleted and malformed projects instead of falling back to global results', async () => {
  for (const path of [cashPath, incomePath, tablePath]) {
    expect((await app.request(scope(path, 'missing'))).status).toBe(404);
    expect((await app.request(scope(path, ''))).status).toBe(400);
    expect((await app.request(scope(path, 'x'.repeat(65)))).status).toBe(400);
  }
  expect((await read<Cash>(scope(cashPath, 'empty'))).totals).toMatchObject({ incomeCents: 0, consumptionCents: 0, netCents: 0, capitalCents: 0 });
  opened.db.update(schema.project).set({ archivedAt: '2026-09-01' }).where(eq(schema.project.id, 'b')).run();
  expect(await read<Income>(scope(incomePath, 'b'))).toMatchObject({ project: { id: 'b', archived: true }, income: { earnedCents: 200002 } });
  opened.db.update(schema.project).set({ deletedAt: '2026-09-02' }).where(eq(schema.project.id, 'b')).run();
  for (const path of [cashPath, incomePath, tablePath]) expect((await app.request(scope(path, 'b'))).status).toBe(404);
});
