/* eslint-disable @typescript-eslint/no-explicit-any -- literal JSON contract assertions */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-10-01';
const webDir = mkdtempSync(join(tmpdir(), 'budget-loan-plan-api-'));
writeFileSync(join(webDir, 'index.html'), '<title>Budget</title>');
let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
let signedIn = true;
const auth: AuthGate = {
  originGuard: async (c, next) =>
    c.req.method !== 'GET' && c.req.header('origin') !== 'http://budget.test'
      ? c.json({ error: 'origin' }, 403)
      : next(),
  requireSession: async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
const base = '/api/wealth/debts';
async function call(method: string, path: string, body?: unknown, origin = 'http://budget.test') {
  const res = await app.request(base + path, {
    method,
    headers: { 'content-type': 'application/json', origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const undo = async (groupId: string) => {
  const res = await app.request('/api/undo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://budget.test' },
    body: JSON.stringify({ groupId }),
  });
  return { status: res.status, body: (await res.json()) as any };
};
const quarterly = {
  name: 'Quartalsweise 500 Euro',
  measures: [
    { kind: 'recurring', fromMonth: '2026-10', toMonth: null, everyMonths: 3, amountCents: 50_000 },
  ],
};
const monthly300 = {
  name: '300 Euro monatlich',
  measures: [
    { kind: 'recurring', fromMonth: '2026-10', toMonth: null, everyMonths: 1, amountCents: 30_000 },
  ],
};
const audits = () => opened.db.select().from(schema.auditLog).all().length;

beforeEach(() => {
  opened = createTestDatabase();
  signedIn = true;
  opened.db
    .insert(schema.account)
    .values([
      {
        id: 'loan',
        name: 'Synthetic loan',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: TODAY,
        openingBalanceCents: -1_217_600,
        interestRateBp: 632,
        interestKind: 'variable',
        installmentCents: 41_200,
      },
      {
        id: 'loan2',
        name: 'Synthetic second loan',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: TODAY,
        openingBalanceCents: -500_000,
        interestRateBp: 300,
        installmentCents: 25_000,
      },
      {
        id: 'card',
        name: 'Synthetic card',
        type: 'credit_card',
        role: 'budget',
        onBudget: true,
        openingDate: TODAY,
        openingBalanceCents: -150_000,
        interestRateBp: 1_800,
      },
      {
        id: 'giro',
        name: 'Synthetic checking',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: TODAY,
      },
    ])
    .run();
  app = createApp({ webDir, auth, ledger: { db: opened.db, today: () => TODAY } });
});
afterEach(() => opened.close());

describe('loan plan: baseline from the stored terms', () => {
  it('returns literal integer-cent results and writes nothing', async () => {
    const before = audits();
    const { status, body } = await call('GET', '/loan/plan');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      accountId: 'loan',
      currency: 'EUR',
      startMonth: '2026-10',
      balanceCents: 1_217_600,
      missing: [],
      terms: { rateBp: 632, effectiveRateBp: 632, installmentCents: 41_200, monthlyFeeCents: 0 },
      rateChanges: [],
      scenarios: [],
      baseline: {
        status: 'ok',
        summary: { months: 33, payoffMonth: '2029-06', totalInterestCents: 109_405 },
      },
    });
    expect(audits()).toBe(before);
  });

  it('names missing terms instead of guessing, and an empty loan has no plan', async () => {
    opened.db.update(schema.account).set({ installmentCents: null }).run();
    const incomplete = (await call('GET', '/loan/plan')).body;
    expect(incomplete.missing).toEqual(['installment']);
    expect(incomplete.baseline).toBeNull();
    opened.db.update(schema.account).set({ interestRateBp: null }).run();
    expect((await call('GET', '/loan/plan')).body.missing).toEqual(['rate', 'installment']);
  });

  it('a constant installment below the interest is a typed baseline error', async () => {
    opened.db.update(schema.account).set({ installmentCents: 6_000 }).run();
    expect((await call('GET', '/loan/plan')).body.baseline).toEqual({
      status: 'error',
      code: 'payment_below_interest',
    });
  });

  it('rejects non-loans, unknown accounts, future days and past months', async () => {
    expect((await call('GET', '/card/plan')).status).toBe(409);
    expect((await call('GET', '/unknown/plan')).status).toBe(404);
    expect((await call('GET', '/loan/plan?asOf=2026-10-02')).status).toBe(400);
    expect((await call('GET', '/loan/plan?asOf=2026-10-01&startMonth=2026-09')).status).toBe(400);
  });

  it('needs the session and, for writes, the origin', async () => {
    signedIn = false;
    expect((await call('GET', '/loan/plan')).status).toBe(401);
    signedIn = true;
    const body = { validFrom: '2027-01-01', rateBp: 500 };
    expect((await call('POST', '/loan/rate-changes', body, 'http://evil.test')).status).toBe(403);
    expect(audits()).toBe(0);
  });
});

describe('variable conditions: dated rate changes', () => {
  const change = { validFrom: '2027-01-01', rateBp: 0 };

  it('is stored, used by the schedule, audited and undoable', async () => {
    const plain = (await call('GET', '/loan/plan')).body.baseline.summary.totalInterestCents;
    const created = await call('POST', '/loan/rate-changes', change);
    expect(created.status).toBe(201);
    const plan = (await call('GET', '/loan/plan')).body;
    expect(plan.rateChanges).toEqual([{ id: created.body.id, ...change }]);
    // 0 % from 2027: only the first three months bear interest.
    expect(plan.baseline.summary.totalInterestCents).toBeLessThan(plain);
    expect(plan.baseline.summary.totalInterestCents).toBe(18_687);
    expect(plan.terms.effectiveRateBp).toBe(632);
    // Undo removes it, redo (undo of the undo) brings it back.
    const undone = await undo(created.body.groupId);
    expect(undone.status).toBe(200);
    expect((await call('GET', '/loan/plan')).body.rateChanges).toEqual([]);
    expect((await undo(undone.body.groupId)).status).toBe(200);
    expect((await call('GET', '/loan/plan')).body.rateChanges).toHaveLength(1);
    const entries = opened.db.select().from(schema.auditLog).all();
    expect(entries.map((e) => e.entityType)).toContain('loan_rate_change');
  });

  it('a change that has already started is the effective rate of the first month', async () => {
    await call('POST', '/loan/rate-changes', { validFrom: '2026-06-15', rateBp: 400 });
    expect((await call('GET', '/loan/plan')).body.terms.effectiveRateBp).toBe(400);
  });

  it('updates and deletes one change; one live change per day', async () => {
    const a = await call('POST', '/loan/rate-changes', change);
    const b = await call('POST', '/loan/rate-changes', { validFrom: '2028-01-01', rateBp: 900 });
    expect((await call('POST', '/loan/rate-changes', change)).status).toBe(409);
    expect(
      (await call('PUT', `/loan/rate-changes/${b.body.id}`, { ...change, rateBp: 1 })).status,
    ).toBe(409);
    const moved = await call('PUT', `/loan/rate-changes/${b.body.id}`, {
      validFrom: '2028-03-01',
      rateBp: 950,
    });
    expect(moved.status).toBe(200);
    expect((await call('DELETE', `/loan/rate-changes/${a.body.id}`)).status).toBe(200);
    expect((await call('GET', '/loan/plan')).body.rateChanges).toEqual([
      { id: b.body.id, validFrom: '2028-03-01', rateBp: 950 },
    ]);
    expect((await call('DELETE', `/loan/rate-changes/${a.body.id}`)).status).toBe(404);
    // The day of the deleted change is free again; undoing the deletion is refused while taken.
    const del = await call('DELETE', `/loan/rate-changes/${b.body.id}`);
    await call('POST', '/loan/rate-changes', { validFrom: '2028-03-01', rateBp: 100 });
    expect((await undo(del.body.groupId)).status).toBeGreaterThanOrEqual(400);
    expect((await call('GET', '/loan/plan')).body.rateChanges).toHaveLength(1);
  });

  it('validates the rate, the day and the account', async () => {
    for (const body of [
      { validFrom: '2027-02-30', rateBp: 1 },
      { validFrom: '2027-01-01', rateBp: -1 },
      { validFrom: '2027-01-01', rateBp: 100_001 },
      { validFrom: '2027-01-01', rateBp: 1.5 },
      { validFrom: '2027-01-01', rateBp: 1, extra: true },
      { validFrom: '9900-01-01', rateBp: 1 },
    ])
      expect((await call('POST', '/loan/rate-changes', body)).status).toBe(400);
    expect((await call('POST', '/card/rate-changes', change)).status).toBe(409);
    expect((await call('POST', '/unknown/rate-changes', change)).status).toBe(404);
  });
});

describe('scenarios', () => {
  it('compares recurring Sondertilgung against the baseline in literal cents', async () => {
    const created = await call('POST', '/loan/scenarios', monthly300);
    expect(created.status).toBe(201);
    const plan = (await call('GET', '/loan/plan')).body;
    expect(plan.scenarios).toHaveLength(1);
    expect(plan.scenarios[0]).toMatchObject({
      id: created.body.id,
      name: '300 Euro monatlich',
      expired: 0,
      outcome: {
        status: 'ok',
        interestSavedCents: 47_679,
        monthsEarlier: 15,
        baseline: { months: 33 },
        scenario: { months: 18, payoffMonth: '2028-03', totalInterestCents: 61_726 },
        totalPaidDeltaCents: -47_679,
      },
    });
  });

  it('supports one-off payments, a rate change and a higher installment; edit and delete', async () => {
    const one = await call('POST', '/loan/scenarios', {
      name: 'Einmalig',
      measures: [{ kind: 'one_off', month: '2027-03', amountCents: 200_000 }],
    });
    const rate = await call('POST', '/loan/scenarios', {
      name: 'Zins steigt',
      measures: [{ kind: 'rate_change', fromMonth: '2027-01', rateBp: 1_200 }],
    });
    const higher = await call('POST', '/loan/scenarios', {
      name: 'Höhere Rate',
      measures: [{ kind: 'installment', fromMonth: '2027-01', installmentCents: 60_000 }],
    });
    let plan = (await call('GET', '/loan/plan')).body;
    const out = (name: string) => plan.scenarios.find((s: any) => s.name === name).outcome;
    expect(out('Einmalig').interestSavedCents).toBeGreaterThan(0);
    expect(out('Zins steigt').interestSavedCents).toBeLessThan(0);
    expect(out('Höhere Rate').monthsEarlier).toBeGreaterThan(0);
    const edited = await call('PUT', `/loan/scenarios/${one.body.id}`, {
      name: 'Einmalig groß',
      measures: [{ kind: 'one_off', month: '2027-03', amountCents: 400_000 }],
    });
    expect(edited.status).toBe(200);
    const smaller = out('Einmalig').interestSavedCents;
    plan = (await call('GET', '/loan/plan')).body;
    expect(out('Einmalig groß').interestSavedCents).toBeGreaterThan(smaller);
    expect((await call('DELETE', `/loan/scenarios/${rate.body.id}`)).status).toBe(200);
    expect((await call('DELETE', `/loan/scenarios/${rate.body.id}`)).status).toBe(404);
    plan = (await call('GET', '/loan/plan')).body;
    expect(plan.scenarios.map((s: any) => s.name)).toEqual(['Einmalig groß', 'Höhere Rate']);
    expect(higher.status).toBe(201);
  });

  it('undo of a creation removes it and redo restores it; a deletion is undoable', async () => {
    const created = await call('POST', '/loan/scenarios', monthly300);
    const gone = await undo(created.body.groupId);
    expect((await call('GET', '/loan/plan')).body.scenarios).toEqual([]);
    await undo(gone.body.groupId);
    expect((await call('GET', '/loan/plan')).body.scenarios).toHaveLength(1);
    const del = await call('DELETE', `/loan/scenarios/${created.body.id}`);
    expect((await call('GET', '/loan/plan')).body.scenarios).toEqual([]);
    await undo(del.body.groupId);
    expect((await call('GET', '/loan/plan')).body.scenarios[0].name).toBe('300 Euro monatlich');
  });

  it('a scenario the installment cannot carry is a typed error beside the others', async () => {
    const regular = await call('POST', '/loan/scenarios', quarterly);
    const impossible = await call('POST', '/loan/scenarios', {
      name: 'Zins explodiert',
      measures: [{ kind: 'rate_change', fromMonth: '2027-01', rateBp: 60_000 }],
    });
    const plan = (await call('GET', '/loan/plan')).body;
    // Equal creation timestamps sort by ID, so assert outcomes against their own scenarios.
    expect(plan.scenarios).toHaveLength(2);
    expect(
      plan.scenarios.find((s: { id: string }) => s.id === regular.body.id).outcome.status,
    ).toBe('ok');
    expect(plan.scenarios.find((s: { id: string }) => s.id === impossible.body.id).outcome).toEqual(
      { status: 'error', code: 'payment_below_interest' },
    );
  });

  it('Sondertilgung that lies in the past is refused when saved and counted when it expires', async () => {
    const past = {
      name: 'Vergangen',
      measures: [{ kind: 'one_off', month: '2026-09', amountCents: 100 }],
    };
    expect((await call('POST', '/loan/scenarios', past)).status).toBe(409);
    const created = await call('POST', '/loan/scenarios', {
      name: 'Bald vorbei',
      measures: [
        { kind: 'one_off', month: '2026-10', amountCents: 100_000 },
        { kind: 'recurring', fromMonth: '2026-10', toMonth: null, everyMonths: 12, amountCents: 1 },
      ],
    });
    expect(created.status).toBe(201);
    const later = (await call('GET', '/loan/plan?startMonth=2026-11')).body;
    expect(later.scenarios[0].expired).toBe(1);
  });

  it('validates input, names and the limit per loan', async () => {
    for (const body of [
      { name: '', measures: monthly300.measures },
      { name: 'x', measures: [] },
      { name: 'x', measures: [{ kind: 'one_off', month: '2027-13', amountCents: 5 }] },
      { name: 'x', measures: [{ kind: 'one_off', month: '2027-01', amountCents: 0 }] },
      { name: 'x', measures: [{ kind: 'one_off', month: '2027-01', amountCents: 1.5 }] },
      { name: 'x', measures: [{ kind: 'nope' }] },
      { name: 'x', measures: monthly300.measures, extra: 1 },
    ])
      expect((await call('POST', '/loan/scenarios', body)).status).toBe(400);
    expect((await call('POST', '/loan/scenarios', monthly300)).status).toBe(201);
    expect(
      (await call('POST', '/loan/scenarios', { ...monthly300, name: '300 EURO MONATLICH' })).status,
    ).toBe(409);
    for (let i = 0; i < 7; i++)
      expect((await call('POST', '/loan/scenarios', { ...monthly300, name: `S${i}` })).status).toBe(
        201,
      );
    expect((await call('POST', '/loan/scenarios', { ...monthly300, name: 'neun' })).status).toBe(
      409,
    );
    expect((await call('POST', '/card/scenarios', monthly300)).status).toBe(409);
  });

  it('previews an unsaved draft without writing', async () => {
    const before = audits();
    const preview = await call('POST', '/loan/plan/preview', { measures: monthly300.measures });
    expect(preview.status).toBe(200);
    expect(preview.body.draft.outcome).toMatchObject({ status: 'ok', monthsEarlier: 15 });
    expect(preview.body.scenarios).toEqual([]);
    expect(audits()).toBe(before);
    expect((await call('POST', '/loan/plan/preview', { measures: [] })).status).toBe(400);
  });

  it('never touches bookings or balances', async () => {
    const accounts = opened.db.select().from(schema.account).all();
    const bookings = opened.db.select().from(schema.booking).all();
    await call('POST', '/loan/rate-changes', { validFrom: '2027-01-01', rateBp: 100 });
    await call('POST', '/loan/scenarios', monthly300);
    await call('GET', '/loan/plan');
    expect(opened.db.select().from(schema.account).all()).toEqual(accounts);
    expect(opened.db.select().from(schema.booking).all()).toEqual(bookings);
  });
});

describe('multi-debt strategies', () => {
  const debts = (extra: Record<string, unknown>[] = []) => [
    { accountId: 'loan', rateBp: 632, minimumCents: 41_200, monthlyFeeCents: 0 },
    { accountId: 'card', rateBp: 1_800, minimumCents: 5_000, monthlyFeeCents: 0 },
    ...extra,
  ];
  const request = (over: Record<string, unknown> = {}) => ({
    startMonth: '2026-10',
    extraCents: 20_000,
    debts: debts(),
    ...over,
  });

  it('lists every open debt with its stored terms, cards included', async () => {
    await call('POST', '/loan/rate-changes', { validFrom: '2026-10-01', rateBp: 700 });
    const { status, body } = await call('GET', '/strategies');
    expect(status).toBe(200);
    expect(body.debts.map((d: any) => d.accountId).sort()).toEqual(['card', 'loan', 'loan2']);
    expect(body.debts.find((d: any) => d.accountId === 'card')).toMatchObject({
      type: 'credit_card',
      balanceCents: 150_000,
      rateBp: 1_800,
      minimumCents: null,
    });
    expect(body.debts.find((d: any) => d.accountId === 'loan')).toMatchObject({
      rateBp: 700,
      minimumCents: 41_200,
    });
  });

  it('compares avalanche with snowball and minimum payments only', async () => {
    const { status, body } = await call('POST', '/strategies', request());
    expect(status).toBe(200);
    expect(body).toMatchObject({
      currency: 'EUR',
      startingDebtCents: 1_367_600,
      monthlyBudgetCents: 66_200,
      avalanche: { status: 'ok' },
      snowball: { status: 'ok' },
      minimumOnly: { status: 'ok' },
    });
    // The card has the higher rate and the smaller balance: both orders agree here.
    expect(body.interestAdvantageCents).toBe(
      body.snowball.interestCents - body.avalanche.interestCents,
    );
    expect(body.avalanche.interestCents).toBeLessThan(body.minimumOnly.interestCents);
    expect(body.avalanche.months).toBeLessThan(body.minimumOnly.months);
    expect(body.avalanche.loans.map((l: any) => l.id).sort()).toEqual(['card', 'loan']);
  });

  it('avalanche beats snowball when the small debt has the low rate', async () => {
    const { body } = await call(
      'POST',
      '/strategies',
      request({
        debts: [
          { accountId: 'loan2', rateBp: 300, minimumCents: 25_000, monthlyFeeCents: 0 },
          { accountId: 'card', rateBp: 1_800, minimumCents: 5_000, monthlyFeeCents: 0 },
          { accountId: 'loan', rateBp: 632, minimumCents: 41_200, monthlyFeeCents: 0 },
        ],
      }),
    );
    expect(body.interestAdvantageCents).toBeGreaterThanOrEqual(0);
    expect(body.avalanche.interestCents).toBeLessThanOrEqual(body.snowball.interestCents);
  });

  it('a minimum below the interest is a typed error per strategy, not a failure', async () => {
    const { status, body } = await call(
      'POST',
      '/strategies',
      request({
        extraCents: 0,
        debts: debts().map((d) => (d.accountId === 'card' ? { ...d, minimumCents: 0 } : d)),
      }),
    );
    expect(status).toBe(200);
    expect(body.avalanche).toMatchObject({ status: 'error', code: 'payment_below_interest' });
    expect(body.avalanche.names).toEqual(['Synthetic card']);
    expect(body.interestAdvantageCents).toBeNull();
  });

  it('validates the selection, currency and numbers; it writes nothing', async () => {
    const before = audits();
    for (const body of [
      request({ debts: debts().slice(0, 1) }),
      request({ extraCents: -1 }),
      request({ extraCents: 1.5 }),
      request({ startMonth: '2026-09' }),
      request({
        debts: debts([{ accountId: 'x', rateBp: 1.5, minimumCents: 0, monthlyFeeCents: 0 }]),
      }),
    ])
      expect((await call('POST', '/strategies', body)).status).toBe(400);
    expect(
      (await call('POST', '/strategies', request({ debts: [debts()[0], debts()[0]] }))).status,
    ).toBe(409);
    expect(
      (
        await call(
          'POST',
          '/strategies',
          request({
            debts: [
              debts()[0],
              { accountId: 'giro', rateBp: 0, minimumCents: 0, monthlyFeeCents: 0 },
            ],
          }),
        )
      ).status,
    ).toBe(409);
    opened.db
      .update(schema.account)
      .set({ currency: 'USD' })
      .where((await import('drizzle-orm')).eq(schema.account.id, 'card'))
      .run();
    expect((await call('POST', '/strategies', request())).status).toBe(409);
    expect(audits()).toBe(before);
  });
});
