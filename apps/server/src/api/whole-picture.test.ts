import { createTestDatabase, type WholePicture, type OnePager } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-whole-picture-'));
writeFileSync(join(webDir, 'index.html'), '<title>Budget</title>');
const auth: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: ReturnType<typeof createTestDatabase>;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  opened.sqlite.exec(`
    INSERT OR IGNORE INTO income_type (id,name) VALUES ('income-salary','Gehalt'),('income-side','Nebeneinkünfte'),('income-capital','Kapitalerträge'),('income-refund','Erstattungen');
    INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents) VALUES
      ('cash','Budget A','checking','budget',1,'2025-12-31',500000),
      ('a','Investment A','brokerage','investment',0,'2025-12-01',0),
      ('b','Investment B','crypto','investment',0,'2025-12-01',0),
      ('loan','Schuld A','loan','debt',0,'2025-12-31',-50000);
    INSERT INTO category_group (id,name) VALUES ('g','Alltag'),('fees','Bank und Gebühren');
    INSERT INTO category (id,name,group_id,class,kind) VALUES
      ('need','Bedarf A','g','need','variable'),('want','Wunsch A','g','want','variable'),('fee','Zins A','fees','need','fixed');
    INSERT INTO security (id,name,kind) VALUES ('asset','Produkt A','etf'),('sold','Verkauftes Produkt','stock'),('held','Gehaltenes Produkt','stock');
    INSERT INTO holding (id,security_id,account_id,as_of,units_e8,cost_basis_cents) VALUES ('holding','asset','a','2025-12-31',100000000,10000);
    INSERT INTO price (security_id,date,price_micro,currency,source) VALUES
      ('asset','2025-12-31',100000000,'EUR','manual'),('asset','2026-01-31',110000000,'EUR','manual'),('asset','2026-02-28',90000000,'EUR','manual');
    INSERT INTO trade (id,security_id,account_id,date,kind,units_e8,amount_cents) VALUES
      ('old-buy','sold','a','2025-12-02','buy',100000000,5000),('old-sell','sold','a','2025-12-10','sell',-100000000,5000);
    INSERT INTO transfer (id) VALUES ('deposit'),('internal'),('repayment');
    INSERT INTO booking (id,account_id,date,amount_cents,transfer_id) VALUES
      ('salary','cash','2026-01-15',70000,NULL),('side','cash','2026-01-20',30000,NULL),
      ('capital','cash','2026-01-21',1000,NULL),('refund','cash','2026-01-22',2000,NULL),
      ('need','cash','2026-01-10',-60000,NULL),('want','cash','2026-01-11',-10000,NULL),
      ('deposit-out','cash','2026-01-25',-20000,'deposit'),('deposit-in','a','2026-01-25',20000,'deposit'),
      ('internal-out','a','2026-01-26',-5000,'internal'),('internal-in','b','2026-01-26',5000,'internal'),
      ('repayment-out','cash','2026-01-27',-10000,'repayment'),('repayment-in','loan','2026-01-27',10000,'repayment'),
      ('interest','loan','2026-01-27',-1000,NULL);
    INSERT INTO booking_split (id,booking_id,amount_cents,category_id,income_type_id) VALUES
      ('salary','salary',70000,NULL,'income-salary'),('side','side',30000,NULL,'income-side'),
      ('capital','capital',1000,NULL,'income-capital'),('refund','refund',2000,NULL,'income-refund'),
      ('need','need',-60000,'need',NULL),('want','want',-10000,'want',NULL),
      ('deposit-out','deposit-out',-20000,NULL,NULL),('deposit-in','deposit-in',20000,NULL,NULL),
      ('internal-out','internal-out',-5000,NULL,NULL),('internal-in','internal-in',5000,NULL,NULL),
      ('repayment-out','repayment-out',-10000,NULL,NULL),('repayment-in','repayment-in',10000,NULL,NULL),
      ('interest','interest',-1000,'fee',NULL);
  `);
  app = createApp({ webDir, auth, ledger: { db: opened.db, today: () => '2026-03-05' } });
});
afterEach(() => opened.close());
const read = async <T>(path: string): Promise<T> => {
  const response = await app.request(`/api/${path}`);
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as T;
};
const overview = () => read<WholePicture>('overview/whole-picture?period=2026-01..2026-02');

it('closes the period and each month to the cent with visible other movements and signed market effects', async () => {
  const data = await overview();
  expect(data.totals).toMatchObject({
    startCents: 460000,
    incomeCents: 100000,
    savedCents: 30000,
    investmentsInCents: 20000,
    marketCents: -1000,
    principalCents: 9000,
    otherCents: 2000,
    endCents: 491000,
  });
  expect(data.rows.map((r) => r.marketCents)).toEqual([1000, -2000]);
  for (const r of [...data.rows, data.totals])
    expect(r.startCents + r.savedCents + r.marketCents + r.otherCents).toBe(r.endCents);
  expect(data.rows[0]!.investmentsInCents).toBe(20000); // the internal 5000 transfer is neutral
});

