/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  accounts,
  categories,
  createBooking,
  createEntity,
  createTestDatabase,
  ensureDefaultRules,
  schema,
  type Db,
} from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BOOK_RULE_CODES,
  DEFAULT_ACTIVE_RULE_COUNT,
  RULE_CODES,
  dayCounts,
  ruleTimelines,
} from '@budget/domain';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-31';
const webDir = mkdtempSync(join(tmpdir(), 'budget-rules-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createTestDatabase().db;
  const ctx = { actor: 'tester' };
  accounts.create(
    db,
    {
      id: 'giro',
      name: 'Giro',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2025-01-01',
      openingBalanceCents: 500_000,
    },
    ctx,
  );
  accounts.create(
    db,
    {
      id: 'spar',
      name: 'Sparen',
      type: 'savings',
      role: 'reserve',
      onBudget: true,
      openingDate: '2025-01-01',
      openingBalanceCents: 600_000,
    },
    ctx,
  );
  createEntity(db, schema.categoryGroup, { id: 'g', name: 'Fixkosten' }, ctx);
  categories.create(db, { id: 'miete', name: 'Miete', groupId: 'g', class: 'need' }, ctx);
  createEntity(db, schema.payee, { id: 'p1', name: 'Vermieter' }, ctx);
  // 14 months of rent: 2 000 € Bedarf per month; the 6 000 € reserve is a little over 3 months (March has no rent yet)
  for (let m = 1; m <= 14; m++) {
    const date =
      m <= 12
        ? `2025-${String(m).padStart(2, '0')}-01`
        : `2026-${String(m - 12).padStart(2, '0')}-01`;
    createBooking(
      db,
      {
        accountId: 'giro',
        date,
        amountCents: -200_000,
        payeeId: 'p1',
        splits: [{ categoryId: 'miete', amountCents: -200_000 }],
      },
      ctx,
    );
  }
  ensureDefaultRules(db);
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

describe('GET /rules', () => {
  it('lists registered rules with parameters, defaults and the stage checklist', async () => {
    const res = await call('GET', '/rules');
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(RULE_CODES.length);
    expect(res.body.rules[1]).toMatchObject({
      code: 'R02',
      name: 'Notgroschen',
      stage: 2,
      enabled: true,
      params: { minMonths: 3, targetMonths: 6 },
      latest: null,
    });
    expect(res.body.checklist).toHaveLength(14);
  });
});

describe('POST /rules/evaluate, GET /rules/results, GET /rules/check', () => {
  it('evaluates, stores a matrix of 12 days and answers the Finanz-Check', async () => {
    const run = await call('POST', '/rules/evaluate');
    expect(run.status).toBe(200);
    expect(run.body.days).toHaveLength(12); // 31.03. is a month end itself
    expect(run.body.stored).toBeGreaterThan(0);
    // the same again stores the same rows
    expect((await call('POST', '/rules/evaluate')).body.stored).toBe(run.body.stored);

    const list = await call('GET', '/rules');
    const r02 = list.body.rules.find((r: any) => r.code === 'R02');
    expect(r02.latest).toMatchObject({ asOf: TODAY, status: 'warn', valueText: '3,3 Monate' });
  });

  it('the result matrix and the check', async () => {
    await call('POST', '/rules/evaluate');
    const matrix = await call('GET', '/rules/results');
    expect(matrix.status).toBe(200);
    expect(matrix.body.rules).toHaveLength(DEFAULT_ACTIVE_RULE_COUNT);
    const r02 = matrix.body.rules.find((r: any) => r.code === 'R02');
    expect(r02.cells.at(-1)).toMatchObject({ asOf: TODAY });
    expect((await call('GET', '/rules/results?from=2026-03-31&to=2026-01-01')).status).toBe(400);
    expect((await call('GET', '/rules/results?from=nope')).status).toBe(400);

    const check = await call('GET', '/rules/check');
    expect(check.status).toBe(200);
    expect(check.body.counts.total).toBe(DEFAULT_ACTIVE_RULE_COUNT);
    expect(check.body.stage).toMatchObject({ stage: 1 });
    expect(check.body.checklist.total).toBe(14);
  });
});

describe('Finanz-Check-Verlauf (report 5.2)', () => {
  it('reads the stored matrix as strips and counts that agree with the Finanz-Check', async () => {
    await call('POST', '/rules/evaluate');
    const matrix = (await call('GET', '/rules/results')).body;
    const check = (await call('GET', '/rules/check')).body;
    const timelines = ruleTimelines(matrix);
    const counts = dayCounts(matrix);
    expect(counts).toHaveLength(matrix.days.length);
    expect(timelines).toHaveLength(DEFAULT_ACTIVE_RULE_COUNT);
    for (const line of timelines) expect(line.strip).toHaveLength(matrix.days.length);
    const newest = counts.at(-1)!;
    expect(newest.asOf).toBe(TODAY);
    // The newest stored day is the day the live check evaluates.
    expect([newest.ok, newest.warn, newest.bad]).toEqual([
      check.counts.ok,
      check.counts.warn,
      check.counts.bad,
    ]);
    // A rule's run ends on the newest day, so its start is never after it.
    for (const line of timelines.filter((l) => l.current !== null))
      expect(line.sinceDay! <= TODAY).toBe(true);
  });
});

describe('PATCH /rules/:code', () => {
  it('changes parameters and enabled, audited, and POST /undo reverts the change', async () => {
    const patched = await call('PATCH', '/rules/R02', {
      params: { minMonths: 1, targetMonths: 2 },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.rule.params).toMatchObject({ minMonths: 1, targetMonths: 2 });
    expect(patched.body.groupId).toBeTruthy();

    await call('POST', '/rules/evaluate');
    const flipped = (await call('GET', '/rules')).body.rules.find((r: any) => r.code === 'R02');
    expect(flipped.latest.status).toBe('ok');

    const off = await call('PATCH', '/rules/R02', { enabled: false });
    expect(off.body.rule.enabled).toBe(false);
    expect((await call('GET', '/rules/check')).body.counts.total).toBe(
      DEFAULT_ACTIVE_RULE_COUNT - 1,
    );

    expect((await call('POST', '/undo', { groupId: off.body.groupId })).status).toBe(200);
    expect((await call('POST', '/undo', { groupId: patched.body.groupId })).status).toBe(200);
    const back = (await call('GET', '/rules')).body.rules.find((r: any) => r.code === 'R02');
    expect(back).toMatchObject({ enabled: true, params: { minMonths: 3, targetMonths: 6 } });
  });

  it('refuses unknown keys, bad values, an empty patch and unknown rules', async () => {
    expect((await call('PATCH', '/rules/R02', { params: { nope: 1 } })).status).toBe(400);
    expect((await call('PATCH', '/rules/R02', { params: { minMonths: -1 } })).status).toBe(400);
    expect((await call('PATCH', '/rules/R02', {})).status).toBe(400);
    expect((await call('PATCH', '/rules/R02', { other: 1 })).status).toBe(400);
    expect((await call('PATCH', '/rules/R99', { enabled: false })).status).toBe(404);
  });
});

describe('PATCH /rules/checklist/:code', () => {
  it('the owner confirms a non-computable item; it counts in the check; undo reopens it', async () => {
    const before = (await call('GET', '/rules/check')).body.checklist.done;
    const done = await call('PATCH', '/rules/checklist/S2-6', { confirmed: true });
    expect(done.status).toBe(200);
    expect(done.body.item).toMatchObject({ code: 'S2-6' });
    expect(done.body.item.confirmedAt).toBeTruthy();
    expect((await call('GET', '/rules/check')).body.checklist.done).toBe(before + 1);

    await call('POST', '/undo', { groupId: done.body.groupId });
    expect((await call('GET', '/rules/check')).body.checklist.done).toBe(before);
  });

  it('an item that a rule decides is refused; unknown items are 404', async () => {
    const refused = await call('PATCH', '/rules/checklist/S1-3', { confirmed: true });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: 'rule_backed', ruleCode: 'R06' });
    expect((await call('PATCH', '/rules/checklist/X-1', { confirmed: true })).status).toBe(404);
    expect((await call('PATCH', '/rules/checklist/S2-6', {})).status).toBe(400);
  });
});

describe('book-rule API edits', () => {
  it.each(BOOK_RULE_CODES)('validates and audits %s params', async (code) => {
    const fields: Record<string, string> = {
      R17: 'targetBp',
      R18: 'okFromX100',
      R19: 'targetBp',
      R20: 'okMonths',
      R21: 'leverageMaxBp',
      R22: 'maxBp',
    };
    const field = fields[code]!;
    const value = code === 'R20' ? 10 : code === 'R17' || code === 'R19' ? 2600 : 200;
    const response = await call('PATCH', `/rules/${code}`, {
      params: { [field]: value },
      enabled: true,
    });
    expect(response.status).toBe(200);
    expect(response.body.rule.params[field]).toBe(value);
    expect(response.body.rule.enabled).toBe(true);
    expect((await call('PATCH', `/rules/${code}`, { params: { unknown: 1 } })).status).toBe(400);
    expect((await call('PATCH', `/rules/${code}`, { params: { [field]: -1 } })).status).toBe(400);
    expect((await call('POST', '/undo', { groupId: response.body.groupId })).status).toBe(200);
    expect((await call('GET', '/rules')).body.rules.find((r: any) => r.code === code).enabled).toBe(
      false,
    );
  });
  it('private month/year and pension input validates, audits, and never defaults a date', async () => {
    expect((await call('GET', '/rules/inputs')).body.birthMonth).toBe('');
    const saved = await call('PATCH', '/rules/inputs', {
      birthMonth: '1992-07',
      pension: [{ month: '2026-03', amountCents: 0 }],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.pension).toEqual([{ month: '2026-03', amountCents: 0 }]);
    expect((await call('PATCH', '/rules/inputs', { birthMonth: '2100-01' })).status).toBe(400);
    expect(
      (await call('PATCH', '/rules/inputs', { pension: [{ month: '2026-03', amountCents: -1 }] }))
        .status,
    ).toBe(400);
    expect(
      (
        await call('PATCH', '/rules/inputs', {
          pension: [
            { month: '2026-03', amountCents: 1 },
            { month: '2026-03', amountCents: 2 },
          ],
        })
      ).status,
    ).toBe(400);
    expect((await call('POST', '/undo', { groupId: saved.body.groupId })).status).toBe(200);
    expect((await call('GET', '/rules/inputs')).body).toEqual({ birthMonth: '', pension: [] });
  });
});
