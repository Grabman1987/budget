import { createTestDatabase, schema, type planMonthViews } from '@budget/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-case-001-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
// Authentication is covered separately; exercise the real API handlers and repositories here.
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

describe('WP-001 / CASE-001 API reference evidence', () => {
  it.each(['opening envelope', 'October to November rollover'] as const)(
    '%s: reconciles carry, assignment, spending and undo to literal cents',
    async (source) => {
      const { account } = await request<AccountResponse>(
        'POST',
        '/accounts',
        {
          name: 'Synthetic CASE-001 account',
          type: 'checking',
          openingDate: '2023-10-01',
          openingBalanceCents: 100_000,
        },
        201,
      );
      const { group } = await request<{ group: { id: string } }>(
        'POST',
        '/categories/groups',
        { name: 'Synthetic CASE-001 group' },
        201,
      );
      const { category } = await request<{ category: { id: string } }>(
        'POST',
        '/categories',
        { name: 'Synthetic CASE-001 category', groupId: group.id, class: 'need' },
        201,
      );
      const month = source === 'opening envelope' ? '2023-10' : '2023-11';
      if (source === 'opening envelope') {
        // Opening migration data has no public write API; only this fixture uses direct DB setup.
        opened.db
          .update(schema.category)
          .set({ openingAvailableCents: 4_000 })
          .where(eq(schema.category.id, category.id))
          .run();
      } else {
        await request('PUT', '/budget/2023-10/assigned', {
          items: [{ categoryId: category.id, assignedCents: 4_000 }],
        });
        const october = await request<BudgetView>('GET', '/budget/2023-10');
        expect(october.summary.envelopes).toEqual([
          expect.objectContaining({
            categoryId: category.id,
            carryCents: 0,
            assignedCents: 4_000,
            activityCents: 0,
            availableCents: 4_000,
          }),
        ]);
      }

      const state = async () => {
        const { summary } = await request<BudgetView>('GET', `/budget/${month}`);
        const balance = await request<AccountResponse>(
          'GET',
          `/accounts/${account.id}?asOf=${month}-30`,
        );
        expect(summary.envelopes).toHaveLength(1);
        return {
          balanceCents: balance.account.balanceCents,
          toBeAssignedCents: summary.toBeAssignedCents,
          envelope: summary.envelopes[0],
        };
      };
      const initial = {
        balanceCents: 100_000,
        toBeAssignedCents: 96_000,
        envelope: {
          categoryId: category.id,
          carryCents: 4_000,
          assignedCents: 0,
          activityCents: 0,
          availableCents: 4_000,
          overspentCents: 0,
        },
      };
      expect(await state()).toMatchObject(initial);
      const spending = await request(
        'POST',
        '/bookings',
        {
          type: 'booking',
          accountId: account.id,
          date: `${month}-10`,
          amountCents: -2_501,
          categoryId: category.id,
          status: 'confirmed',
        },
        201,
      );
      // Independent oracle: 100,000 - 2,501 = 97,499 cash; 4,000 - 2,501 = 1,499 reserved.
      // Unassigned stays 96,000 because the expense consumes already reserved money.
      const spent = {
        balanceCents: 97_499,
        toBeAssignedCents: 96_000,
        envelope: { ...initial.envelope, activityCents: -2_501, availableCents: 1_499 },
      };
      expect(await state()).toMatchObject(spent);
      const assignment = await request('PUT', `/budget/${month}/assigned`, {
        items: [{ categoryId: category.id, assignedCents: 10_000 }],
      });
      // 4,000 + 10,000 - 2,501 = 11,499; 96,000 - 10,000 = 86,000 unassigned.
      // Assignment changes the envelope/funding pool, never account cash.
      expect(await state()).toMatchObject({
        balanceCents: 97_499,
        toBeAssignedCents: 86_000,
        envelope: { ...spent.envelope, assignedCents: 10_000, availableCents: 11_499 },
      });

      await request('POST', '/undo', { groupId: assignment.groupId });
      expect(await state()).toMatchObject(spent);
      await request('POST', '/undo', { groupId: spending.groupId });
      expect(await state()).toMatchObject(initial);
    },
  );
});
