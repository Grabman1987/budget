import {
  createTestDatabase,
  portfolioSummary,
  schema,
  type CostsTaxesReport,
  type Db,
} from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-costs-taxes-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
let db: Db;
let close: () => void;
let signedIn: boolean;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  ({ db, close } = createTestDatabase());
  seedDatabase(db);
  signedIn = true;
  const auth: AuthGate = {
    requireSession: async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)),
    originGuard: async (_c, next) => next(),
    requireStepUp: async (_c, next) => next(),
    routes: new Hono(),
  };
  app = createApp({ webDir, auth, ledger: { db, today: () => TODAY } });
});
afterEach(() => close());

const get = (path: string) => app.request(`/api${path}`);
const read = async () =>
  ((await (await get('/portfolio/costs-taxes')).json()) as { costs: CostsTaxesReport }).costs;

it('serves costs, taxes and income of the sample ledger equal to the portfolio summary', async () => {
  const response = await get('/portfolio/costs-taxes');
  expect(response.status).toBe(200);
  const { costs } = (await response.json()) as { costs: CostsTaxesReport };
  const summary = portfolioSummary(db, { today: TODAY });
  expect(costs.costs.totalCents).toBe(summary.costs.totalCents);
  expect(costs.costs.costRateBp).toBe(summary.costs.costRateBp);
  expect(costs.net.grossCents).toBe(summary.income.grossCents);
  expect(costs.taxes.onIncomeCents).toBe(summary.income.taxCents);
  expect(costs.valueCents).toBe(summary.valueCents);
  expect(costs.products.length).toBeGreaterThanOrEqual(5);
  expect(costs.latent.rateBp).toBe(2_750);
  expect(costs.net.netCents).toBe(
    costs.net.grossCents - costs.net.taxOnIncomeCents - costs.net.costsCents,
  );
});

it('reports the broker tax of a booked dividend as booked, not as a rate of the gross amount', async () => {
  const before = await read();
  const security = db.select().from(schema.security).all()[0]!;
  const accountRow = db
    .select()
    .from(schema.account)
    .all()
    .find((a) => a.role === 'investment')!;
  db.insert(schema.trade)
    .values({
      id: 'probe-dividend',
      securityId: security.id,
      accountId: accountRow.id,
      date: '2026-09-10',
      kind: 'dividend',
      unitsE8: 0,
      amountCents: 10_000,
      feeCents: 0,
      taxCents: 1_234,
      importKey: 'probe-dividend',
    })
    .run();
  const after = await read();
  expect(after.income.dividend.grossCents).toBe(before.income.dividend.grossCents + 10_000);
  expect(after.taxes.dividendCents).toBe(before.taxes.dividendCents + 1_234);
});

it('needs a session', async () => {
  signedIn = false;
  expect((await get('/portfolio/costs-taxes')).status).toBe(401);
});
