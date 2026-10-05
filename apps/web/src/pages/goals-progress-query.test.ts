// @vitest-environment jsdom
import { createTestDatabase, createGoal, createBooking, setAssigned, schema } from '@budget/db';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { seedBasics, testCtx as ctx } from '../../../../packages/db/src/repos/test-helpers';
import { goalsProgressReportQuery } from './goals-progress-report';

describe('report reads the existing API month and figures without writes', () => {
  it('retains literal category/account values and reads metadata at the server month end', async () => {
    const opened = createTestDatabase();
    const db = opened.db;
    seedBasics(db);
    createGoal(
      db,
      { name: 'Reiseziel', targetCents: 300000, targetDate: '2027-07-31', categoryId: 'reise' },
      ctx,
    );
    setAssigned(db, 'reise', '2026-06', 10000, ctx);
    for (const m of ['2026-07', '2026-08', '2026-09']) setAssigned(db, 'reise', m, 25000, ctx);
    createGoal(
      db,
      { name: 'Reserve', targetCents: 100000, targetDate: '2027-03-31', accountId: 'spar' },
      ctx,
    );
    for (const date of ['2026-07-05', '2026-08-05', '2026-09-05'])
      createBooking(
        db,
        {
          accountId: 'spar',
          date,
          amountCents: 10000,
          splits: [{ categoryId: null, amountCents: 10000 }],
        },
        ctx,
      );
    const app = createLedgerApi({
      db,
      today: () => '2026-09-17',
      stepUp: async (_c, next) => next(),
    });
    const fetcher = vi.fn((path: string, init?: RequestInit) =>
      app.request(path.replace(/^\/api/, ''), init),
    );
    vi.stubGlobal('fetch', fetcher);
    const client = new QueryClient();
    const snapshot = () => ({
      goals: db.select().from(schema.savingsGoal).all(),
      bookings: db.select().from(schema.booking).all(),
      envelopes: db.select().from(schema.envelopeMonth).all(),
      audit: db.select().from(schema.auditLog).all(),
    });
    try {
      const before = snapshot();
      const data = await client.fetchQuery(goalsProgressReportQuery());
      expect(data.month).toBe('2026-09');
      expect(data.rows.find((r) => r.name === 'Reiseziel')?.progress).toMatchObject({
        savedCents: 85000,
        remainingCents: 215000,
        monthsLeft: 10,
        neededMonthlyCents: 21500,
        averageRateCents: 25000,
        forecastMonth: '2027-06',
        status: 'on_track',
      });
      expect(data.rows.find((r) => r.name === 'Reserve')?.progress).toMatchObject({
        savedCents: 30000,
        remainingCents: 70000,
        neededMonthlyCents: 11667,
        averageRateCents: 10000,
        forecastMonth: '2027-04',
        status: 'behind',
      });
      expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
        '/api/goals',
        '/api/categories',
        '/api/accounts?asOf=2026-09-30',
        '/api/goals/report',
      ]);
      expect(data.report.month).toBe('2026-09');
      expect(data.report.reserveCents).toBe(30000);
      expect(data.report.cash).toEqual([
        expect.objectContaining({
          id: 'spar',
          balanceCents: 30000,
          goal: 'Reserve',
          ambiguous: false,
        }),
      ]);
      expect(fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
      await client.fetchQuery(goalsProgressReportQuery());
      expect(snapshot()).toEqual(before);
      fetcher.mockImplementation((path, init) =>
        path === '/api/categories'
          ? Promise.resolve(new Response('{}', { status: 503 }))
          : app.request(path.replace(/^\/api/, ''), init),
      );
      await expect(client.fetchQuery(goalsProgressReportQuery())).rejects.toThrow();
      expect(snapshot()).toEqual(before);
    } finally {
      client.clear();
      opened.close();
      vi.unstubAllGlobals();
    }
  });
});
