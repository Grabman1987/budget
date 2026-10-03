import {
  DEFAULT_ACTIVE_RULE_COUNT,
  RULE_CODES,
  BOOK_RULE_CODES,
  CHECKLIST_DEFS,
} from '@budget/domain';
import {
  confirmChecklistItem,
  createTestDatabase,
  ensureDefaultRules,
  evaluateRules,
  financeCheck,
  listRules,
  matchOccurrences,
  refreshOccurrences,
  ruleInputs,
  ruleResults,
  schema,
  undo,
  updateRule,
  type Db,
} from '@budget/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from './seed';

/**
 * The rule engine on the synthetic sample ledger at 17.09.2026. Where the real ledger yields a
 * different figure than the prototype's hardcoded strings, the test states the real one and the
 * comment says why.
 */
// Evaluating 13 days takes a couple of seconds, more under load.
vi.setConfig({ testTimeout: 60_000 });

const TODAY = '2026-09-17';
const ctx = { actor: 'tester' };

let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
  refreshOccurrences(db, TODAY);
  matchOccurrences(db, TODAY);
  ensureDefaultRules(db);
  evaluateRules(db, TODAY);
}, 120_000);

const latest = (code: string) => listRules(db).rules.find((r) => r.code === code)?.latest;

describe('ensureDefaultRules', () => {
  it('keeps seeded rules and adds the registered disabled rules and checklist', () => {
    const { rules, checklist } = listRules(db);
    expect(rules.map((r) => r.code)).toEqual(RULE_CODES);
    expect(rules.every((r) => r.stage !== null && r.action !== null)).toBe(true);
    expect(rules.filter((r) => r.enabled)).toHaveLength(DEFAULT_ACTIVE_RULE_COUNT);
    expect(rules.filter((r) => !r.enabled).map((r) => r.code)).toEqual(BOOK_RULE_CODES);
    expect(checklist).toHaveLength(CHECKLIST_DEFS.length);
    expect(checklist.find((c) => c.code === 'S1-3')).toMatchObject({
      ruleCode: 'R06',
      confirmedAt: null,
    });
  });

  it('is idempotent and never overwrites a changed parameter or the windfall shares', () => {
    // R12 came with windfall shares from the seed
    expect(listRules(db).rules.find((r) => r.code === 'R12')?.params).toMatchObject({
      windfallShares: { investieren: 0.5, notgroschen: 0.2 },
      enjoyBp: 1000,
    });
    const before = db.select().from(schema.rule).all();
    expect(ensureDefaultRules(db)).toEqual({ created: 0, updated: 0 });
    expect(db.select().from(schema.rule).all()).toEqual(before);
  });
});