it('counts principal paid from an investment account while keeping the budget-investment boundary intact', async () => {
  opened.sqlite.exec(`
    INSERT INTO transfer (id) VALUES ('asset-repayment');
    INSERT INTO booking (id,account_id,date,amount_cents,transfer_id) VALUES
      ('asset-repayment-out','b','2026-01-28',-3000,'asset-repayment'),
      ('asset-repayment-in','loan','2026-01-28',3000,'asset-repayment');
    INSERT INTO booking_split (id,booking_id,amount_cents) VALUES
      ('asset-repayment-out','asset-repayment-out',-3000),
      ('asset-repayment-in','asset-repayment-in',3000);
  `);
  const data = await overview();
  expect(data.totals.principalCents).toBe(12000);
  expect(data.totals.investmentsInCents).toBe(20000);
  expect(data.totals.marketCents).toBe(-1000);
  expect(data.totals.endCents).toBe(491000);
});

it('uses the values of Vermögen, 1.8, 3.2 and the depot view of 4.3', async () => {
  const data = await overview();
  const nw = await read<{ chain: { nowCents: number; startCents: number } }>(
    'wealth/networth?period=2026-01..2026-02',
  );
  expect(data.totals.endCents).toBe(nw.chain.nowCents);
  expect(data.totals.startCents).toBe(nw.chain.startCents);
  const year = await read<{
    report: { totals: { incomeCents: number }; netWorth: { endCents: number } };
  }>('overview/year?year=2026');
  expect(data.totals.incomeCents).toBe(year.report.totals.incomeCents);
  expect(data.totals.endCents).toBe(year.report.netWorth.endCents);
  const portfolio = await read<{
    portfolio: { performance: { contributionsCents: number; gainCents: number } };
  }>('portfolio?period=2026-01..2026-02&view=depot&history=contributions');
  expect(data.totals.investmentsInCents).toBe(portfolio.portfolio.performance.contributionsCents);
  expect(data.totals.marketCents).toBe(portfolio.portfolio.performance.gainCents);
  const cashflow = await read<{
    totals: { incomeCents: number; netCents: number; capitalCents: number };
  }>('cashflow?period=2026-01..2026-02');
  expect(data.totals.incomeCents).toBe(cashflow.totals.incomeCents);
  expect(data.totals.savedCents).toBe(cashflow.totals.netCents);
  expect(data.totals.capitalCents).toBe(cashflow.totals.capitalCents);
  const tables = await read<{ months: Array<{ month: string; netWorthCents: number }> }>(
    'report-tables/months?netWorth=1',
  );
  for (const row of data.rows)
    expect(row.endCents).toBe(tables.months.find((m) => m.month === row.month)!.netWorthCents);
});

it('keeps income rows and the shared income step equal to earnedCents, excluding capital and refunds', async () => {
  const one = await read<OnePager>('reports/month/onepager?month=2026-01');
  expect(
    one.incomeRows.filter((r) => r.kind === 'household').reduce((sum, r) => sum + r.cents, 0),
  ).toBe(one.result.earnedCents);
  expect(one.result.earnedCents).toBe(100000);
  expect(one.pace.income[14]).toBe(0);
  expect(one.pace.income[15]).toBe(70000);
  expect(one.pace.income[20]).toBe(100000);
  expect(one.pace.income.at(-1)).toBe(one.result.earnedCents);
});

it('never flags a position sold before the range; a held unpriced position stays flagged', async () => {
  type Notes = { incomplete?: Array<{ securityId: string }> };
  for (const path of [
    'reports/month/onepager?month=2026-01',
    'portfolio?period=2026-01..2026-02',
    'overview/whole-picture?period=2026-01..2026-02',
  ]) {
    expect(
      (await read<Notes>(path)).incomplete?.some((n) => n.securityId === 'sold') ?? false,
    ).toBe(false);
  }
  opened.sqlite.exec(
    "INSERT INTO holding (id,security_id,account_id,as_of,units_e8,cost_basis_cents) VALUES ('unpriced','held','a','2025-12-31',100000000,5000)",
  );
  const one = await read<Notes>('reports/month/onepager?month=2026-01');
  expect(one.incomplete?.map((n) => n.securityId)).toContain('held');
});

it('validates ranges and refuses future months', async () => {
  for (const period of ['garbage', '2026-04..2026-04'])
    expect((await app.request(`/api/overview/whole-picture?period=${period}`)).status).toBe(400);
});
