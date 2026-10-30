import { createTestDatabase, type FreedomView, type PortfolioAllocationView } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';
import {
  freedomUniverseFixture615,
  FREEDOM_DAY_615 as day,
  FREEDOM_HISTORY_615 as historical,
} from '../../../../packages/db/src/repos/freedom-universe-fixture-615';

const webDir = mkdtempSync(join(tmpdir(), 'budget-freedom-615-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Synthetic Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: ReturnType<typeof createTestDatabase>;
let app: ReturnType<typeof createApp>;
let asOf: string;
beforeEach(() => {
  opened = createTestDatabase();
  freedomUniverseFixture615(opened);
  asOf = day;
  app = createApp({ webDir, auth: signedIn, ledger: { db: opened.db, today: () => asOf } });
});
afterEach(() => opened.close());
afterAll(() => rmSync(webDir, { recursive: true, force: true }));
const call = (method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });

async function expectReads(valueCents: number, progressBp: number) {
  for (const date of [day, historical]) {
    asOf = date;
    const before = opened.sqlite.prepare('SELECT total_changes() AS n').get();
    const bytes = opened.sqlite.serialize();
    for (let repeat = 0; repeat < 2; repeat++) {
      const freedom = await call('GET', '/wealth/freedom');
      const allocation = await call('GET', '/portfolio/allocation');
      const rules = await call('GET', '/rules');
      const heute = await call('GET', '/heute');
      expect(heute.status).toBe(200);
      expect(await heute.json()).toMatchObject({
        investmentBasis: { asOf: date, investedCents: valueCents },
      });
      expect([freedom.status, allocation.status, rules.status]).toEqual([200, 200, 200]);
      expect((await freedom.json()) as FreedomView).toMatchObject({
        asOf: date,
        investedCents: valueCents,
        annualSpendCents: 1200,
        targetCents: 30000,
      });
      expect((await allocation.json()) as PortfolioAllocationView).toMatchObject({ valueCents });
      const body = (await rules.json()) as {
        rules: {
          code: string;
          latest: { detail: { progressBp: number; targetCents: number } } | null;
        }[];
      };
      expect(body.rules.find((row) => row.code === 'R16')?.latest?.detail).toMatchObject({
        progressBp,
        targetCents: 30000,
      });
    }
    expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(before);
    expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
  }
  asOf = day;
  const check = await call('GET', '/rules/check');
  expect(check.status).toBe(200);
  // Scope selection never changes global net worth:155,000 opening cents −400 spending cents.
  expect(await check.json()).toMatchObject({ netWorthCents: 154600 });
}

it('shares current and historical exact cents through real scope-save, stale409 and grouped undo endpoints', async () => {
  await expectReads(25000, 8333);
  const beforeBookings = opened.sqlite.prepare('SELECT * FROM booking ORDER BY id').all();
  const body = {
    validFrom: day,
    targets: [{ assetClassId: 'basis', targetShareBp: 10000 }],
    allocationAccounts: [
      {
        id: 'excluded',
        included: true,
        cashClassId: null,
        expectedScope: 'excluded',
        expectedCashClassId: null,
      },
    ],
  };
  const saved = await call('PUT', '/asset-classes/targets', body);
  expect(saved.status).toBe(200);
  const { groupId } = (await saved.json()) as { groupId: string };
  await expectReads(55000, 18333);
  const beforeConflict = opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all();
  expect((await call('PUT', '/asset-classes/targets', body)).status).toBe(409);
  expect(opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY rowid').all()).toEqual(
    beforeConflict,
  );
  await expectReads(55000, 18333);
  expect((await call('POST', '/undo', { groupId })).status).toBe(200);
  await expectReads(25000, 8333);
  expect(opened.sqlite.prepare('SELECT * FROM booking ORDER BY id').all()).toEqual(beforeBookings);
});
