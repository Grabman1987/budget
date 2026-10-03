import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { auditLog, employerPension, security } from '../schema';
import { getBookSettings, saveBookSettings } from './book-settings';
import {
  applyInstrumentFacts,
  parseInstrumentFactsFile,
  type InstrumentFactsResult,
  type SecurityFactsSkipped,
} from './operator-instrument-facts';
import { listAuditGroups, OperatorInputError, undoAuditGroups } from './operator-ops';
import { createSecurity, getSecurity } from './securities';
import { testCtx } from './test-helpers';

const operator = { actor: 'operator' };
const TODAY = '2026-10-03';
const SINCE = '2000-01-01T00:00:00.000Z';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  createSecurity(
    db,
    { id: 'a', name: 'Synthetic A', kind: 'etf', isin: 'XX0000000001', terBp: 20 },
    testCtx,
  );
  createSecurity(
    db,
    { id: 'b', name: 'Synthetic B', kind: 'etf', isin: 'XX0000000019', leverageFactor: 20 },
    testCtx,
  );
});
afterEach(() => opened.close());

const run = (json: unknown, dryRun = false) =>
  applyInstrumentFacts(db, parseInstrumentFactsFile(json, TODAY), operator, {
    dryRun,
    today: TODAY,
  });
const auditCount = () => db.select().from(auditLog).all().length;
const operatorGroups = () =>
  listAuditGroups(db, { since: SINCE }).filter((g) => g.actor === 'operator');
