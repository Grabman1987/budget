import { createTestDatabase, type planMonthViews } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-case-002-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
// Auth is independently covered; these tests exercise real financial API mutations and reads.
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: ReturnType<typeof createTestDatabase>;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  app = createApp({
    webDir,
    auth: signedIn,
    ledger: { db: opened.db, today: () => '2023-11-30' },
  });
});
afterEach(() => opened.close());
afterAll(() => rmSync(webDir, { recursive: true, force: true }));

type BudgetView = ReturnType<typeof planMonthViews>[string];
type AccountResponse = { account: { id: string; balanceCents: number } };
async function request<T = { groupId: string }>(
  method: string,
  path: string,
  body?: unknown,
  status = 200,
) {
  const response = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const result = (await response.json()) as T;
  expect(response.status, JSON.stringify(result)).toBe(status);
  return result;
}

describe('WP-001 / CASE-002 cash overspending API evidence', () => {
  it.each([
    { rolloverOverspending: false, carry: 0, free: 97_500, uncovered: 2_500, overspent: 0 },
    { rolloverOverspending: true, carry: -2_500, free: 100_000, uncovered: 0, overspent: 2_500 },
  ])(
    'rolloverOverspending=$rolloverOverspending preserves exact cents through undo',
    async (expected) => {
      const { account } = await request<AccountResponse>(
        'POST',
        '/accounts',
        {
          name: 'Synthetic CASE-002 account',
          type: 'checking',
          openingDate: '2023-10-01',
          openingBalanceCents: 100_000,
        },
        201,
      );
      const { group } = await request<{ group: { id: string } }>(
        'POST',
        '/categories/groups',
        { name: 'Synthetic CASE-002 group' },
        201,
      );
      const { category } = await request<{ category: { id: string } }>(
        'POST',
        '/categories',
        {
          name: 'Synthetic CASE-002 category',
          groupId: group.id,
          class: 'need',
          rolloverOverspending: expected.rolloverOverspending,
        },
        201,
      );
      const state = async (month: string, lastDay: string) => {
        const { summary } = await request<BudgetView>('GET', `/budget/${month}`);
        const balance = await request<AccountResponse>(
          'GET',
          `/accounts/${account.id}?asOf=${lastDay}`,
        );
        expect(summary.envelopes).toHaveLength(1);
        return {
          balanceCents: balance.account.balanceCents,
          toBeAssignedCents: summary.toBeAssignedCents,
          uncoveredCents: summary.uncoveredCents,
          creditOverspentCents: summary.creditOverspentCents,
          envelope: summary.envelopes[0],
        };
      };
      const initial = {
        balanceCents: 100_000,
        toBeAssignedCents: 100_000,
        uncoveredCents: 0,
        creditOverspentCents: 0,
        envelope: {
          categoryId: category.id,
          carryCents: 0,
          assignedCents: 0,
          activityCents: 0,
          availableCents: 0,
          overspentCents: 0,
          cashOverspentCents: 0,
          creditOverspentCents: 0,
        },
      };
      expect(await state('2023-10', '2023-10-31')).toMatchObject(initial);
      expect(await state('2023-11', '2023-11-30')).toMatchObject(initial);
      const expense = await request(
        'POST',
        '/bookings',
        {
          type: 'booking',
          accountId: account.id,
          date: '2023-10-31',
          amountCents: -2_500,
          categoryId: category.id,
          status: 'confirmed',
        },
        201,
      );
      // Spending reduces cash by 2,500; the negative envelope keeps October's obligation visible.
      expect(await state('2023-10', '2023-10-31')).toMatchObject({
        ...initial,
        balanceCents: 97_500,
        envelope: {
          ...initial.envelope,
          activityCents: -2_500,
          availableCents: -2_500,
          overspentCents: 2_500,
          cashOverspentCents: 2_500,
        },
      });
      // Disabled: free funds 100,000 -> 97,500 once. Enabled: -2,500 remains in the envelope.
      expect(await state('2023-11', '2023-11-30')).toMatchObject({
        ...initial,
        balanceCents: 97_500,
        toBeAssignedCents: expected.free,
        uncoveredCents: expected.uncovered,
        envelope: {
          ...initial.envelope,
          carryCents: expected.carry,
          availableCents: expected.carry,
          overspentCents: expected.overspent,
          cashOverspentCents: expected.overspent,
        },
      });
      await request('POST', '/undo', { groupId: expense.groupId });
      expect(await state('2023-10', '2023-10-31')).toMatchObject(initial);
      expect(await state('2023-11', '2023-11-30')).toMatchObject(initial);
    },
  );
});
