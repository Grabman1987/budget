/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  accounts,
  categories,
  createBooking,
  createEntity,
  createTestDatabase,
  INCOME_TYPES,
  schema,
  type Db,
} from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-18';
const webDir = mkdtempSync(join(tmpdir(), 'budget-expected-skip-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;
let salaryId: string;

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

beforeEach(async () => {
  db = createTestDatabase().db;
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
  const ctx = { actor: 'tester' };
  accounts.create(
    db,
    {
      id: 'giro',
      name: 'Giro',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 200_000,
    },
    ctx,
  );
  createEntity(db, schema.categoryGroup, { id: 'g', name: 'Fixkosten' }, ctx);
  categories.create(db, { id: 'miete', name: 'Miete', groupId: 'g', class: 'need' }, ctx);
  const base = { accountId: 'giro', rhythm: 'monthly', validFrom: '2026-01-01' };
  salaryId = (
    await call('POST', '/expected', {
      ...base,
      name: 'Gehalt',
      kind: 'inflow',
      incomeTypeId: INCOME_TYPES.salary.id,
      dueDay: 15,
      amountCents: 300_000,
    })
  ).body.payment.id;
  await call('POST', '/expected', {
    ...base,
    name: 'Miete',
    kind: 'outflow',
    categoryId: 'miete',
    dueDay: 5,
    amountCents: 90_000,
  });
});

const aprilSalary = async () =>
  (
    await call(
      'GET',
      '/expected/occurrences?from=2026-04-01&to=2026-04-30&kind=inflow&includeSkipped=1',
    )
  ).body.occurrences[0];

describe('POST /expected/:id/skip and /expected/occurrences/:id/unskip', () => {
  it('moves the low point of the liquidity forecast, and unskip moves it back', async () => {
    const before = (await call('GET', '/liquidity?horizon=90d')).body.report;
    // Rent on 05.04. leaves 1.100,00 €; the salary of 15.04. lifts it; the May rent is covered.
    expect(before.low).toMatchObject({ day: '2026-04-05', cents: 110_000 });

    const skipped = await call('POST', `/expected/${salaryId}/skip`, { dueDate: '2026-04-15' });
    expect(skipped.status).toBe(200);
    expect(skipped.body.occurrence).toMatchObject({
      dueDate: '2026-04-15',
      status: 'skipped',
      expectedAmountCents: 300_000,
    });
    const after = (await call('GET', '/liquidity?horizon=90d')).body.report;
    // Without the April salary: 2.000 - 900 - 900 = 200,00 € after the May rent.
    expect(after.low).toMatchObject({ day: '2026-05-05', cents: 20_000 });
    expect(after.months.find((m: any) => m.month === '2026-04').incomeCents).toBe(0);
    expect(after.months.find((m: any) => m.month === '2026-05').incomeCents).toBe(300_000);
    // The movements keep the reference the UI needs to skip the next one.
    const may = after.movements.find((m: any) => m.month === '2026-05');
    expect(may.rows.find((r: any) => r.label === 'Gehalt')).toMatchObject({
      ref: { paymentId: salaryId, dueDate: '2026-05-15' },
    });

    // The rule is untouched and the plan view hides the skipped row unless asked.
    expect((await call('GET', '/expected')).body.payments[0]).toMatchObject({ dueDay: 15 });
    expect(
      (await call('GET', '/expected/occurrences?from=2026-04-01&to=2026-04-30&kind=inflow')).body
        .occurrences,
    ).toEqual([]);
    expect((await aprilSalary()).status).toBe('skipped');
    expect((await call('GET', '/expected/income?month=2026-04')).body.expectedCents).toBe(0);

    const back = await call('POST', `/expected/occurrences/${skipped.body.occurrence.id}/unskip`);
    expect(back.status).toBe(200);
    expect(back.body.occurrence.status).toBe('expected');
    expect((await call('GET', '/liquidity?horizon=90d')).body.report.low).toMatchObject({
      day: '2026-04-05',
      cents: 110_000,
    });
  });

  it('skips an occurrence that was never materialised', async () => {
    db.delete(schema.expectedOccurrence).run();
    const skipped = await call('POST', `/expected/${salaryId}/skip`, { dueDate: '2026-04-15' });
    expect(skipped.status).toBe(200);
    expect((await call('GET', '/liquidity?horizon=90d')).body.report.low).toMatchObject({
      day: '2026-05-05',
      cents: 20_000,
    });
  });

  it('answers 400 for a date that is no occurrence of the rule, 404 for an unknown payment', async () => {
    for (const dueDate of ['2026-04-14', '2031-04-15'])
      expect((await call('POST', `/expected/${salaryId}/skip`, { dueDate })).status).toBe(400);
    expect((await call('POST', `/expected/${salaryId}/skip`, { dueDate: 'bald' })).status).toBe(
      400,
    );
    expect((await call('POST', `/expected/${salaryId}/skip`, {})).status).toBe(400);
    expect(
      (await call('POST', '/expected/gibts-nicht/skip', { dueDate: '2026-04-15' })).status,
    ).toBe(404);
  });

  it('answers 409 for a linked occurrence and for unskipping one that is not skipped', async () => {
    const ctx = { actor: 'tester' };
    const booking = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-15',
        amountCents: 300_000,
        splits: [{ categoryId: null, amountCents: 300_000, incomeTypeId: INCOME_TYPES.salary.id }],
      },
      ctx,
    );
    const march = (
      await call('GET', '/expected/occurrences?from=2026-03-01&to=2026-03-31&kind=inflow')
    ).body.occurrences[0];
    expect(
      (
        await call('POST', `/expected/occurrences/${march.occurrenceId}/link`, {
          bookingId: booking,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('POST', `/expected/${salaryId}/skip`, { dueDate: '2026-03-15' })).status,
    ).toBe(409);
    expect((await call('POST', `/expected/occurrences/${march.occurrenceId}/unskip`)).status).toBe(
      409,
    );
    expect((await call('POST', '/expected/occurrences/gibts-nicht/unskip')).status).toBe(404);
  });

  it('a replacement income is booked normally and not linked to the skipped salary', async () => {
    const ctx = { actor: 'tester' };
    await call('POST', `/expected/${salaryId}/skip`, { dueDate: '2026-04-15' });
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-04-16',
        amountCents: 180_000,
        splits: [{ categoryId: null, amountCents: 180_000, incomeTypeId: INCOME_TYPES.salary.id }],
      },
      ctx,
    );
    const refreshed = await call('POST', '/expected/refresh');
    expect(refreshed.body.match).toMatchObject({ received: 0, deviating: 0 });
    const april = await aprilSalary();
    expect(april).toMatchObject({ status: 'skipped', bookingId: null });
  });
});