const facts = (id: string) => {
  const row = getSecurity(db, id)!;
  return { terBp: row.terBp, leverage: row.leverageFactor };
};
const withoutGroups = (r: InstrumentFactsResult) =>
  JSON.parse(JSON.stringify(r).replace(/"groupId":"[^"]*"/g, '"groupId":""'));

describe('parseInstrumentFactsFile', () => {
  it('accepts an empty object and normalises ISINs', () => {
    expect(parseInstrumentFactsFile({})).toEqual({ securities: [], employerPension: [] });
    expect(
      parseInstrumentFactsFile({ securities: [{ isin: ' xx0000000001 ', terBp: null }] }),
    ).toEqual({ securities: [{ isin: 'XX0000000001' }], employerPension: [] });
  });

  it.each([
    [[], 'JSON object'],
    [{ other: 1 }, 'unknown key'],
    [{ securities: {} }, 'must be a list'],
    [{ securities: [{ isin: 'short' }] }, 'ISIN'],
    [{ securities: [{ isin: 'XX0000000001', terBp: 1.5 }] }, 'terBp'],
    [{ securities: [{ isin: 'XX0000000001', terBp: 10_001 }] }, 'terBp'],
    [{ securities: [{ isin: 'XX0000000001', leverageFactorTenths: 9 }] }, 'leverageFactorTenths'],
    [
      { securities: [{ isin: 'XX0000000001', leverageFactorTenths: 1001 }] },
      'leverageFactorTenths',
    ],
    [{ securities: [{ isin: 'XX0000000001' }, { isin: 'xx0000000001' }] }, 'twice'],
    [{ bookSettings: [] }, 'bookSettings must be an object'],
    [{ bookSettings: { other: 1 } }, 'unknown key'],
    [{ bookSettings: { birthYear: 1899 } }, 'birthYear'],
    [{ bookSettings: { birthYear: 2027 } }, 'birthYear'],
    [{ bookSettings: { birthYear: 1990.5 } }, 'birthYear'],
    [{ bookSettings: { birthMonth: 0 } }, 'birthMonth'],
    [{ bookSettings: { birthMonth: 13 } }, 'birthMonth'],
    [{ employerPension: [{ month: '2026-13', amountCents: 1 }] }, 'YYYY-MM'],
    [{ employerPension: [{ month: '2026-01', amountCents: -1 }] }, 'amountCents'],
    [{ employerPension: [{ month: '2026-01', amountCents: 1.5 }] }, 'amountCents'],
    [
      {
        employerPension: [
          { month: '2026-01', amountCents: 1 },
          { month: '2026-01', amountCents: 2 },
        ],
      },
      'twice',
    ],
  ])('rejects %j', (json, message) => {
    expect(() => parseInstrumentFactsFile(json, TODAY)).toThrow(OperatorInputError);
    expect(() => parseInstrumentFactsFile(json, TODAY)).toThrow(message);
  });
});

describe('applyInstrumentFacts: securities', () => {
  it('updates only non-null fields, one audit group per entry', () => {
    const result = run({
      securities: [
        { isin: 'XX0000000001', terBp: 35, leverageFactorTenths: null },
        { isin: 'XX0000000019', terBp: null, leverageFactorTenths: 30 },
      ],
    });
    expect(result.securities.map((o) => o.status)).toEqual(['updated', 'updated']);
    expect(facts('a')).toEqual({ terBp: 35, leverage: 10 });
    expect(facts('b')).toEqual({ terBp: 0, leverage: 30 });
    const groups = operatorGroups();
    expect(groups).toHaveLength(2);
    expect(
      new Set(result.securities.map((o) => (o.status === 'updated' ? o.groupId : ''))),
    ).toEqual(new Set(groups.map((g) => g.groupId)));
  });

  it('writes both fields of one security in a single group', () => {
    run({ securities: [{ isin: 'XX0000000001', terBp: 40, leverageFactorTenths: 20 }] });
    expect(facts('a')).toEqual({ terBp: 40, leverage: 20 });
    expect(operatorGroups()).toHaveLength(1);
  });

  it('reports equal values as unchanged and writes nothing', () => {
    const before = auditCount();
    const result = run({
      securities: [
        { isin: 'XX0000000001', terBp: 20, leverageFactorTenths: 10 },
        { isin: 'XX0000000019' },
      ],
    });
    expect(result.securities.map((o) => o.status)).toEqual(['unchanged', 'unchanged']);
    expect(auditCount()).toBe(before);
  });

  it('skips unknown and ambiguous ISINs with a reason and still applies the rest', () => {
    createSecurity(
      db,
      { id: 'c', name: 'Synthetic C', kind: 'etf', isin: 'XX0000000027' },
      testCtx,
    );
    // The repo refuses a second live security with the same ISIN; force one to cover the guard.
    db.update(security).set({ isin: 'XX0000000001' }).where(eq(security.id, 'c')).run();
    const result = run({
      securities: [
        { isin: 'XX0000000001', terBp: 5 },
        { isin: 'XX0000000035', terBp: 5 },
        { isin: 'XX0000000019', terBp: 9 },
      ],
    });
    const [dup, unknown, ok] = result.securities as SecurityFactsSkipped[];
    expect(dup).toMatchObject({ status: 'skipped', reason: 'ambiguous_isin', candidates: 2 });
    expect(unknown).toMatchObject({ status: 'skipped', reason: 'unknown_isin', candidates: 0 });
    expect(ok!.status).toBe('updated');
    expect(facts('a').terBp).toBe(20);
    expect(facts('b').terBp).toBe(9);
  });

  it('does not match a soft-deleted security', () => {
    db.update(security)
      .set({ deletedAt: '2026-01-01T00:00:00.000Z' })
      .where(eq(security.id, 'a'))
      .run();
    expect(run({ securities: [{ isin: 'XX0000000001', terBp: 5 }] }).securities[0]).toMatchObject({
      reason: 'unknown_isin',
    });
  });

  it('a dry run reports what the real run does and writes nothing', () => {
    const json = {
      securities: [
        { isin: 'XX0000000001', terBp: 35 },
        { isin: 'XX0000000019', leverageFactorTenths: 20 },
        { isin: 'XX0000000043', terBp: 1 },
      ],
      employerPension: [{ month: '2026-01', amountCents: 5_000 }],
    };
    const before = auditCount();
    const dry = run(json, true);
    expect(auditCount()).toBe(before);
    expect(facts('a').terBp).toBe(20);
    expect(getBookSettings(db).pension).toEqual([]);
    expect(dry.securities.map((o) => o.status)).toEqual(['updated', 'unchanged', 'skipped']);
    expect(dry.securities[0]).toMatchObject({ groupId: '', changes: ['terBp 20 -> 35'] });
    expect(dry.pension[0]).toMatchObject({ status: 'upserted', groupId: '' });
    expect(withoutGroups(dry)).toEqual(withoutGroups(run(json)));
  });

  it('undoes one entry on its own with undo-group', () => {
    const result = run({
      securities: [
        { isin: 'XX0000000001', terBp: 35 },
        { isin: 'XX0000000019', terBp: 15 },
      ],
    });
    undoAuditGroups(db, [(result.securities[0] as { groupId: string }).groupId], operator);
    expect(facts('a').terBp).toBe(20);
    expect(facts('b').terBp).toBe(15);
  });
});

describe('applyInstrumentFacts: employer pension', () => {
  it('creates and keeps months, one audit group per written month', () => {
    saveBookSettings(db, { pension: [{ month: '2026-02', amountCents: 100 }] }, testCtx, TODAY);
    const result = run({
      employerPension: [
        { month: '2026-01', amountCents: 0 },
        { month: '2026-02', amountCents: 100 },
        { month: '2026-03', amountCents: 250 },
      ],
    });
    expect(result.pension.map((o) => [o.month, o.status, o.detail])).toEqual([
      ['2026-01', 'upserted', 'created'],
      ['2026-02', 'unchanged', 'same amount'],
      ['2026-03', 'upserted', 'created'],
    ]);
    expect(getBookSettings(db).pension).toEqual([
      { month: '2026-01', amountCents: 0 },
      { month: '2026-02', amountCents: 100 },
      { month: '2026-03', amountCents: 250 },
    ]);
    expect(operatorGroups()).toHaveLength(2);
  });

  it('changes an existing amount and restores a deleted month', () => {
    saveBookSettings(db, { pension: [{ month: '2026-02', amountCents: 100 }] }, testCtx, TODAY);
    saveBookSettings(db, { pension: [{ month: '2026-04', amountCents: 300 }] }, testCtx, TODAY);
    db.update(employerPension)
      .set({ deletedAt: sql`'2026-05-01T00:00:00.000Z'` })
      .where(eq(employerPension.month, '2026-04'))
      .run();
    const result = run({
      employerPension: [
        { month: '2026-02', amountCents: 150 },
        { month: '2026-04', amountCents: 300 },
      ],
    });
    expect(result.pension.map((o) => o.detail)).toEqual(['changed', 'restored']);
    expect(getBookSettings(db).pension).toEqual([
      { month: '2026-02', amountCents: 150 },
      { month: '2026-04', amountCents: 300 },
    ]);
  });

  it('undoes one month on its own', () => {
    const result = run({
      employerPension: [
        { month: '2026-01', amountCents: 10 },
        { month: '2026-02', amountCents: 20 },
      ],
    });
    undoAuditGroups(db, [result.pension[0]!.groupId], operator);
    expect(getBookSettings(db).pension).toEqual([{ month: '2026-02', amountCents: 20 }]);
  });
});

describe('applyInstrumentFacts: bookSettings', () => {
  const stored = () => getBookSettings(db).birthMonth;

  it('is absent from the result when the file has no bookSettings', () => {
    expect(run({}).settings).toBeNull();
  });

  it('sets year and month together, in one audit group', () => {
    const result = run({ bookSettings: { birthYear: 1985, birthMonth: 7 } });
    expect(result.settings).toMatchObject({ status: 'updated', birthMonth: '1985-07' });
    expect(stored()).toBe('1985-07');
    expect(operatorGroups()).toHaveLength(1);
  });

  it('writes only the provided field and keeps the other', () => {
    saveBookSettings(db, { birthMonth: '1985-07' }, testCtx, TODAY);
    expect(run({ bookSettings: { birthMonth: 11 } }).settings).toMatchObject({
      status: 'updated',
      birthMonth: '1985-11',
    });
    expect(run({ bookSettings: { birthYear: 1990, birthMonth: null } }).settings).toMatchObject({
      status: 'updated',
      birthMonth: '1990-11',
    });
    expect(stored()).toBe('1990-11');
  });

  it('reports an equal value as unchanged and writes nothing', () => {
    saveBookSettings(db, { birthMonth: '1985-07' }, testCtx, TODAY);
    const before = auditCount();
    expect(run({ bookSettings: { birthYear: 1985, birthMonth: 7 } }).settings).toMatchObject({
      status: 'unchanged',
      birthMonth: '1985-07',
    });
    expect(run({ bookSettings: {} }).settings?.status).toBe('unchanged');
    expect(auditCount()).toBe(before);
  });

  it('skips a single field when no birth month is stored yet', () => {
    const before = auditCount();
    expect(run({ bookSettings: { birthYear: 1985 } }).settings).toMatchObject({
      status: 'skipped',
    });
    expect(auditCount()).toBe(before);
  });

  it('skips a date the app refuses as implausible (in the future)', () => {
    const result = run({ bookSettings: { birthYear: 2026, birthMonth: 12 } });
    expect(result.settings).toMatchObject({ status: 'skipped' });
    expect(result.settings?.detail).toContain('refused_by_rules');
    expect(stored()).not.toBe('2026-12');
  });

  it('a dry run reports the update and writes nothing', () => {
    const before = auditCount();
    const dry = run({ bookSettings: { birthYear: 1985, birthMonth: 7 } }, true);
    expect(dry.settings).toMatchObject({ status: 'updated', groupId: '' });
    expect(auditCount()).toBe(before);
    expect(stored()).not.toBe('1985-07');
    expect(withoutGroups(dry)).toEqual(
      withoutGroups(run({ bookSettings: { birthYear: 1985, birthMonth: 7 } })),
    );
  });

  it('can be undone on its own', () => {
    saveBookSettings(db, { birthMonth: '1980-01' }, testCtx, TODAY);
    const result = run({ bookSettings: { birthYear: 1985, birthMonth: 7 } });
    undoAuditGroups(db, [result.settings!.groupId], operator);
    expect(stored()).toBe('1980-01');
  });
});