describe('sample ledger at 17.09.2026', () => {
  it('R15 spekulativer Anteil is 14,2 % and verletzt, as in the prototype', () => {
    expect(latest('R15')).toMatchObject({ status: 'bad', valueText: '14,2 %', actionNeeded: true });
    expect(latest('R15')?.actionText).toContain('Sparplan nur ETF');
  });

  it('R14 Klumpenrisiko: the largest position is 4,5 %, as in the prototype', () => {
    expect(latest('R14')).toMatchObject({ status: 'ok', valueText: 'größte Position 4,5 %' });
  });

  it('R13 Asset Allocation: Schwellenländer −4,0 Pp warn, as in the prototype', () => {
    expect(latest('R13')).toMatchObject({ status: 'warn', valueText: 'Schwellenländer −4,0 Pp' });
  });

  it('R01 50/30/20 warns, spending from savings; R02 Notgroschen is verletzt', () => {
    expect(latest('R01')).toMatchObject({
      status: 'warn',
      valueText: '54 / 30 / 22 % · aus Guthaben −6 %',
    });
    // The prototype hardcodes "2,4 Monate"; reserve 7.739 € over the real average Bedarf is 2,5.
    expect(latest('R02')).toMatchObject({ status: 'bad', valueText: '2,5 Monate' });
  });

  it('R03 Geldalter: FIFO over the real ledger, the prototype hardcodes 18 days', () => {
    expect(latest('R03')?.valueText).toBe('Geldalter 47 Tage');
    expect(latest('R03')?.status).toBe('ok');
  });

  it('R07 the 90-day low point stays above 0 (the prototype sample low is 145 €)', () => {
    expect(latest('R07')).toMatchObject({ status: 'ok', valueText: 'Tiefpunkt 21 €' });
  });

  it('R08, R10, R09: quotas from the real contracts, Sondertilgung active', () => {
    // Prototype strings: 10,8 % (rate over salary only) and 37,7 %; here rates over all regular income.
    expect(latest('R08')).toMatchObject({ status: 'ok', valueText: '7,2 %' });
    expect(latest('R10')).toMatchObject({ status: 'ok', valueText: '39,6 %' });
    expect(latest('R09')).toMatchObject({ status: 'ok', valueText: 'Sondertilgung aktiv' });
  });

  it('R11, R12, R16', () => {
    expect(latest('R11')).toMatchObject({
      status: 'ok',
      valueText: 'Ausgaben +2,7 % · Einkommen +3,1 %',
    });
    expect(latest('R12')).toMatchObject({ status: 'ok', valueText: 'Sonderzahlung verteilt' });
    // The prototype shows 8,9 %: its annual spend is lower than 12 months of Bedarf plus Wunsch.
    expect(latest('R16')).toMatchObject({ status: 'ok', valueText: '6,2 %' });
  });

  it('R04, R05, R06 follow the sample budget: unfunded Notgroschen, thin September assignments, overspent card envelope', () => {
    expect(latest('R04')).toMatchObject({
      status: 'warn',
      valueText: '2 von 2 Gehältern ohne gefüllte Zukunft',
    });
    expect(latest('R05')).toMatchObject({ status: 'bad', valueText: '1 von 5 gedeckt' });
    expect(latest('R06')).toMatchObject({ status: 'bad', valueText: '1 Karte nicht gedeckt' });
  });
});

describe('evaluateRules', () => {
  it('stores today and the last 12 month ends, idempotent per (rule, day)', () => {
    const count = () => db.select().from(schema.ruleResult).all().length;
    const before = count();
    const run = evaluateRules(db, TODAY);
    expect(run.days).toHaveLength(13);
    expect(run.days[12]).toBe(TODAY);
    expect(run.days[11]).toBe('2026-08-31');
    expect(count()).toBe(before);
    const matrix = ruleResults(db, '2025-09-30', TODAY);
    expect(matrix.rules).toHaveLength(DEFAULT_ACTIVE_RULE_COUNT);
    expect(matrix.days).toContain('2026-08-31');
    const r15 = matrix.rules.find((r) => r.code === 'R15')!;
    expect(r15.cells.at(-1)).toMatchObject({ asOf: TODAY, status: 'bad' });
  });

  it('a rule without data stores nothing for that day', () => {
    // before the budget starts nothing can be judged
    const matrix = ruleResults(db, '2023-01-01', '2023-12-31');
    expect(matrix.days).toEqual([]);
  });
});

describe('financeCheck', () => {
  it('counts, the six key rules by severity, stage and checklist', () => {
    const c = financeCheck(db, TODAY);
    expect(c.counts).toEqual({
      ok: 9,
      warn: 3,
      bad: 4,
      total: DEFAULT_ACTIVE_RULE_COUNT,
      notEvaluated: 0,
    });
    // bad first (R02, R15), then warn (R01, R03 is ok here), ties in the key order of Heute
    expect(c.keyRules.map((r) => r.status)).toEqual(
      [...c.keyRules.map((r) => r.status)].sort(
        (a, b) => ({ bad: 0, warn: 1, ok: 2 })[a] - { bad: 0, warn: 1, ok: 2 }[b],
      ),
    );
    expect(c.keyRules.slice(0, 2).map((r) => r.code)).toEqual(['R02', 'R15']);
    expect(c.keyRules).toHaveLength(6);
    expect(c.stage).toMatchObject({ stage: 2, label: 'Aufbau' });
    expect(c.netWorthCents).toBe(8_473_000);
    expect(c.checklist.total).toBe(14);
  });
});

