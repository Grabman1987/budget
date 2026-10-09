/* eslint-disable @typescript-eslint/no-explicit-any -- API JSON answers are inspected, not typed */
import {
  accounts,
  createBooking,
  createTestDatabase,
  INCOME_TYPES,
  schema,
  type Db,
  undo,
} from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-18';
const webDir = mkdtempSync(join(tmpdir(), 'budget-income-pause-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let closeDb: (() => void) | null = null;
let app: ReturnType<typeof createApp>;

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const parsedBody = res.headers.get('content-type')?.includes('application/json')
    ? (JSON.parse(text) as any)
    : text;
  return { status: res.status, body: parsedBody };
}

beforeEach(() => {
  const opened = createTestDatabase();
  db = opened.db;
  closeDb = opened.close;
  accounts.create(
    db,
    {
      id: 'giro',
      name: 'Testkonto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 200_000,
    },
    { actor: 'tester' },
  );
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
});

afterEach(() => {
  closeDb?.();
  closeDb = null;
});

async function createSalary(extra: Record<string, unknown> = {}) {
  const result = await call('POST', '/expected', {
    name: 'Gehalt',
    kind: 'inflow',
    accountId: 'giro',
    incomeTypeId: INCOME_TYPES.salary.id,
    rhythm: 'monthly',
    dueDay: 1,
    dateShift: 'none',
    validFrom: '2026-01-01',
    amountCents: 300_000,
    ...extra,
  });
  expect(result.status).toBe(201);
  return result.body.payment.id as string;
}

describe('income pauses for one expected payment', () => {
  it('creates, lists, edits, deletes and restores a pause without rewriting the payment schedule', async () => {
    const sourceId = await createSalary();
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-01',
        amountCents: 300_000,
        splits: [{ incomeTypeId: INCOME_TYPES.salary.id, amountCents: 300_000 }],
      },
      { actor: 'tester' },
    );
    expect((await call('POST', '/expected/refresh')).status).toBe(200);

    const before = (await call('GET', '/expected/occurrences?from=2026-03-01&to=2026-08-01')).body
      .occurrences;
    expect(before.find((occurrence: any) => occurrence.dueDate === '2026-03-01')).toMatchObject({
      amountCents: 300_000,
      status: 'received',
    });
    const bookingsBefore = db.select().from(schema.booking).all();
    const occurrencesBefore = db.select().from(schema.expectedOccurrence).all();
    const plan = { sourceId, startDate: '2026-04-01', endDate: '2026-05-01' };

    const created = await call('POST', '/liquidity/income-pauses', plan);
    expect(created.status).toBe(201);
    expect(created.body.pause).toMatchObject(plan);
    expect(created.body.groupId).toEqual(expect.any(String));
    const pauseId = created.body.pause.id as string;
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toMatchObject([
      { id: pauseId, ...plan },
    ]);
    const createUndo = await call('POST', '/undo', { groupId: created.body.groupId });
    expect(createUndo.status).toBe(200);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toEqual([]);
    const createRedo = await call('POST', '/undo', { groupId: createUndo.body.groupId });
    expect(createRedo.status).toBe(200);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toMatchObject([
      { id: pauseId, ...plan },
    ]);

    const updated = await call('PATCH', `/liquidity/income-pauses/${pauseId}`, {
      startDate: '2026-05-01',
      endDate: '2026-06-01',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.pause).toMatchObject({
      id: pauseId,
      sourceId,
      startDate: '2026-05-01',
      endDate: '2026-06-01',
    });
    const updateUndo = await call('POST', '/undo', { groupId: updated.body.groupId });
    expect(updateUndo.status).toBe(200);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toMatchObject([
      { id: pauseId, startDate: '2026-04-01', endDate: '2026-05-01' },
    ]);
    const updateRedo = await call('POST', '/undo', { groupId: updateUndo.body.groupId });
    expect(updateRedo.status).toBe(200);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toMatchObject([
      { id: pauseId, startDate: '2026-05-01', endDate: '2026-06-01' },
    ]);

    const deleted = await call('DELETE', `/liquidity/income-pauses/${pauseId}`);
    expect(deleted.status).toBe(200);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toEqual([]);
    const restored = await call('POST', '/undo', { groupId: deleted.body.groupId });
    expect(restored.status).toBe(200);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toMatchObject([
      { id: pauseId, startDate: '2026-05-01', endDate: '2026-06-01' },
    ]);
    const redone = await call('POST', '/undo', { groupId: restored.body.groupId });
    expect(redone.status).toBe(200);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toEqual([]);

    expect(db.select().from(schema.booking).all()).toEqual(bookingsBefore);
    expect(db.select().from(schema.expectedOccurrence).all()).toEqual(occurrencesBefore);
    expect(
      (await call('GET', '/expected/occurrences?from=2026-03-01&to=2026-08-01')).body.occurrences,
    ).toEqual(before);
    expect(db.select().from(schema.plannedEvent).all()).toEqual([]);
  });

  it('rejects non-native or inactive inflows and outflows, and treats shared endpoints as overlap', async () => {
    const sourceId = await createSalary();
    const first = await call('POST', '/liquidity/income-pauses', {
      sourceId,
      startDate: '2026-04-01',
      endDate: '2026-05-01',
    });
    expect(first.status).toBe(201);

    const touching = await call('POST', '/liquidity/income-pauses', {
      sourceId,
      startDate: '2026-05-01',
      endDate: '2026-06-01',
    });
    expect(touching.status).toBe(409);

    const outflow = await call('POST', '/expected', {
      name: 'Miete',
      kind: 'outflow',
      accountId: 'giro',
      rhythm: 'monthly',
      dueDay: 1,
      validFrom: '2026-01-01',
      amountCents: 80_000,
    });
    expect(outflow.status).toBe(201);
    expect(
      (
        await call('POST', '/liquidity/income-pauses', {
          sourceId: outflow.body.payment.id,
          startDate: '2026-04-01',
          endDate: '2026-05-01',
        })
      ).status,
    ).toBe(422);

    const foreign = await createSalary({ name: 'USD salary', currency: 'USD' });
    expect(
      (
        await call('POST', '/liquidity/income-pauses', {
          sourceId: foreign,
          startDate: '2026-04-01',
          endDate: '2026-05-01',
        })
      ).status,
    ).toBe(422);

    const deleted = await createSalary({ name: 'Deleted salary' });
    const attachedPause = await call('POST', '/liquidity/income-pauses', {
      sourceId: deleted,
      startDate: '2026-07-01',
      endDate: '2026-08-01',
    });
    expect(attachedPause.status).toBe(201);
    const sourceDeleted = await call('DELETE', `/expected/${deleted}`);
    expect(sourceDeleted.status).toBe(200);
    expect(
      (await call('GET', '/liquidity/income-pauses')).body.pauses.find(
        (pause: any) => pause.id === attachedPause.body.pause.id,
      ),
    ).toMatchObject({ id: attachedPause.body.pause.id, sourceId: deleted });
    expect(
      (
        await call('POST', '/liquidity/income-pauses', {
          sourceId: deleted,
          startDate: '2026-04-01',
          endDate: '2026-05-01',
        })
      ).status,
    ).toBe(404);
    const sourceUndo = await call('POST', '/undo', { groupId: sourceDeleted.body.groupId });
    expect(sourceUndo.status).toBe(200);
    expect(
      (await call('GET', '/expected')).body.payments.find((payment: any) => payment.id === deleted),
    ).toMatchObject({ id: deleted, name: 'Deleted salary' });
    expect(
      (await call('GET', '/liquidity/income-pauses')).body.pauses.find(
        (pause: any) => pause.id === attachedPause.body.pause.id,
      ),
    ).toMatchObject({ id: attachedPause.body.pause.id, sourceId: deleted });
  });

  it('keeps the normal expected-income report stable before and after occurrence refresh', async () => {
    const sourceId = await createSalary({ dueDay: 25 });
    // Model a not-yet-materialised source; creation normally plans its future occurrences.
    db.delete(schema.expectedOccurrence).run();
    const plan = { sourceId, startDate: '2026-03-25', endDate: '2026-03-25' };
    const before = (await call('GET', '/reports/month/income?month=2026-03')).body;
    expect(before.expectedMaterialised).toBe(false);
    expect(before.expected.pendingCents).toBe(300_000);

    const pause = await call('POST', '/liquidity/income-pauses', plan);
    expect(pause.status).toBe(201);
    const forecast = (await call('GET', '/liquidity?horizon=6m')).body.report;
    expect(forecast.months.find((month: any) => month.month === '2026-03').incomeCents).toBe(0);
    const beforeRefresh = (await call('GET', '/reports/month/income?month=2026-03')).body;
    expect(beforeRefresh.expectedMaterialised).toBe(false);
    expect(beforeRefresh.expected.pendingCents).toBe(300_000);

    expect((await call('POST', '/expected/refresh')).status).toBe(200);
    const after = (await call('GET', '/reports/month/income?month=2026-03')).body;
    expect(after.expectedMaterialised).toBe(true);
    expect(after.expected.pendingCents).toBe(300_000);
  });

  it('moves a pause to another eligible source, audits the source change, and rejects a foreign source', async () => {
    const firstSourceId = await createSalary();
    const secondSourceId = await createSalary({
      name: 'Nebeneinkünfte',
      incomeTypeId: INCOME_TYPES.side.id,
      amountCents: 220_000,
    });
    const created = await call('POST', '/liquidity/income-pauses', {
      sourceId: firstSourceId,
      startDate: '2026-04-01',
      endDate: '2026-04-01',
    });
    expect(created.status).toBe(201);
    const pauseId = created.body.pause.id as string;
    const sourcePause = await call('POST', '/liquidity/income-pauses', {
      sourceId: secondSourceId,
      startDate: '2026-07-01',
      endDate: '2026-07-01',
    });
    expect(sourcePause.status).toBe(201);
    const auditBeforeOverlap = db.select().from(schema.auditLog).all();
    const overlappingMove = await call('PATCH', `/liquidity/income-pauses/${pauseId}`, {
      sourceId: secondSourceId,
      startDate: '2026-07-01',
      endDate: '2026-07-01',
    });
    expect(overlappingMove.status).toBe(409);
    expect(db.select().from(schema.auditLog).all()).toEqual(auditBeforeOverlap);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toMatchObject([
      { id: pauseId, sourceId: firstSourceId, startDate: '2026-04-01' },
      { id: sourcePause.body.pause.id, sourceId: secondSourceId, startDate: '2026-07-01' },
    ]);

    const moved = await call('PATCH', `/liquidity/income-pauses/${pauseId}`, {
      sourceId: secondSourceId,
    });
    expect(moved.status).toBe(200);
    expect(moved.body.pause).toMatchObject({ id: pauseId, sourceId: secondSourceId });
    let forecast = (await call('GET', '/liquidity?horizon=6m')).body.report;
    expect(forecast.months.find((month: any) => month.month === '2026-04').incomeCents).toBe(
      300_000,
    );

    const undo = await call('POST', '/undo', { groupId: moved.body.groupId });
    expect(undo.status).toBe(200);
    expect(
      (await call('GET', '/liquidity/income-pauses')).body.pauses.find(
        (pause: any) => pause.id === pauseId,
      ),
    ).toMatchObject({ id: pauseId, sourceId: firstSourceId });
    forecast = (await call('GET', '/liquidity?horizon=6m')).body.report;
    expect(forecast.months.find((month: any) => month.month === '2026-04').incomeCents).toBe(
      220_000,
    );

    const redo = await call('POST', '/undo', { groupId: undo.body.groupId });
    expect(redo.status).toBe(200);
    expect(
      (await call('GET', '/liquidity/income-pauses')).body.pauses.find(
        (pause: any) => pause.id === pauseId,
      ),
    ).toMatchObject({ id: pauseId, sourceId: secondSourceId });
    forecast = (await call('GET', '/liquidity?horizon=6m')).body.report;
    expect(forecast.months.find((month: any) => month.month === '2026-04').incomeCents).toBe(
      300_000,
    );

    const foreignSourceId = await createSalary({ name: 'USD side income', currency: 'USD' });
    const pausesBefore = (await call('GET', '/liquidity/income-pauses')).body.pauses;
    const auditBefore = db.select().from(schema.auditLog).all();
    const invalid = await call('PATCH', `/liquidity/income-pauses/${pauseId}`, {
      sourceId: foreignSourceId,
    });
    expect(invalid.status).toBe(422);
    const unsupportedPatch = await call('PATCH', `/liquidity/income-pauses/${pauseId}`, {
      replacementAmountCents: 125_000,
    });
    expect(unsupportedPatch.status).toBe(422);
    expect(unsupportedPatch.body.message).toContain('nicht zulässig');
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toEqual(pausesBefore);
    expect(db.select().from(schema.auditLog).all()).toEqual(auditBefore);
  });

  it('rejects unsupported replacement amounts without creating a pause', async () => {
    const sourceId = await createSalary();
    const before = db.select().from(schema.incomePause).all();
    const response = await call('POST', '/liquidity/income-pauses', {
      sourceId,
      startDate: '2026-04-01',
      endDate: '2026-04-01',
      replacementAmountCents: 125_000,
    });
    expect(response.status).toBe(422);
    expect(db.select().from(schema.incomePause).all()).toEqual(before);
  });

  it('zeros only covered scheduled months while keeping current salary and payday markers', async () => {
    const sourceId = await createSalary();
    const beforeToday = (await call('GET', '/heute')).body;
    const beforeLiquidity = (await call('GET', '/liquidity?horizon=6m')).body.report;
    const priorMonth = beforeLiquidity.months.find((month: any) => month.month === '2026-04');
    const coveredMonth = beforeLiquidity.months.find((month: any) => month.month === '2026-05');
    const resumedMonth = beforeLiquidity.months.find((month: any) => month.month === '2026-06');
    expect(priorMonth.incomeCents).toBe(300_000);
    expect(coveredMonth.incomeCents).toBe(300_000);
    expect(resumedMonth.incomeCents).toBe(300_000);

    const paused = await call('POST', '/liquidity/income-pauses', {
      sourceId,
      startDate: '2026-05-01',
      endDate: '2026-05-01',
    });
    expect(paused.status).toBe(201);

    const afterToday = (await call('GET', '/heute')).body;
    expect(afterToday.balance.salary).toEqual(beforeToday.balance.salary);
    expect(afterToday.stand.payday).toEqual(beforeToday.stand.payday);
    const afterLiquidity = (await call('GET', '/liquidity?horizon=6m')).body.report;
    expect(afterLiquidity.months.find((month: any) => month.month === '2026-04').incomeCents).toBe(
      300_000,
    );
    expect(afterLiquidity.months.find((month: any) => month.month === '2026-05').incomeCents).toBe(
      0,
    );
    expect(afterLiquidity.months.find((month: any) => month.month === '2026-06').incomeCents).toBe(
      300_000,
    );
  });

  it('omits a salary marker when the next scheduled receipt is paused, without moving payday', async () => {
    const sourceId = await createSalary();
    const before = (await call('GET', '/heute')).body;
    expect(before.balance.salary).toEqual({ day: '2026-04-01', cents: 300_000 });
    const payday = before.stand.payday;

    const paused = await call('POST', '/liquidity/income-pauses', {
      sourceId,
      startDate: '2026-04-01',
      endDate: '2026-04-01',
    });
    expect(paused.status).toBe(201);

    const after = (await call('GET', '/heute')).body;
    expect(after.balance.salary).toBeNull();
    expect(after.stand.payday).toEqual(payday);
  });

  it('pauses a recurring EUR inflow with a non-salary income type', async () => {
    const sourceId = await createSalary({
      name: 'Nebeneinkünfte',
      incomeTypeId: INCOME_TYPES.side.id,
    });
    const before = (await call('GET', '/liquidity?horizon=6m')).body.report;
    expect(before.months.find((month: any) => month.month === '2026-05').incomeCents).toBe(300_000);

    const paused = await call('POST', '/liquidity/income-pauses', {
      sourceId,
      startDate: '2026-05-01',
      endDate: '2026-05-01',
    });
    expect(paused.status).toBe(201);

    const after = (await call('GET', '/liquidity?horizon=6m')).body.report;
    expect(after.months.find((month: any) => month.month === '2026-04').incomeCents).toBe(300_000);
    expect(after.months.find((month: any) => month.month === '2026-05').incomeCents).toBe(0);
    expect(after.months.find((month: any) => month.month === '2026-06').incomeCents).toBe(300_000);
  });

  it('rejects undo that would overlap a later pause, including forced undo, atomically', async () => {
    const sourceId = await createSalary();
    const first = await call('POST', '/liquidity/income-pauses', {
      sourceId,
      startDate: '2026-04-01',
      endDate: '2026-05-01',
    });
    expect(first.status).toBe(201);
    const pauseId = first.body.pause.id as string;
    const moved = await call('PATCH', `/liquidity/income-pauses/${pauseId}`, {
      startDate: '2026-06-01',
      endDate: '2026-07-01',
    });
    expect(moved.status).toBe(200);

    const reverted = await call('POST', '/undo', { groupId: moved.body.groupId });
    expect(reverted.status).toBe(200);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toMatchObject([
      { id: pauseId, startDate: '2026-04-01', endDate: '2026-05-01' },
    ]);
    const redone = await call('POST', '/undo', { groupId: reverted.body.groupId });
    expect(redone.status).toBe(200);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toMatchObject([
      { id: pauseId, startDate: '2026-06-01', endDate: '2026-07-01' },
    ]);

    const second = await call('POST', '/liquidity/income-pauses', {
      sourceId,
      startDate: '2026-04-01',
      endDate: '2026-05-01',
    });
    expect(second.status).toBe(201);
    const pausesBefore = (await call('GET', '/liquidity/income-pauses')).body.pauses;
    const auditBefore = db.select().from(schema.auditLog).all();
    const bookingsBefore = db.select().from(schema.booking).all();
    const occurrencesBefore = db.select().from(schema.expectedOccurrence).all();
    const forecastBefore = (await call('GET', '/liquidity?horizon=6m')).body.report;

    const normalUndo = await call('POST', '/undo', { groupId: redone.body.groupId });
    expect(normalUndo.status).toBe(409);
    expect(normalUndo.body.error).toBe('undo_refused');
    expect(normalUndo.body.message).toMatch(/overlap|überlapp/i);
    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toEqual(pausesBefore);
    expect(db.select().from(schema.auditLog).all()).toEqual(auditBefore);
    expect(db.select().from(schema.booking).all()).toEqual(bookingsBefore);
    expect(db.select().from(schema.expectedOccurrence).all()).toEqual(occurrencesBefore);
    expect((await call('GET', '/liquidity?horizon=6m')).body.report).toEqual(forecastBefore);

    // Forced undo is an internal recovery path, not an option exposed by the HTTP endpoint.
    expect(() =>
      undo(db, { groupId: moved.body.groupId }, { actor: 'tester' }, { force: true }),
    ).toThrow(/overlap|überlapp/i);

    expect((await call('GET', '/liquidity/income-pauses')).body.pauses).toEqual(pausesBefore);
    expect(db.select().from(schema.auditLog).all()).toEqual(auditBefore);
    expect(db.select().from(schema.booking).all()).toEqual(bookingsBefore);
    expect(db.select().from(schema.expectedOccurrence).all()).toEqual(occurrencesBefore);
    expect((await call('GET', '/liquidity?horizon=6m')).body.report).toEqual(forecastBefore);
  });

  it('keeps a USD version inside a pause after converting its effective native amount to EUR', async () => {
    const sourceId = await createSalary();
    const paused = await call('POST', '/liquidity/income-pauses', {
      sourceId,
      startDate: '2026-04-01',
      endDate: '2026-06-01',
    });
    expect(paused.status).toBe(201);

    const version = await call('POST', `/expected/${sourceId}/versions`, {
      validFrom: '2026-06-01',
      amountCents: 200_000,
      currency: 'USD',
    });
    expect(version.status).toBe(201);
    expect(version.body.version).toMatchObject({
      validFrom: '2026-06-01',
      amountCents: 200_000,
      currency: 'USD',
    });
    db.insert(schema.fxRate)
      .values({
        currency: 'USD',
        date: TODAY,
        rateMicro: 1_500_000,
        source: 'synthetic',
      })
      .run();

    const view = (await call('GET', '/liquidity?horizon=6m')).body;
    const report = view.report;
    expect(report.months.find((month: any) => month.month === '2026-04').incomeCents).toBe(0);
    expect(report.months.find((month: any) => month.month === '2026-05').incomeCents).toBe(0);
    // 200,000 USD cents × 1.5 EUR/USD = 300,000 EUR cents. The source ID is unchanged,
    // but the effective native-currency version is foreign and therefore outside this pause.
    expect(report.months.find((month: any) => month.month === '2026-06').incomeCents).toBe(300_000);
    expect(report.months.find((month: any) => month.month === '2026-07').incomeCents).toBe(300_000);
    expect(view.incomePauses.find((pause: any) => pause.sourceId === sourceId)).toMatchObject({
      coverage: 'applied',
      suppressedOccurrences: [
        { dueDate: '2026-04-01', amountCents: 300_000 },
        { dueDate: '2026-05-01', amountCents: 300_000 },
      ],
      unchangedOccurrences: [
        {
          dueDate: '2026-06-01',
          currency: 'USD',
          reason: 'foreign_currency',
          amountCents: null,
        },
      ],
    });
  });

  it('reports a scheduled zero-EUR receipt as unchanged rather than as an amount paused', async () => {
    const sourceId = await createSalary();
    // A zero amount cannot be entered through the positive-amount API, so seed the read-model edge
    // directly to ensure it is disclosed as unchanged instead of a receipt that the pause removed.
    db.insert(schema.expectedPaymentVersion)
      .values({
        id: `zero-version-${sourceId}`,
        expectedPaymentId: sourceId,
        validFrom: '2026-04-01',
        amountCents: 0,
        currency: 'EUR',
      })
      .run();
    const paused = await call('POST', '/liquidity/income-pauses', {
      sourceId,
      startDate: '2026-04-01',
      endDate: '2026-04-01',
    });
    expect(paused.status).toBe(201);

    const view = (await call('GET', '/liquidity?horizon=6m')).body;
    expect(view.report.months.find((month: any) => month.month === '2026-04').incomeCents).toBe(0);
    expect(view.incomePauses).toMatchObject([
      {
        sourceId,
        coverage: 'zero_amount',
        suppressedOccurrences: [],
        unchangedOccurrences: [
          {
            dueDate: '2026-04-01',
            currency: 'EUR',
            reason: 'zero_amount',
            amountCents: 0,
          },
        ],
      },
    ]);
  });
});
