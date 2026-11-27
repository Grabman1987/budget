/* eslint-disable @typescript-eslint/no-explicit-any -- Literal API boundary assertions. */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  opened.db
    .insert(schema.account)
    .values({
      id: 'depot',
      name: 'Testdepot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      currency: 'EUR',
      openingDate: '2026-01-01',
    })
    .run();
  opened.db
    .insert(schema.security)
    .values({ id: 'fund', name: 'Testfonds', kind: 'fund', currency: 'EUR' })
    .run();
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-03-10',
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
  return { status: response.status, body: (await response.json()) as any };
}
const base = {
  securityId: 'fund',
  accountId: 'depot',
  amountCents: 2500,
  validFrom: '2026-01-01',
};

describe('savings plan rhythm in the API', () => {
  it('keeps the monthly body unchanged and defaults the rhythm', async () => {
    const created = await call('POST', '/savings-plans', { ...base, dayOfMonth: 15 });
    expect(created.status).toBe(201);
    expect(created.body.plan).toMatchObject({
      cadence: 'monthly',
      dayOfMonth: 15,
      daysOfMonth: null,
      intervalWeeks: null,
    });
  });

  it('creates fixed-day and weekly plans and lists their executions', async () => {
    const days = await call('POST', '/savings-plans', {
      ...base,
      cadence: 'days',
      daysOfMonth: [2, 9, 16, 23],
    });
    expect(days.status).toBe(201);
    expect(days.body.plan).toMatchObject({ cadence: 'days', daysOfMonth: '2,9,16,23' });
    const executions = await call('GET', '/savings-plans/executions?month=2026-03');
    expect(executions.body.executions.map((e: any) => e.date)).toEqual([
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
    ]);
    const patched = await call('PATCH', `/savings-plans/${days.body.plan.id}`, {
      cadence: 'weeks',
      intervalWeeks: 2,
      from: '2026-04-01',
    });
    expect(patched.status).toBe(200);
    expect(patched.body.plan).toMatchObject({ cadence: 'weeks', intervalWeeks: 2 });
  });

  it('rejects incomplete or mixed rhythm fields', async () => {
    const bad: Record<string, unknown>[] = [
      { cadence: 'monthly' },
      { cadence: 'days' },
      { cadence: 'days', daysOfMonth: [9, 2] },
      { cadence: 'days', daysOfMonth: [2, 2] },
      { cadence: 'days', daysOfMonth: [0] },
      { cadence: 'days', daysOfMonth: [] },
      { cadence: 'weeks' },
      { cadence: 'weeks', intervalWeeks: 5 },
      { cadence: 'weeks', intervalWeeks: 0 },
      { cadence: 'weeks', intervalWeeks: 1, daysOfMonth: [2] },
      { cadence: 'yearly', dayOfMonth: 1 },
      { dayOfMonth: 1, intervalWeeks: 1 },
    ];
    for (const extra of bad)
      expect((await call('POST', '/savings-plans', { ...base, ...extra })).status).toBe(400);
    expect((await call('GET', '/savings-plans')).body.plans).toEqual([]);
  });
});
