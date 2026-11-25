import { addDays, daysBetween, liquidityForecast } from '@budget/domain';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { expectedOccurrence } from '../schema';
import { createBooking } from './bookings';
import { accounts, categories } from './entities';
import { createExpectedPayment, linkOccurrence } from './expected';
import { heute } from './heute';
import { liquidityReportView } from './liquidity-report';
import { forecastInputs, loadFacts } from './rule-inputs';
import { seedBasics, testCtx } from './test-helpers';
import { eq } from 'drizzle-orm';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());

it.each([
  ['2026-10-10', 94_000],
  ['2026-10-14', 96_000],
])('lead and no-inflow forecast agree on payday eve from %s', (today, expected) => {
  const db = opened.db;
  categories.create(
    db,
    { id: 'future', groupId: 'g', name: 'Synthetic future', class: 'future' },
    testCtx,
  );
  const payment = (
    id: string,
    day: string,
    amountCents: number,
    categoryId = 'miete',
    kind: 'inflow' | 'outflow' = 'outflow',
  ) =>
    createExpectedPayment(
      db,
      {
        id,
        name: id,
        accountId: 'giro',
        categoryId: kind === 'outflow' ? categoryId : null,
        kind,
        rhythm: 'monthly',
        endDate: day,
        startDate: day,
        dueDay: Number(day.slice(8)),
        dateWindowDays: 3,
      },
      { validFrom: '2026-10-01', amountCents },
      testCtx,
      today,
    );
  payment('overdue', addDays(today, -1), 1000);
  payment('future-class', today, 3000, 'future');
  payment('linked', today, 2000);
  payment('expected-inflow', addDays(today, 1), 5000, 'miete', 'inflow');
  const b = createBooking(
    db,
    {
      accountId: 'giro',
      date: addDays(today, 1),
      amountCents: -2000,
      splits: [{ categoryId: 'miete', amountCents: -2000 }],
    },
    testCtx,
  );
  const occurrence = db
    .select()
    .from(expectedOccurrence)
    .where(eq(expectedOccurrence.expectedPaymentId, 'linked'))
    .get()!;
  linkOccurrence(db, occurrence.id, b, testCtx);
  // Payday boundary: period month leads with Frei bis Monatsende (2026-11-25).
  const h = heute(db, { today, period: 'payday' });
  expect(h.lead.freeCents).toBe(expected);
  expect(h.lead.balanceCents).toBe(100_000);
  const f = forecastInputs(loadFacts(db, today), today, { byAccount: { giro: 100_000 } });
  const eve = addDays(h.stand.payday.day, -1);
  const forecast = liquidityForecast({
    ...f,
    days: daysBetween(today, eve),
    items: f.items.filter((i) => i.cents < 0),
    variablePerDay: () => 0,
  });
  expect(forecast.days.at(-1)?.balanceCents).toBe(expected);
  expect(h.lead.chain.map((t) => t.value)).toEqual(
    today === '2026-10-10' ? [100_000, 6000, 94_000] : [100_000, 4000, 96_000],
  );
});

it('shares the open, opened EUR budget-account scope across lead, overdraft and report', () => {
  const db = opened.db;
  for (const [id, changes] of [
    ['closed', { closedAt: '2026-10-01' }],
    ['unopened', { openingDate: '2026-11-01' }],
    ['foreign', { currency: 'USD', onBudget: false }],
    ['reserve', { role: 'reserve' as const }],
  ] as const) {
    accounts.create(
      db,
      {
        id,
        name: id,
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2023-10-01',
        openingBalanceCents: 12_345,
        overdraftLimitCents: 50_000,
        ...changes,
      },
      testCtx,
    );
  }
  const today = '2026-10-14';
  const h = heute(db, { today });
  expect(h.lead.items.accounts.map((a) => a.id)).toEqual(['giro']);
  expect(h.lead.balanceCents).toBe(100_000);
  expect(h.lead.lastResortCents).toBe(0);
  const f = forecastInputs(loadFacts(db, today), today, {
    byAccount: {
      giro: 100_000,
      closed: 12_345,
      unopened: 12_345,
      foreign: 12_345,
      reserve: 12_345,
    },
  });
  expect(f.startCents).toBe(100_000);
  expect(f.lastResortCents).toBe(0);
  expect(liquidityReportView(db, today, { horizon: '35d', levers: [] }).budgetAccounts).toEqual([
    { id: 'giro', name: 'Giro' },
  ]);
});

it('keeps every account valuation in the parts and distinguishes gross from net debt', () => {
  const db = opened.db;
  accounts.create(
    db,
    {
      id: 'roleless',
      name: 'Synthetic roleless',
      type: 'savings',
      onBudget: false,
      openingDate: '2023-10-01',
      openingBalanceCents: 1234,
      role: 'reserve',
    },
    testCtx,
  );
  accounts.create(
    db,
    {
      id: 'debt-credit',
      name: 'Synthetic debt credit',
      type: 'savings',
      role: 'debt',
      onBudget: false,
      openingDate: '2023-10-01',
      openingBalanceCents: 500,
    },
    testCtx,
  );
  accounts.create(
    db,
    {
      id: 'owed',
      name: 'Synthetic owed',
      type: 'checking',
      role: 'budget',
      onBudget: false,
      openingDate: '2023-10-01',
      openingBalanceCents: -2000,
    },
    testCtx,
  );
  const n = heute(db, { today: '2026-10-14' }).netWorth;
  if ('unavailable' in n) throw new Error('Synthetic valuation must be available');
  expect(n.totalCents).toBe(99_734);
  expect(n.liquidCents + n.investedCents + n.receivableCents + n.debtCents).toBe(99_734);
  expect(n.debtCents).toBe(-1500);
  expect(n.liabilitiesCents).toBe(2000);
});

it.each([
  ['2026-10-12', '2026-10-15', 100_000],
  ['2026-10-16', '2026-10-13', 98_000],
])('dates a linked future occurrence %s by its booking %s', (dueDate, settledOn, expected) => {
  const db = opened.db;
  const today = '2026-10-10';
  createExpectedPayment(
    db,
    {
      id: 'linked-future',
      name: 'Synthetic linked',
      accountId: 'giro',
      categoryId: 'miete',
      kind: 'outflow',
      rhythm: 'monthly',
      startDate: dueDate,
      endDate: dueDate,
      dueDay: Number(dueDate.slice(8)),
      dateWindowDays: 3,
    },
    { validFrom: '2026-10-01', amountCents: 2000 },
    testCtx,
    today,
  );
  const id = createBooking(
    db,
    {
      accountId: 'giro',
      date: settledOn,
      amountCents: -2000,
      splits: [{ categoryId: 'miete', amountCents: -2000 }],
    },
    testCtx,
  );
  const occurrence = db
    .select()
    .from(expectedOccurrence)
    .where(eq(expectedOccurrence.expectedPaymentId, 'linked-future'))
    .get()!;
  linkOccurrence(db, occurrence.id, id, testCtx);
  expect(heute(db, { today, period: 'payday' }).lead.freeCents).toBe(expected);
  const f = forecastInputs(loadFacts(db, today), today, { byAccount: { giro: 100_000 } });
  expect(
    liquidityForecast({ ...f, days: 4, variablePerDay: () => 0 }).days.at(-1)?.balanceCents,
  ).toBe(expected);
});
