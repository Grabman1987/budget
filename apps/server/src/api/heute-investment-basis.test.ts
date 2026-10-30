import { createTestDatabase, type freedomInvestmentBasis } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const day = '2026-09-17';
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: ReturnType<typeof createTestDatabase>;
let app: ReturnType<typeof createApp>;
let directory: string;
beforeEach(() => {
  opened = createTestDatabase();
  directory = mkdtempSync(join(tmpdir(), 'budget-t3-'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Synthetic T3</title>');
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents) VALUES
      ('budget','Synthetic budget','checking','budget',1,'2026-01-01',100000),
      ('positive','Selected positive','brokerage','investment',0,'2026-01-01',20000),
      ('negative','Selected negative','brokerage','investment',0,'2026-01-01',-3000),
      ('credit','Debt-role credit','checking','debt',0,'2026-01-01',500),
      ('loan','Synthetic loan','loan','debt',0,'2026-01-01',-7000);
  `);
  app = createApp({
    webDir: directory,
    auth: signedIn,
    ledger: { db: opened.db, today: () => day },
  });
});
afterEach(() => {
  opened.close();
  rmSync(directory, { recursive: true, force: true });
});

type HeuteWire = {
  investmentBasis: { asOf: string } & ReturnType<typeof freedomInvestmentBasis>;
  netWorth: unknown;
};

async function read(): Promise<HeuteWire> {
  const bytes = opened.sqlite.serialize();
  const writes = opened.sqlite.prepare('SELECT total_changes() AS n').get();
  const response = await app.request('/api/heute?period=month&month=2026-09');
  expect(response.status).toBe(200);
  const result = (await response.json()) as HeuteWire;
  expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
  expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(writes);
  return result;
}

it('F07 keeps selected signed basis separate from the unchanged positive-assets/net-debt chain', async () => {
  const result = await read();
  expect(result.investmentBasis).toMatchObject({ asOf: day, investedCents: 17_000 });
  expect(result.investmentBasis.accounts.map((row) => [row.id, row.valueCents]).sort()).toEqual([
    ['negative', -3_000],
    ['positive', 20_000],
  ]);
  expect(result.netWorth).toMatchObject({
    liquidCents: 100_000,
    investedCents: 20_000,
    receivableCents: 0,
    debtCents: -9_500,
    totalCents: 110_500,
    assetsCents: 120_500,
    liabilitiesCents: 10_000,
  });
});

it('uses explicit selected membership, retaining closed selected accounts without deleting or reclassifying them', async () => {
  opened.sqlite.exec(`
    UPDATE account SET allocation_scope='excluded' WHERE id='positive';
    UPDATE account SET closed_at='2026-09-01T00:00:00.000Z' WHERE id='negative';
    INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents,allocation_scope)
    VALUES ('savings','Selected savings','savings','budget',0,'2026-01-01',5000,'included');
  `);
  const result = await read();
  expect(result.investmentBasis.investedCents).toBe(2_000);
  expect(result.investmentBasis.accounts.map((row) => row.id).sort()).toEqual([
    'negative',
    'savings',
  ]);
});

it('selected missing FX is null with its actual source reason, never a zero contribution', async () => {
  opened.sqlite
    .exec(`INSERT INTO account (id,name,type,role,currency,on_budget,opening_date,opening_balance_cents,allocation_scope)
    VALUES ('fx','Selected USD','brokerage','investment','USD',0,'2026-01-01',333,'included');`);
  const result = await read();
  expect(result.investmentBasis.investedCents).toBeNull();
  expect(result.investmentBasis.accounts.find((row) => row.id === 'fx')).toMatchObject({
    valueCents: null,
    missingPrice: false,
    missingFxCurrencies: ['USD'],
  });
});

it('an unrelated off-budget excluded FX gap does not hide a healthy selected basis', async () => {
  opened.sqlite
    .exec(`INSERT INTO account (id,name,type,role,currency,on_budget,opening_date,opening_balance_cents,allocation_scope)
    VALUES ('fx','Excluded USD reserve','savings','reserve','USD',0,'2026-01-01',333,'excluded');`);
  const result = await read();
  expect(result.netWorth).toMatchObject({ unavailable: { reason: 'missing_fx' } });
  expect(result.investmentBasis).toMatchObject({ asOf: day, investedCents: 17_000 });
});

it('a missing selected security price remains an explained unavailable basis', async () => {
  opened.sqlite.exec(`
    INSERT INTO security (id,name,kind,currency) VALUES ('unpriced','Selected unpriced fund','etf','EUR');
    INSERT INTO holding (id,account_id,security_id,as_of,units_e8) VALUES ('h','positive','unpriced','2026-01-01',100000000);
  `);
  const result = await read();
  expect(result.investmentBasis.investedCents).toBeNull();
  expect(result.investmentBasis.accounts.find((row) => row.id === 'positive')).toMatchObject({
    valueCents: null,
    missingPrice: true,
  });
});

it('preserves literal zero and negative signed basis values', async () => {
  opened.sqlite.exec("UPDATE account SET opening_balance_cents=3000 WHERE id='positive'");
  expect((await read()).investmentBasis.investedCents).toBe(0);
  opened.sqlite.exec("UPDATE account SET opening_balance_cents=0 WHERE id='positive'");
  expect((await read()).investmentBasis.investedCents).toBe(-3_000);
});
