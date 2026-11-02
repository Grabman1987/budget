import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createLedgerApi } from './index';
import { createHash } from 'node:crypto';

let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
const path = '/budget/2026-10';
beforeEach(async () => {
  opened = createTestDatabase();
  opened.db
    .insert(schema.account)
    .values({
      id: 'funds',
      name: 'Synthetic funds',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-10-01',
      openingBalanceCents: 20_000,
    })
    .run();
  opened.db.insert(schema.categoryGroup).values({ id: 'group', name: 'Synthetic group' }).run();
  for (const id of ['first', 'second'])
    opened.db
      .insert(schema.category)
      .values({
        id,
        name: `Synthetic ${id}`,
        groupId: 'group',
        class: 'need',
        kind: 'variable',
        stage: 2,
      })
      .run();
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-15',
    stepUp: async (_c, next) => next(),
  });
  await put([{ categoryId: 'first', assignedCents: 1_000 }]);
  await send('PUT', '/categories/first/target', {
    validFrom: '2026-10',
    target: { kind: 'monthly', amountCents: 5_000 },
  });
});
afterEach(() => opened.close());

async function send(method: string, url: string, body?: unknown) {
  return app.request(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}
const view = async () => {
  const response = await send('GET', `${path}?previewBasis=1`);
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    previewBasis: string;
    summary: {
      toBeAssignedCents: number;
      envelopes: Array<{ categoryId: string; assignedCents: number; needCents: number }>;
    };
  }>;
};
const put = (items: Array<{ categoryId: string; assignedCents: number }>, expectedBasis?: string) =>
  send('PUT', `${path}/assigned`, { items, ...(expectedBasis && { expectedBasis }) });
const centsOf = async (id: string) =>
  (await view()).summary.envelopes.find((e) => e.categoryId === id)!.assignedCents;
const counts = () => ({
  changes: opened.sqlite.prepare('select total_changes() as n').get(),
  audits: opened.db.select().from(schema.auditLog).all().length,
  assignments: opened.db.select().from(schema.envelopeMonth).all(),
});

it('rejects stale A 1,000→5,000 after B commits 8,000, with no assignment or audit write', async () => {
  const a = await view();
  expect(await centsOf('first')).toBe(1_000);
  expect(a.summary.envelopes.find((e) => e.categoryId === 'first')!.needCents).toBe(4_000);
  expect((await put([{ categoryId: 'first', assignedCents: 8_000 }])).status).toBe(200);
  const before = counts();
  const stale = await put([{ categoryId: 'first', assignedCents: 5_000 }], a.previewBasis);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ error: 'plan_preview_changed' });
  expect(await centsOf('first')).toBe(8_000);
  expect(counts()).toEqual(before);
  // Deliberately editing an absolute value retains its existing behaviour.
  expect((await put([{ categoryId: 'first', assignedCents: 5_000 }])).status).toBe(200);
  expect(await centsOf('first')).toBe(5_000);
});

it.each(['target', 'funding', 'order', 'existence', 'month'] as const)(
  'rejects a changed %s basis atomically for the whole batch',
  async (change) => {
    const a = await view();
    if (change === 'target')
      await send('PUT', '/categories/first/target', {
        validFrom: '2026-10',
        target: { kind: 'monthly', amountCents: 6_000 },
      });
    if (change === 'funding')
      await send('POST', '/bookings', {
        type: 'booking',
        accountId: 'funds',
        date: '2026-10-03',
        amountCents: 123,
      });
    if (change === 'order') opened.db.update(schema.category).set({ sortOrder: 5 }).run();
    if (change === 'existence')
      opened.db
        .insert(schema.envelopeMonth)
        .values({
          categoryId: 'second',
          month: '2026-10',
          assignedCents: 0,
        })
        .run();
    const before = counts();
    const response = await send(
      'PUT',
      change === 'month' ? '/budget/2026-11/assigned' : `${path}/assigned`,
      {
        items: [
          { categoryId: 'second', assignedCents: 789 },
          { categoryId: 'first', assignedCents: 5_000 },
        ],
        expectedBasis: a.previewBasis,
      },
    );
    expect(response.status).toBe(409);
    expect(await centsOf('first')).toBe(1_000);
    expect(await centsOf('second')).toBe(0);
    expect(counts()).toEqual(before);
  },
);

it('applies a fresh batch once and one grouped Undo restores exact cents', async () => {
  const a = await view();
  const response = await put(
    [
      { categoryId: 'first', assignedCents: 5_000 },
      { categoryId: 'second', assignedCents: 789 },
    ],
    a.previewBasis,
  );
  expect(response.status).toBe(200);
  const result = (await response.json()) as { groupId: string };
  expect(await centsOf('first')).toBe(5_000);
  expect(await centsOf('second')).toBe(789);
  const committed = counts();
  expect(
    (
      await put(
        [
          { categoryId: 'first', assignedCents: 5_000 },
          { categoryId: 'second', assignedCents: 789 },
        ],
        a.previewBasis,
      )
    ).status,
  ).toBe(409);
  expect(counts()).toEqual(committed);
  expect((await send('POST', '/undo', { groupId: result.groupId })).status).toBe(200);
  expect(await centsOf('first')).toBe(1_000);
  expect(await centsOf('second')).toBe(0);
});

it('reading and cancelling a preview writes nothing; batch and single reads share the basis', async () => {
  const before = counts();
  const a = await view();
  const batch = (await (
    await send('GET', '/budget/months?months=2026-10,2026-11&previewBasis=1')
  ).json()) as {
    months: Record<string, { previewBasis: string }>;
  };
  expect(batch.months['2026-10']!.previewBasis).toBe(a.previewBasis);
  expect(counts()).toEqual(before);
});

it('keeps the existing funding guard and rolls a fresh but invalid batch back', async () => {
  const a = await view();
  const before = counts();
  const response = await put(
    [
      { categoryId: 'second', assignedCents: 1 },
      { categoryId: 'first', assignedCents: 20_001 },
    ],
    a.previewBasis,
  );
  expect(response.status).toBe(422);
  expect(counts()).toEqual(before);
});

it('guards the exact next-month close snapshot before grouped assignment or audit writes', async () => {
  const closeBasis = async () => {
    const response = await send('GET', '/month-close/2026-09');
    expect(response.status).toBe(200);
    const { sourceRevision, nextPlan } = (await response.json()) as {
      sourceRevision: string;
      nextPlan: unknown;
    };
    return createHash('sha256').update(JSON.stringify({ sourceRevision, nextPlan })).digest('hex');
  };
  const captured = await closeBasis();
  await put([{ categoryId: 'first', assignedCents: 8_000 }]);
  const before = counts();
  const stale = await send('PUT', `${path}/assigned`, {
    closeMonth: '2026-09',
    expectedCloseBasis: captured,
    items: [{ categoryId: 'first', assignedCents: 5_000 }],
  });
  expect(stale.status).toBe(409);
  expect(counts()).toEqual(before);
  expect(await centsOf('first')).toBe(8_000);
  const fresh = await send('PUT', `${path}/assigned`, {
    closeMonth: '2026-09',
    expectedCloseBasis: await closeBasis(),
    items: [
      { categoryId: 'first', assignedCents: 5_000 },
      { categoryId: 'second', assignedCents: 789 },
    ],
  });
  expect(fresh.status).toBe(200);
  const result = (await fresh.json()) as { groupId: string };
  expect((await send('POST', '/undo', { groupId: result.groupId })).status).toBe(200);
  expect(await centsOf('first')).toBe(8_000);
  expect(await centsOf('second')).toBe(0);
});
