/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect JSON boundary answers. */
import {
  createTestDatabase,
  createBooking,
  createEntity,
  allocationMonth,
  loadFacts,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import type { Hono } from 'hono';
import { monthHouseholdIncome, incomeExpenseSources } from '@budget/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLedgerApi } from './index';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
let opened: OpenedDatabase;
let app: Hono;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());
async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as any };
}
const outlay = (amountCents: number) =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-01',
      amountCents: -amountCents,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -amountCents }],
    },
    { actor: 'test' },
  );
describe('contacts API', () => {
  it('adopts synthetic contact credit into this month without moving cash, with undo and deletion', async () => {
    await call('POST', '/contacts/k1/settlements', {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 42765,
    });
    const balance = (await call('GET', '/accounts')).body.accounts.find(
      (a: any) => a.id === 'giro',
    ).balanceCents;
    const before = (await call('GET', '/budget/2026-09')).body.summary.toBeAssignedCents;
    const result = await call('POST', '/contacts/k1/write-offs', {
      accountId: 'giro',
      date: '2026-09-17',
      amountCents: 42765,
      memo: 'Synthetischer Ausgleich',
    });
    expect(result.status).toBe(201);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(0);
    expect(
      (await call('GET', '/accounts')).body.accounts.find((a: any) => a.id === 'giro').balanceCents,
    ).toBe(balance);
    expect((await call('GET', '/budget/2026-09')).body.summary.toBeAssignedCents).toBe(
      before + 42765,
    );
    const booking = (await call('GET', `/bookings/${result.body.bookingId}`)).body.booking;
    expect(booking).toMatchObject({ amountCents: 0, status: 'confirmed', incomeNextMonth: false });
    expect(booking.memo).toContain('Ausgleich Kontakt');
    expect(booking.splits).toMatchObject([
      { contactId: 'k1', categoryId: 'auslagen', amountCents: -42765 },
      { contactId: null, incomeTypeId: 'income-other', amountCents: 42765 },
    ]);
    const income = (await call('GET', '/reports/month/income?month=2026-09')).body;
    expect(income.income).toMatchObject({ earnedCents: 0, capitalCents: 0 });
    expect(income.contactWriteOffs).toMatchObject([
      { amountCents: 42765, incomeTypeId: 'income-other' },
    ]);
    const table = (await call('GET', '/report-tables/income-expense')).body;
    expect(table.incomeTypes).toContainEqual({
      id: 'contact-write-off',
      name: 'Sonstige Einnahmen · Ausgleich Kontakt (außerhalb Haushaltseinnahmen)',
      role: 'unclassified',
    });
    expect(
      monthHouseholdIncome(
        table.months.find((m: any) => m.month === '2026-09'),
        table,
      ),
    ).toBe(0);
    expect(
      incomeExpenseSources(table.splits, table, 'inc:contact-write-off', ['2026-09']),
    ).toMatchObject([{ bookingId: result.body.bookingId, amountCents: 42765 }]);
    expect(allocationMonth(opened.db, '2026-09').incomeCents).toBe(0);
    expect(loadFacts(opened.db, '2026-09-17').incomeSplits).toEqual([]);
    expect((await call('POST', '/undo', { groupId: result.body.groupId })).status).toBe(200);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(-42765);
    expect((await call('GET', '/budget/2026-09')).body.summary.toBeAssignedCents).toBe(before);
    const second = await call('POST', '/contacts/k1/write-offs', {
      accountId: 'giro',
      date: '2026-09-17',
      amountCents: 42765,
    });
    expect(second.status).toBe(201);
    expect((await call('DELETE', `/bookings/${second.body.bookingId}`)).status).toBe(200);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(-42765);
  });
  it('forgives partial debt as category activity and restores it with undo/redo', async () => {
    outlay(8400);
    const result = await call('POST', '/contacts/k1/write-offs', {
      accountId: 'giro',
      date: '2026-09-17',
      amountCents: 2300,
      categoryId: 'reise',
    });
    expect(result.status).toBe(201);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(6100);
    const plan = (await call('GET', '/budget/2026-09')).body;
    expect(plan.summary.envelopes.find((e: any) => e.categoryId === 'reise').activityCents).toBe(
      -2300,
    );
    const undone = await call('POST', '/undo', { groupId: result.body.groupId });
    expect(undone.status).toBe(200);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(8400);
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(6100);
  });
  it('rejects invalid, excessive, stale and wrong-counter write-offs atomically', async () => {
    outlay(8400);
    const body = { accountId: 'giro', date: '2026-09-17', amountCents: 8400, categoryId: 'reise' };
    const auditCount = opened.db.select().from(schema.auditLog).all().length;
    for (const patch of [
      { amountCents: 8401 },
      { categoryId: null },
      { categoryId: 'auslagen' },
      { accountId: 'usd' },
      { date: '2026-09-18' },
      { incomeTypeId: 'income-other' },
    ])
      expect((await call('POST', '/contacts/k1/write-offs', { ...body, ...patch })).status).toBe(
        422,
      );
    expect(
      (await call('POST', '/contacts/k1/write-offs', { ...body, amountCents: 1.5 })).status,
    ).toBe(400);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(8400);
    expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(auditCount);
    expect((await call('POST', '/contacts/k1/write-offs', body)).status).toBe(201);
    expect((await call('POST', '/contacts/k1/write-offs', body)).status).toBe(422);
  });
  it('supports partial credit and refuses capital income and non-budget accounts', async () => {
    await call('POST', '/contacts/k1/settlements', {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 8400,
    });
    const body = { accountId: 'giro', date: '2026-09-17', amountCents: 2300 };
    createEntity(
      opened.db,
      schema.account,
      {
        id: 'tracking',
        name: 'Sparen Muster',
        type: 'savings',
        role: 'reserve',
        onBudget: false,
        openingDate: '2026-09-01',
      },
      { actor: 'test' },
    );
    expect(
      (await call('POST', '/contacts/k1/write-offs', { ...body, accountId: 'tracking' })).status,
    ).toBe(422);
    expect(
      (await call('POST', '/contacts/k1/write-offs', { ...body, incomeTypeId: 'income-capital' }))
        .status,
    ).toBe(422);
    expect(
      (await call('POST', '/contacts/k1/write-offs', { ...body, categoryId: 'reise' })).status,
    ).toBe(422);
    const result = await call('POST', '/contacts/k1/write-offs', {
      ...body,
      incomeTypeId: 'income-gift',
    });
    expect(result.status).toBe(201);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(-6100);
  });
  it('keeps ordinary one-off income counted while cashless contact credit is separate', async () => {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-02',
        amountCents: 1600,
        splits: [{ incomeTypeId: 'income-other', amountCents: 1600 }],
      },
      { actor: 'test' },
    );
    await call('POST', '/contacts/k1/settlements', {
      accountId: 'giro',
      date: '2026-09-03',
      amountCents: 2300,
    });
    expect(
      (
        await call('POST', '/contacts/k1/write-offs', {
          accountId: 'giro',
          date: '2026-09-17',
          amountCents: 2300,
        })
      ).status,
    ).toBe(201);
    const report = (await call('GET', '/reports/month/income?month=2026-09')).body;
    expect(report.income.earnedCents).toBe(1600);
    expect(report.contactWriteOffs).toMatchObject([{ amountCents: 2300 }]);
    expect(allocationMonth(opened.db, '2026-09').incomeCents).toBe(1600);
    const table = (await call('GET', '/report-tables/income-expense')).body;
    expect(
      monthHouseholdIncome(
        table.months.find((m: any) => m.month === '2026-09'),
        table,
      ),
    ).toBe(1600);
  });
  it('removes deleted unallocated source rows from the report and restores them with undo', async () => {
    const id = outlay(3000);
    const removed = await call('DELETE', `/bookings/${id}`);
    expect(removed.status).toBe(200);
    expect((await call('GET', '/contacts/k1')).body.movements).toEqual([]);
    expect((await call('GET', '/contacts?history=1')).body.totals.balanceCents).toBe(0);
    expect((await call('POST', '/undo', { groupId: removed.body.groupId })).status).toBe(200);
    expect(
      (await call('GET', '/contacts/k1')).body.movements.map((m: any) => m.balanceCents),
    ).toEqual([3000]);
  });
  it('reports exact EUR cash/debt signs, running balances, pending metadata and undo', async () => {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-01',
        amountCents: -10000,
        status: 'pending',
        splits: [
          { categoryId: 'auslagen', contactId: 'k1', amountCents: -10000, memo: 'Anteil Haushalt' },
        ],
      },
      { actor: 'test' },
    );
    const receipt = await call('POST', '/contacts/k1/settlements', {
      accountId: 'giro',
      date: '2026-09-01',
      amountCents: 12000,
    });
    expect(receipt.status).toBe(201);
    const statement = (await call('GET', '/contacts/k1')).body;
    expect(statement).toMatchObject({ currency: 'EUR', balanceCents: -2000, creditCents: 2000 });
    expect(
      statement.movements.map((m: any) => [
        m.amountCents,
        m.contactDeltaCents,
        m.balanceCents,
        m.currency,
        m.status,
        m.accountId,
      ]),
    ).toEqual([
      [-10000, 10000, 10000, 'EUR', 'pending', 'giro'],
      [12000, -12000, -2000, 'EUR', 'confirmed', 'giro'],
    ]);
    expect(statement.movements[0].memo).toBe('Anteil Haushalt');
    expect((await call('GET', '/contacts?history=1')).body).toMatchObject({
      currency: 'EUR',
      totals: { receivableCents: 0, payableCents: 2000, balanceCents: -2000 },
    });
    expect((await call('GET', '/contacts/k1?asOf=2026-08-31')).body.movements).toEqual([]);
    const undone = await call('POST', '/undo', { groupId: receipt.body.groupId });
    expect(
      (await call('GET', '/contacts/k1')).body.movements.map((m: any) => m.balanceCents),
    ).toEqual([10000]);
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    expect(
      (await call('GET', '/contacts/k1')).body.movements.map((m: any) => m.balanceCents),
    ).toEqual([10000, -2000]);
  });
  it('retains balanced all-time history and excludes future movements until their date', async () => {
    const id = outlay(10000);
    await call('POST', '/contacts/k1/settlements', {
      accountId: 'giro',
      date: '2026-09-02',
      amountCents: 10000,
    });
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-10-01',
        amountCents: -5000,
        splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -5000 }],
      },
      { actor: 'test' },
    );
    expect((await call('GET', '/contacts')).body.contacts).toEqual([]);
    expect((await call('GET', '/contacts?history=1')).body.contacts).toHaveLength(1);
    const statement = (await call('GET', '/contacts/k1')).body;
    expect(statement.movements.map((m: any) => m.balanceCents)).toEqual([10000, 0]);
    expect(statement.movements[0].bookingId).toBe(id);
    expect((await call('GET', '/contacts/k1?asOf=2026-10-01')).body.balanceCents).toBe(5000);
    expect((await call('GET', '/contacts/missing')).status).toBe(404);
  });
  it('rejects the entire mixed-currency overview without a partial EUR total', async () => {
    outlay(10000);
    createEntity(
      opened.db,
      schema.contact,
      { id: 'foreign', name: 'Fremdwährung Kontakt' },
      { actor: 'test' },
    );
    createBooking(
      opened.db,
      {
        accountId: 'usd',
        date: '2026-09-01',
        amountCents: -5000,
        splits: [{ categoryId: 'auslagen', contactId: 'foreign', amountCents: -5000 }],
      },
      { actor: 'test' },
    );
    const result = await call('GET', '/contacts?history=1');
    expect(result.status).toBe(422);
    expect(result.body).not.toHaveProperty('totals');
    expect(result.body).not.toHaveProperty('contacts');
    expect((await call('GET', '/contacts/foreign')).status).toBe(422);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(10000);
  });
  it('keeps balanced contacts selectable, preserves excess and supports atomic undo/redo', async () => {
    expect((await call('GET', '/contacts')).body.contacts).toEqual([]);
    expect((await call('GET', '/contacts?history=1')).body.contacts).toHaveLength(1);
    outlay(10000);
    const result = await call('POST', '/contacts/k1/settlements', {
      accountId: 'giro',
      date: '2026-09-03',
      amountCents: 12000,
    });
    expect(result.status).toBe(201);
    expect(result.body.creditCents).toBe(2000);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(-2000);
    expect((await call('DELETE', `/bookings/${result.body.bookingId}`)).status).toBe(422);
    const undone = await call('POST', '/undo', { groupId: result.body.groupId });
    expect(undone.status).toBe(200);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(10000);
    expect((await call('POST', '/undo', { groupId: undone.body.groupId })).status).toBe(200);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(-2000);
  });
  it('validates actual positive EUR cash receipt and allocation at the server boundary', async () => {
    outlay(10000);
    const body = { accountId: 'giro', date: '2026-09-03', amountCents: 4000 };
    expect(
      (await call('POST', '/contacts/k1/settlements', { ...body, date: '2026-09-18' })).status,
    ).toBe(422);
    expect(
      (await call('POST', '/contacts/k1/settlements', { ...body, date: '2026-13-01' })).status,
    ).toBe(400);
    expect(
      (await call('POST', '/contacts/k1/settlements', { ...body, amountCents: 1.5 })).status,
    ).toBe(400);
    expect(
      (await call('POST', '/contacts/k1/settlements', { ...body, incomeTypeId: 'gift' })).status,
    ).toBe(400);
    expect(
      (await call('POST', '/contacts/k1/settlements', { ...body, accountId: 'usd' })).status,
    ).toBe(422);
    expect(
      (
        await call('POST', '/contacts/k1/settlements', {
          ...body,
          allocations: [{ outlaySplitId: 'missing', amountCents: 4000 }],
        })
      ).status,
    ).toBe(422);
    expect((await call('GET', '/contacts/k1')).body.balanceCents).toBe(10000);
  });
  it('creates retained contact identity and refuses undo while it has live movements', async () => {
    const c = await call('POST', '/contacts', { name: 'Kontakt Beispiel' });
    expect(c.status).toBe(201);
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-01',
        amountCents: -1000,
        splits: [{ categoryId: 'auslagen', contactId: c.body.contact.id, amountCents: -1000 }],
      },
      { actor: 'test' },
    );
    expect((await call('POST', '/undo', { groupId: c.body.groupId, force: true })).status).toBe(
      422,
    );
    expect((await call('GET', `/contacts/${c.body.contact.id}`)).body.balanceCents).toBe(1000);
    createEntity(
      opened.db,
      schema.contact,
      { id: 'other', name: 'Zweiter Kontakt' },
      { actor: 'test' },
    );
  });
});