describe('editing', () => {
  it('a threshold flips the status, undo brings it back', () => {
    expect(latest('R10')?.status).toBe('ok');
    const edit = updateRule(db, 'R10', { params: { maxBp: 3000 } }, ctx);
    expect(edit.params).toMatchObject({ maxBp: 3000, badOverBp: 1000 });
    evaluateRules(db, TODAY);
    expect(latest('R10')).toMatchObject({ status: 'warn', valueText: '39,6 %' });

    const entry = db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityType, 'rule'))
      .all()
      .at(-1)!;
    undo(db, { auditId: entry.id }, ctx);
    expect(listRules(db).rules.find((r) => r.code === 'R10')?.params).toMatchObject({
      maxBp: 5500,
    });
    evaluateRules(db, TODAY);
    expect(latest('R10')?.status).toBe('ok');
  });

  it('rejects unknown keys and out-of-range values', () => {
    expect(() => updateRule(db, 'R10', { params: { nope: 1 } }, ctx)).toThrow();
    expect(() => updateRule(db, 'R10', { params: { maxBp: -1 } }, ctx)).toThrow();
    expect(() => updateRule(db, 'R99', { enabled: false }, ctx)).toThrow();
  });

  it('a disabled rule disappears from the check and the matrix', () => {
    updateRule(db, 'R15', { enabled: false }, ctx);
    evaluateRules(db, TODAY);
    const c = financeCheck(db, TODAY);
    expect(c.counts.total).toBe(DEFAULT_ACTIVE_RULE_COUNT - 1);
    expect(c.counts.bad).toBe(3);
    expect(c.keyRules.map((r) => r.code)).not.toContain('R15');
    expect(ruleResults(db, '2025-09-30', TODAY).rules.map((r) => r.code)).not.toContain('R15');
    updateRule(db, 'R15', { enabled: true }, ctx);
    evaluateRules(db, TODAY);
    expect(financeCheck(db, TODAY).counts.total).toBe(DEFAULT_ACTIVE_RULE_COUNT);
  });
});

describe('stage checklist', () => {
  it('a confirmed item counts in the Finanz-Check; rule-backed items cannot be confirmed by hand', () => {
    const before = financeCheck(db, TODAY).checklist.done;
    const item = confirmChecklistItem(db, 'S2-6', true, ctx, () => '2026-09-17T08:00:00.000Z');
    expect(item).toMatchObject({ code: 'S2-6', confirmedAt: '2026-09-17T08:00:00.000Z' });
    const check = financeCheck(db, TODAY).checklist;
    expect(check.done).toBe(before + 1);
    expect(check.items.find((i) => i.code === 'S2-6')).toMatchObject({
      basis: 'manual',
      status: 'ok',
      done: true,
    });
    expect(() => confirmChecklistItem(db, 'S1-3', true, ctx)).toThrow(/follows rule R06/);
    expect(confirmChecklistItem(db, 'S2-6', false, ctx).confirmedAt).toBeNull();
    expect(financeCheck(db, TODAY).checklist.done).toBe(before);
  });
});

describe('ruleInputs', () => {
  it('is the one place that assembles inputs: positions carry kind, class and the security institution', () => {
    const i = ruleInputs(db, TODAY);
    expect(i.refMonth).toBe('2026-08');
    expect(i.positions.length).toBeGreaterThan(3);
    const crypto = i.positions.find((p) => p.kind === 'crypto');
    expect(crypto?.platform).toBeTruthy();
    expect(Object.keys(i.names.platforms).length).toBeGreaterThan(0);
  });
});
