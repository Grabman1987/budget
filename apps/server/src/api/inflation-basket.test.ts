import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  createBooking,
  createEntity,
  categories,
  schema,
  type OpenedDatabase,
  type InflationReport,
} from '@budget/db';
import { monthsBetween } from '@budget/domain';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

describe('inflation basket owner settings (synthetic)', () => {
  let opened: OpenedDatabase;
  beforeEach(() => {
    opened = createTestDatabase();
    seedBasics(opened.db);
    categories.update(opened.db, 'miete', { kind: 'fixed' }, { actor: 'test' });
    categories.update(opened.db, 'reise', { kind: 'fixed' }, { actor: 'test' });
    createEntity(opened.db, schema.payee, { id: 'p2', name: 'Beitrag' }, { actor: 'test' });
  });
  afterEach(() => opened.close());
  const api = () =>
    createLedgerApi({
      db: opened.db,
      today: () => '2025-11-01',
      stepUp: async (_c, next) => next(),
    });
  const charge = (date: string, categoryId: string, payeeId: string, cents: number) =>
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date,
        payeeId,
        amountCents: -cents,
        splits: [{ categoryId, amountCents: -cents }],
      },
      { actor: 'test' },
    );
  const report = async () =>
    (await api().request('/reports/spending/inflation')).json() as Promise<InflationReport>;
  const save = (changes: unknown[]) =>
    api().request('/inflation-basket', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    });

  it('keeps want out by default, includes Always, and undoes the audited settings', async () => {
    for (const m of monthsBetween('2023-10', '2025-10')) {
      charge(`${m}-03`, 'miete', 'p1', 10000);
      charge(`${m}-04`, 'reise', 'p2', m < '2025-01' ? 1000 : 7000);
      charge(`${m}-05`, 'reise', 'p1', 500);
    }
    const before = await report();
    expect(before.contributions.map((c: { id: string }) => c.id)).toEqual(['miete']);
    expect(before.inflationBp).toBe(0);
    const response = await save([{ categoryId: 'reise', inclusion: 'always' }]);
    expect(response.status).toBe(200);
    const { groupId } = (await response.json()) as { groupId: string };
    const after = await report();
    expect(after.contributions.map((c: { id: string }) => c.id)).toContain('reise');
    expect(after.inflationBp).toBeGreaterThan(0);
    expect(after.hasOverrides).toBe(true);
    const settings = (await (await api().request('/inflation-basket')).json()) as {
      categories: InflationReport['basketSettings'];
    };
    expect(settings.categories.find((c: { id: string }) => c.id === 'reise')).toMatchObject({
      inclusion: 'always',
    });
    expect(
      (
        await api().request('/undo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId }),
        })
      ).status,
    ).toBe(200);
    expect((await report()).inflationBp).toBe(0);
  });

  it('includes a future category only by explicit choice', async () => {
    categories.update(opened.db, 'reise', { class: 'future' }, { actor: 'test' });
    for (const m of monthsBetween('2023-10', '2025-10')) charge(`${m}-03`, 'reise', 'p1', 1000);
    expect((await report()).basket).toEqual([]);
    expect((await save([{ categoryId: 'reise', inclusion: 'always' }])).status).toBe(200);
    expect((await report()).basket[0]).toMatchObject({ categoryId: 'reise', class: 'future' });
  });

  it('recognizes a yearly insurance and counts the second charge price step', async () => {
    categories.update(opened.db, 'miete', { kind: 'periodic' }, { actor: 'test' });
    charge('2023-10-03', 'miete', 'p1', 12000);
    charge('2024-10-03', 'miete', 'p1', 14400);
    const result = await report();
    expect(result.basket).toHaveLength(1);
    expect(result.basket[0]!).toMatchObject({
      baseCents: 1000,
      nowCents: 1200,
      source: 'bookings',
    });
    expect(result.points.find((p: { month: string }) => p.month === '2024-09')!.index).toBe(100);
    expect(result.points.find((p: { month: string }) => p.month === '2024-10')!.index).toBe(120);
  });

  it.each([false, true])(
    'removes an excluded payee from prices and weights (trailing=%s)',
    async (trailing) => {
      for (const m of monthsBetween('2023-10', '2025-10')) {
        charge(`${m}-03`, 'miete', 'p1', 1200);
        charge(`${m}-04`, 'miete', 'p2', m < '2025-01' ? 600 : 6000);
      }
      expect((await report()).inflationBp).toBeGreaterThan(0);
      const response = await save([
        { categoryId: 'miete', excludedPayeeIds: ['p2'], trailingMean: trailing },
      ]);
      expect(response.status).toBe(200);
      const result = await report();
      expect(result.inflationBp).toBe(0);
      expect(result.basket).toHaveLength(1);
      expect(result.basket[0]!.nowCents).toBe(1200);
      expect(result.basket[0]!.baseCents).toBe(1200);
      const settings = (await (await api().request('/inflation-basket')).json()) as {
        categories: InflationReport['basketSettings'];
      };
      expect(settings.categories.find((c: { id: string }) => c.id === 'miete')).toMatchObject({
        trailingMean: trailing,
        excludedPayeeIds: ['p2'],
      });
      expect(
        (await save([{ categoryId: 'miete', trailingMean: null, excludedPayeeIds: [] }])).status,
      ).toBe(200);
      expect((await report()).hasOverrides).toBe(false);
      expect((await report()).inflationBp).toBeGreaterThan(0);
    },
  );

  it('validates input and rolls a bulk change back if any category is missing', async () => {
    expect((await save([{ categoryId: 'miete', inclusion: 'guess' }])).status).toBe(400);
    const count = opened.db.select().from(schema.auditLog).all().length;
    expect(
      (
        await save([
          { categoryId: 'miete', inclusion: 'never', trailingMean: true },
          { categoryId: 'missing', inclusion: 'always' },
        ])
      ).status,
    ).toBe(404);
    expect(opened.db.select().from(schema.auditLog).all()).toHaveLength(count);
    expect(opened.db.select().from(schema.appSetting).all()).toEqual([]);
    expect(categories.get(opened.db, 'miete')?.inflationTrailingMean).toBeNull();
  });
});
