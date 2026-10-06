import { afterEach, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  createTestDatabase,
  accounts,
  categories,
  createEntity,
  createBooking,
  capturePlanSnapshot,
  schema,
  type PlanningAccuracyReport,
} from '@budget/db';
import { heuteRoutes } from './heute';
import { planningAccuracyRoutes } from './planning-accuracy';
import { errorResponse } from './http';

const opened = createTestDatabase();
afterEach(() => opened.close());
it('returns an honest empty history, validates the selected month and never writes on GET', async () => {
  const app = new Hono().route(
    '/',
    planningAccuracyRoutes(opened.db, () => '2026-10-06'),
  );
  app.onError(errorResponse);
  const response = await app.request('/?month=2026-09');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    month: '2026-09',
    months: [],
    categories: [],
    summary: { count: 0, hits: 0, meanAbsoluteBp: null },
    reliableFrom: '2026-12',
  });
  expect((await app.request('/?month=2026-13')).status).toBe(400);
  expect(opened.sqlite.prepare('SELECT count(*) AS n FROM plan_snapshot').get()).toEqual({ n: 0 });
  const ctx = { actor: 'tester' };
  accounts.create(
    opened.db,
    {
      id: 'cash',
      name: 'Synthetic cash',
      type: 'cash',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-07-01',
      openingBalanceCents: 100_000,
    },
    ctx,
  );
  createEntity(opened.db, schema.categoryGroup, { id: 'group', name: 'Synthetic group' }, ctx);
  categories.create(
    opened.db,
    { id: 'food', name: 'Synthetic food', class: 'need', groupId: 'group' },
    ctx,
  );
  for (const month of ['2026-07', '2026-08', '2026-09']) {
    opened.db
      .insert(schema.envelopeMonth)
      .values({ categoryId: 'food', month, assignedCents: 30_000 })
      .run();
    createBooking(
      opened.db,
      {
        accountId: 'cash',
        date: `${month}-10`,
        amountCents: -15_000,
        splits: [{ categoryId: 'food', amountCents: -15_000 }],
      },
      ctx,
    );
    capturePlanSnapshot(opened.db, month, `${month}-15`);
    createBooking(
      opened.db,
      {
        accountId: 'cash',
        date: `${month}-20`,
        amountCents: -15_000,
        splits: [{ categoryId: 'food', amountCents: -15_000 }],
      },
      ctx,
    );
  }
  const report = (await (await app.request('/?month=2026-09')).json()) as PlanningAccuracyReport;
  expect(report.summary).toEqual({ count: 3, hits: 3, meanAbsoluteBp: 222 });
  expect(report.months[0]).toMatchObject({
    month: '2026-07',
    projectedCents: 31_000,
    actualCents: 30_000,
    deviationCents: 1000,
    deviationBp: 333,
    hit: true,
  });
  expect(report.categories[0]).toMatchObject({
    categoryId: 'food',
    projectedCents: 30_000,
    actualCents: 30_000,
    deviationCents: 0,
    deviationBp: 0,
  });
  const home = new Hono().route(
    '/',
    heuteRoutes(opened.db, () => '2026-10-06'),
  );
  const answer = (await (await home.request('/')).json()) as {
    planningAccuracy: PlanningAccuracyReport['summary'];
  };
  expect(answer.planningAccuracy).toEqual(report.summary);
});
