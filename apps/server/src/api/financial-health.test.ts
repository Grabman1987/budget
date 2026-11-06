import {
  accounts,
  categories,
  createBooking,
  createEntity,
  createTestDatabase,
  ensureDefaultRules,
  schema,
  setAssigned,
  type Db,
  type OpenedDatabase,
} from '@budget/db';
import type { FinancialHealthAssessment } from '@budget/domain';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-health-'));
writeFileSync(join(webDir, 'index.html'), '<title>Synthetic</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (c, next) =>
    c.req.header('x-test-session') === 'present' ? next() : c.json({ error: 'unauthorized' }, 401),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: OpenedDatabase;
let db: Db;
let day: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  day = '2026-04-15';
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => day } });
});
afterEach(() => opened.close());
const ctx = { actor: 'synthetic-test' };
function budgetFixture() {
  accounts.create(
    db,
    {
      id: 'giro',
      name: 'Synthetic cash',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 1000000,
    },
    ctx,
  );
  accounts.create(
    db,
    {
      id: 'reserve',
      name: 'Synthetic reserve',
      type: 'savings',
      role: 'reserve',
      onBudget: false,
      openingDate: '2026-01-01',
      openingBalanceCents: 270000,
    },
    ctx,
  );
  createEntity(db, schema.categoryGroup, { id: 'g', name: 'Synthetic group' }, ctx);
  categories.create(db, { id: 'need', name: 'Synthetic need', groupId: 'g', class: 'need' }, ctx);
  for (const month of ['2026-01', '2026-02', '2026-03']) {
    createBooking(
      db,
      {
        accountId: 'giro',
        date: `${month}-02`,
        amountCents: 100000,
        splits: [{ amountCents: 100000, incomeTypeId: 'income-salary' }],
      },
      ctx,
    );
    createBooking(
      db,
      {
        accountId: 'giro',
        date: `${month}-03`,
        amountCents: -90000,
        splits: [{ amountCents: -90000, categoryId: 'need' }],
      },
      ctx,
    );
  }
  ensureDefaultRules(db);
}
async function get() {
  const response = await app.request('/api/rules/health', {
    headers: { 'x-test-session': 'present' },
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<FinancialHealthAssessment>;
}
const category = (data: FinancialHealthAssessment, id: string) =>
  data.categories.find((c) => c.id === id)!;

function portfolioFixture() {
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,on_budget,opening_date)
      VALUES ('depot','Synthetic depot','brokerage','investment',0,'2026-01-01');
    INSERT INTO asset_class (id,name) VALUES ('world','Synthetic world');
    INSERT INTO asset_class_target (id,asset_class_id,valid_from,target_share_bp,band_bp)
      VALUES ('world-target','world','2026-01-01',10000,1234);
    INSERT INTO security (id,name,kind,currency) VALUES ('etf','Synthetic ETF','etf','EUR');
    INSERT INTO holding (id,security_id,account_id,as_of,units_e8,cost_basis_cents)
      VALUES ('h-etf','etf','depot','2026-01-01',100000000,10000);
    INSERT INTO price (security_id,date,price_micro,currency,source)
      VALUES ('etf','2026-04-15',100000000,'EUR','manual');
    INSERT INTO security_exposure_version (id,security_id,valid_from,complete,source)
      VALUES ('etf-v1','etf','2026-01-01',1,'synthetic');
    INSERT INTO security_asset_exposure (id,version_id,security_id,asset_class_id,valid_from,weight_bp,source)
      VALUES ('etf-exposure','etf-v1','etf','world','2026-01-01',10000,'synthetic');
  `);
}

describe('authenticated, read-only current Financial Health assessment', () => {
  it('requires the existing session guard and an authenticated GET never writes', async () => {
    budgetFixture();
    expect((await app.request('/api/rules/health')).status).toBe(401);
    const before = opened.sqlite.prepare('SELECT total_changes() AS n').get();
    const balances = opened.sqlite
      .prepare('SELECT id, opening_balance_cents FROM account ORDER BY id')
      .all();
    const one = await get();
    expect(await get()).toEqual(one);
    expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(before);
    expect(
      opened.sqlite.prepare('SELECT id, opening_balance_cents FROM account ORDER BY id').all(),
    ).toEqual(balances);
    expect(
      (
        await app.request('/api/rules/health', {
          method: 'POST',
          headers: { 'x-test-session': 'present' },
        })
      ).status,
    ).toBe(404);
  });

  it('returns the literal 50/100/not-applicable case with overall 71 and a single source day', async () => {
    budgetFixture();
    const data = await get();
    expect(data.asOf).toBe('2026-04-15');
    expect(data.categories.map((c) => c.score)).toEqual([50, 100, null]);
    expect(data.score).toBe(71);
    expect(data.coverageBp).toBe(10000);
    expect(category(data, 'portfolio').state).toBe('not_applicable');
    for (const c of data.categories)
      for (const m of c.metrics) expect(m.source.asOf).toBe('2026-04-15');
    expect(category(data, 'cashflow').metrics[0]!.source).toMatchObject({
      state: 'available',
      window: { from: '2026-01-01', to: '2026-03-31' },
      facts: { incomeCents: 300000, consumptionCents: 270000, months: 3 },
    });
    expect(category(data, 'cashflow').metrics[1]!.source).toMatchObject({
      facts: { reserveCents: 270000, averageNeedCents: 90000, tenthsOfMonth: 30, months: 3 },
    });
  });

  it('keeps known EUR budget/reserves usable when an unrelated excluded account lacks FX', async () => {
    budgetFixture();
    accounts.create(
      db,
      {
        id: 'unknown',
        name: 'Synthetic excluded currency',
        type: 'savings',
        role: 'investment',
        onBudget: false,
        currency: 'CHF',
        allocationScope: 'excluded',
        openingDate: '2026-01-01',
        openingBalanceCents: 10000,
      },
      ctx,
    );
    const data = await get();
    expect(category(data, 'cashflow')).toMatchObject({ score: 50, coverageBp: 10000 });
    expect(category(data, 'debt')).toMatchObject({ score: null, state: 'unavailable' });
    expect(data.score).toBeNull();
    expect(data.coverageBp).toBe(5714);
  });

  it('does not award healthy points for an unknown reserve, liability or empty ledger', async () => {
    const empty = await get();
    expect(empty.score).toBeNull();
    expect(empty.coverageBp).toBe(0);
    expect(empty.evaluatedCategories).toBe(0);
    budgetFixture();
    db.update(schema.account)
      .set({ currency: 'CHF' })
      .where(eq(schema.account.id, 'reserve'))
      .run();
    const unknown = await get();
    expect(category(unknown, 'cashflow').metrics[1]!.score).toBeNull();
    expect(category(unknown, 'debt').score).toBeNull();
    expect(unknown.score).toBeNull();
  });

  it('uses explicit stored targets even with a disabled rule and no optional profile', async () => {
    budgetFixture();
    db.update(schema.rule)
      .set({ paramsJson: JSON.stringify({ futureMinBp: 2500 }), enabled: false })
      .where(eq(schema.rule.code, 'R01'))
      .run();
    const data = await get();
    // Capacity 10/25=40, reserves 50 =>45; (45*40+100*30)/70=68.571 =>69.
    expect(category(data, 'cashflow').score).toBe(45);
    expect(data.score).toBe(69);
    db.insert(schema.appSetting)
      .values([
        { id: 'profile.household', value: '8' },
        { id: 'profile.birth_date', value: '1970-01-01' },
      ])
      .run();
    expect(await get()).toEqual(data);
  });

  it('does not count a running month, but preserves the existing final-day reference convention', async () => {
    budgetFixture();
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-04-14',
        amountCents: 1000000,
        splits: [{ amountCents: 1000000, incomeTypeId: 'income-salary' }],
      },
      ctx,
    );
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-04-14',
        amountCents: -90000,
        splits: [{ amountCents: -90000, categoryId: 'need' }],
      },
      ctx,
    );
    expect(category(await get(), 'cashflow').metrics[0]!.source).toMatchObject({
      facts: { months: 3, incomeCents: 300000 },
    });
    day = '2026-04-30';
    expect(category(await get(), 'cashflow').metrics[0]!.source).toMatchObject({
      window: { to: '2026-04-30' },
      facts: { months: 4, incomeCents: 1300000, consumptionCents: 360000 },
    });
  });

  it('withholds debt-service points for missing terms and an aggregate lower bound', async () => {
    budgetFixture();
    categories.create(
      db,
      {
        id: 'minimum',
        name: 'Synthetic minimum debt',
        groupId: 'g',
        class: 'future',
        kind: 'debt',
        stage: 1,
      },
      ctx,
    );
    accounts.create(
      db,
      {
        id: 'loan1',
        name: 'Synthetic loan one',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: '2026-01-01',
        openingBalanceCents: -500000,
        installmentCents: 10000,
        interestRateBp: 100,
      },
      ctx,
    );
    expect(category(await get(), 'debt').score).toBeNull();
    db.insert(schema.expectedPayment)
      .values({
        id: 'rate1',
        name: 'Synthetic rate one',
        categoryId: 'minimum',
        rhythm: 'monthly',
        kind: 'outflow',
      })
      .run();
    db.insert(schema.expectedPaymentVersion)
      .values({
        id: 'rate1-v1',
        expectedPaymentId: 'rate1',
        validFrom: '2026-01-01',
        amountCents: 10000,
      })
      .run();
    expect(category(await get(), 'debt').score).toBe(100);
    accounts.create(
      db,
      {
        id: 'loan2',
        name: 'Synthetic loan two',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: '2026-01-01',
        openingBalanceCents: -500000,
        installmentCents: 20000,
        interestRateBp: 100,
      },
      ctx,
    );
    // R08 knows only 10000 while two proven installments total 30000: not a healthy 10% score.
    expect(category(await get(), 'debt').metrics[0]).toMatchObject({
      score: null,
      reason: 'incomplete_service',
    });
    db.insert(schema.expectedPayment)
      .values({
        id: 'rate2',
        name: 'Synthetic rate two',
        categoryId: 'minimum',
        rhythm: 'monthly',
        kind: 'outflow',
      })
      .run();
    db.insert(schema.expectedPaymentVersion)
      .values({
        id: 'rate2-v1',
        expectedPaymentId: 'rate2',
        validFrom: '2026-01-01',
        amountCents: 25000,
      })
      .run();
    // Complete 35000/100000 =>35%, R08 warning =>50 points.
    const debt = category(await get(), 'debt');
    expect(debt.score).toBe(50);
    expect(debt.metrics[0]!.source).toMatchObject({
      facts: { paymentsCents: 35000, ratioBp: 3500, status: 'warn' },
    });
  });

  it('distinguishes an unfunded card from a proven fully funded monthly-settlement liability', async () => {
    budgetFixture();
    accounts.create(
      db,
      {
        id: 'card',
        name: 'Synthetic card',
        type: 'credit_card',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-04-01',
        openingBalanceCents: -10000,
      },
      ctx,
    );
    categories.create(
      db,
      {
        id: 'card-payment',
        name: 'Synthetic card payment',
        groupId: 'g',
        kind: 'card_payment',
        cardAccountId: 'card',
      },
      ctx,
    );
    expect(category(await get(), 'debt').score).toBeNull();
    setAssigned(db, 'card-payment', '2026-04', 10000, ctx);
    const funded = category(await get(), 'debt');
    expect(funded.score).toBe(100);
    expect(funded.metrics[0]!.source).toMatchObject({
      facts: { mode: 'funded_cards', debtCents: 10000 },
    });
  });

  it('retains proven R08 service capacity when unrelated R13 configuration is invalid', async () => {
    budgetFixture();
    portfolioFixture();
    categories.create(
      db,
      {
        id: 'minimum',
        name: 'Synthetic minimum debt',
        groupId: 'g',
        class: 'future',
        kind: 'debt',
        stage: 1,
      },
      ctx,
    );
    accounts.create(
      db,
      {
        id: 'loan1',
        name: 'Synthetic loan',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: '2026-01-01',
        openingBalanceCents: -500000,
        installmentCents: 10000,
        interestRateBp: 100,
      },
      ctx,
    );
    db.insert(schema.expectedPayment)
      .values({
        id: 'rate',
        name: 'Synthetic rate',
        categoryId: 'minimum',
        rhythm: 'monthly',
        kind: 'outflow',
      })
      .run();
    db.insert(schema.expectedPaymentVersion)
      .values({
        id: 'rate-v1',
        expectedPaymentId: 'rate',
        validFrom: '2026-01-01',
        amountCents: 10000,
      })
      .run();
    opened.sqlite.exec("UPDATE rule SET params_json='invalid json' WHERE code='R13'");
    const data = await get();
    expect(category(data, 'debt')).toMatchObject({ score: 100, coverageBp: 10000 });
    expect(category(data, 'debt').metrics[0]!.source).toMatchObject({
      facts: { paymentsCents: 10000, incomeCents: 100000, ratioBp: 1000, status: 'ok' },
    });
    expect(category(data, 'portfolio').score).toBeNull();
    expect(data.score).toBeNull();
  });

  it('uses exact scoped allocation facts and shows the effective stored band, not a default', async () => {
    budgetFixture();
    portfolioFixture();
    const data = await get();
    expect(category(data, 'portfolio')).toMatchObject({ score: 100, coverageBp: 10000 });
    expect(data.score).toBe(80);
    const basis = category(data, 'portfolio').metrics[0]!.basis.join(' ');
    expect(basis).toContain('12,34 Pp'); // stored 1234 bp; the default cap would be 5,00 Pp.
    expect(basis).toContain('Band × 200 / 100');
    expect(category(data, 'portfolio').metrics[1]!.basis.join(' ')).toContain(
      'Warnung bis 5,00 Pp',
    );
  });

  it.each([
    'estimated',
    'stale',
    'unclassified',
    'missing_fx',
    'missing_target',
    'unknown_platform',
    'invalid_policy',
  ] as const)('does not improve health through %s portfolio facts', async (gap) => {
    budgetFixture();
    portfolioFixture();
    if (gap === 'estimated') opened.sqlite.exec("DELETE FROM price WHERE security_id='etf'");
    if (gap === 'stale')
      opened.sqlite.exec("UPDATE price SET date='2026-01-01' WHERE security_id='etf'");
    if (gap === 'unclassified')
      opened.sqlite.exec("DELETE FROM security_asset_exposure WHERE security_id='etf'");
    if (gap === 'missing_fx')
      opened.sqlite.exec("UPDATE price SET currency='CHF' WHERE security_id='etf'");
    if (gap === 'missing_target') opened.sqlite.exec('DELETE FROM asset_class_target');
    if (gap === 'unknown_platform')
      opened.sqlite.exec("UPDATE security SET kind='crypto' WHERE id='etf'");
    if (gap === 'invalid_policy')
      opened.sqlite.exec("UPDATE rule SET params_json='not valid json' WHERE code='R13'");
    const data = await get();
    expect(category(data, 'portfolio').score).toBeNull();
    expect(category(data, 'portfolio').state).not.toBe('not_applicable');
    expect(data.score).toBeNull();
    // Unrelated portfolio gaps never erase the known EUR budget and reserve criteria.
    expect(category(data, 'cashflow').score).toBe(50);
  });
});
