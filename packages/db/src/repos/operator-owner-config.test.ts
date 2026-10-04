import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  appSetting,
  auditLog,
  booking,
  bookingSplit,
  categoryGroup,
  expectedOccurrence,
  rule,
  securityExposureVersion,
  securityAssetExposure,
} from '../schema';
import { getBookSettings } from './book-settings';
import { createBooking, getBooking } from './bookings';
import { accounts, categories, createEntity, getEntity } from './entities';
import { accountSummaries } from './ledger-queries';
import { readSourceMappings, saveReadSourceState } from './read-source';
import { createExpectedPayment, listExpectedPayments, listExpectedVersions } from './expected';
import {
  applyOwnerConfig,
  parseOwnerConfigFile,
  summarizeOwnerConfig,
  type OwnerConfigOutcome,
} from './operator-owner-config';
import { listAuditGroups, OperatorInputError, undoAuditGroups } from './operator-ops';
import { getProfile } from './profile';
import { ensureDefaultRules } from './rules';
import {
  createAssetClass,
  listAssetClasses,
  createSecurity,
  getSecurity,
  listSecurities,
  deleteSecurity,
} from './securities';
import { seedBasics, testCtx } from './test-helpers';

const operator = { actor: 'operator' };
const TODAY = '2026-03-20';
const SINCE = '2000-01-01T00:00:00.000Z';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
  ensureDefaultRules(db);
  createAssetClass(db, { id: 'ac1', name: 'Aktien Welt', sortOrder: 1 }, testCtx);
  createAssetClass(db, { id: 'ac2', name: 'Anleihen', sortOrder: 2 }, testCtx);
  createSecurity(
    db,
    { id: 's1', name: 'Synthetic A', kind: 'etf', isin: 'XX0000000001', assetClassId: 'ac1' },
    testCtx,
  );
});
afterEach(() => opened.close());

const run = (json: unknown, dryRun = false) =>
  applyOwnerConfig(db, parseOwnerConfigFile(json, TODAY), operator, { dryRun, today: TODAY });
const auditCount = () => db.select().from(auditLog).all().length;
const operatorGroups = () =>
  listAuditGroups(db, { since: SINCE }).filter((g) => g.actor === 'operator');
const statuses = (outcomes: OwnerConfigOutcome[]) => outcomes.map((o) => o.status);
const withoutGroups = (o: OwnerConfigOutcome[]) => o.map((x) => ({ ...x, groupId: '' }));

describe('parseOwnerConfigFile', () => {
  it('accepts an empty object', () => {
    expect(parseOwnerConfigFile({}, TODAY)).toEqual({});
  });

  it.each([
    [[], 'must be an object'],
    [{ other: 1 }, 'unknown key'],
    [{ createSecurities: [{ name: 'Synthetic', kind: 'unknown' }] }, 'createSecurities[0].kind'],
    [{ createSecurities: [{ name: '', kind: 'crypto' }] }, 'createSecurities[0].name'],
    [
      { createSecurities: [{ name: 'Synthetic', kind: 'crypto', currency: null }] },
      'createSecurities[0].currency',
    ],
    [
      { createSecurities: [{ name: 'Synthetic', kind: 'crypto', currency: 'eur' }] },
      'createSecurities[0].currency',
    ],
    [
      { createSecurities: [{ name: 'Synthetic', kind: 'crypto', isin: 'invalid' }] },
      'createSecurities[0].isin',
    ],
    [
      { createSecurities: [{ name: 'Synthetic', kind: 'crypto', pricesEnabled: 1 }] },
      'createSecurities[0].pricesEnabled',
    ],
    [
      { createSecurities: [{ name: 'Synthetic', kind: 'crypto', extra: 1 }] },
      'createSecurities[0]',
    ],
    [
      { cryptoMappings: [{ key: 'unknown:synthetic', account: 'Dollar' }] },
      'cryptoMappings[0].key',
    ],
    [
      { cryptoMappings: [{ key: 'asset:synthetic', account: 'Dollar' }] },
      'cryptoMappings[0].security',
    ],
    [
      {
        cryptoMappings: [{ key: 'currency:synthetic', account: 'Dollar', security: 'Synthetic A' }],
      },
      'cryptoMappings[0].security',
    ],
    [{ cryptoMappings: [{ key: 'currency:synthetic', account: '' }] }, 'cryptoMappings[0].account'],
    [{ splitCategories: [{ splitId: 'synthetic' }] }, 'splitCategories[0].category'],
    [{ splitCategories: [{ splitId: '', category: 'Essen' }] }, 'splitCategories[0].splitId'],
    [
      { splitCategories: [{ splitId: 'synthetic', category: 'Essen', contact: false }] },
      'splitCategories[0].contact',
    ],
    [
      { splitCategories: [{ splitId: 'synthetic', category: 'Essen', amountCents: 1 }] },
      'splitCategories[0]',
    ],
    [{ profile: { name: '' } }, 'profile.name'],
    [{ profile: { birthDate: '2999-01-01' } }, 'profile.birthDate'],
    [{ profile: { birthDate: '1990-02-30' } }, 'profile.birthDate'],
    [{ profile: { householdSize: 0 } }, 'householdSize'],
    [{ profile: { country: 'Neverland' } }, 'profile.country'],
    [{ profile: { region: 'Atlantis' } }, 'profile.region'],
    [{ profile: { extra: 1 } }, 'unknown key'],
    [{ rules: { enable: ['R17'], disable: ['r17'] } }, 'listed twice'],
    [{ rules: { enable: 'R17' } }, 'must be a list'],
    [{ categoryStages: [{ category: 'Miete', stage: 10 }] }, 'stage'],
    [{ categoryStages: [{ category: 'Miete', stage: 0 }] }, 'stage'],
    [
      {
        categoryStages: [
          { category: 'Miete', stage: 1 },
          { category: 'miete', stage: 2 },
        ],
      },
      'listed twice',
    ],
    [{ assetClasses: { rename: [{ from: 'A' }] } }, 'rename[0].to'],
    [{ securities: [{ quoteUrl: 'https://example.org/x' }] }, 'isin or a name'],
    [{ securities: [{ isin: 'XX0000000001' }] }, 'nothing to set'],
    [{ securities: [{ isin: 'XX0000000001', quoteUrl: 'http://example.org' }] }, 'https'],
    [{ securities: [{ isin: 'XX0000000001', pricesEnabled: 'yes' }] }, 'pricesEnabled'],
    [{ expectedPayments: [{ name: 'X' }] }, 'kind'],
    [{ skipOccurrences: [{ name: 'X', month: '2026-13', reason: 'r' }] }, 'YYYY-MM'],
    [{ skipOccurrences: [{ name: 'X', month: '2026-01', reason: '' }] }, 'reason'],
    [{ clearBookings: { before: '2026-1-1' } }, 'clearBookings.before'],
    [{ clearBookings: { before: '2026-01-01', accounts: ['A', 'a'] } }, 'listed twice'],
  ])('rejects %j', (json, message) => {
    expect(() => parseOwnerConfigFile(json, TODAY)).toThrow(OperatorInputError);
    expect(() => parseOwnerConfigFile(json, TODAY)).toThrow(message);
  });

  it('needs a due month for a yearly payment', () => {
    expect(() =>
      parseOwnerConfigFile(
        {
          expectedPayments: [
            {
              name: 'Versicherung',
              kind: 'outflow',
              accountName: 'Giro',
              rhythm: 'yearly',
              dueDay: 5,
              startDate: '2026-01-01',
              amountCents: 10_000,
            },
          ],
        },
        TODAY,
      ),
    ).toThrow('dueMonth');
  });
});

describe('profile', () => {
  const profile = {
    name: 'Anna Muster',
    birthDate: '1990-06-15',
    country: 'AT',
    region: 'Wien',
    householdSize: 2,
  };

  it('writes the profile fields and keeps birth_month in step, in one group', () => {
    const outcomes = run({ profile });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ section: 'profile', status: 'updated' });
    expect(outcomes[0]!.detail).not.toContain('Anna');
    expect(getProfile(db)).toMatchObject({
      name: 'Anna Muster',
      birthDate: '1990-06-15',
      region: 'AT-9',
      household: 2,
    });
    expect(getEntity(db, appSetting, 'profile.birth_month')?.value).toBe('1990-06');
    expect(getBookSettings(db).birthMonth).toBe('1990-06');
    expect(operatorGroups()).toHaveLength(1);
  });

  it('is idempotent and re-aligns a stale birth_month', () => {
    run({ profile });
    const before = auditCount();
    expect(statuses(run({ profile }))).toEqual(['unchanged']);
    expect(auditCount()).toBe(before);
    db.update(appSetting)
      .set({ value: '1991-01' })
      .where(eq(appSetting.id, 'profile.birth_month'))
      .run();
    const fixed = run({ profile });
    expect(fixed[0]).toMatchObject({ status: 'updated', detail: 'birthMonth' });
    expect(getBookSettings(db).birthMonth).toBe('1990-06');
  });

  it('dry run writes nothing, undo restores the previous profile', () => {
    const before = auditCount();
    const dry = run({ profile }, true);
    expect(statuses(dry)).toEqual(['updated']);
    expect(auditCount()).toBe(before);
    expect(getProfile(db).name).toBe('');
    const real = run({ profile });
    undoAuditGroups(db, [real[0]!.groupId], operator);
    expect(getProfile(db).name).toBe('');
    expect(getProfile(db).household).toBeNull();
    expect(getBookSettings(db).birthMonth).toBe('');
  });
});

describe('rules', () => {
  const enabled = (code: string) =>
    db.select().from(rule).where(eq(rule.code, code)).get()?.enabled;

  it('enables and disables by code, skips unknown codes with exit-3 semantics', () => {
    expect(enabled('R17')).toBe(false);
    expect(enabled('R01')).toBe(true);
    const outcomes = run({ rules: { enable: ['R17', 'R99'], disable: ['R01'] } });
    expect(outcomes.map((o) => [o.key, o.status, o.reason])).toEqual([
      ['R17', 'updated', ''],
      ['R99', 'skipped', 'unknown_rule'],
      ['R01', 'updated', ''],
    ]);
    expect(enabled('R17')).toBe(true);
    expect(enabled('R01')).toBe(false);
    expect(operatorGroups()).toHaveLength(1);
  });

  it('is idempotent and undoable per entry', () => {
    const first = run({ rules: { enable: ['R17'] } });
    expect(statuses(run({ rules: { enable: ['R17'] } }))).toEqual(['unchanged']);
    undoAuditGroups(db, [first[0]!.groupId], operator);
    expect(enabled('R17')).toBe(false);
  });

  it('dry run changes nothing', () => {
    const before = auditCount();
    expect(statuses(run({ rules: { enable: ['R17'] } }, true))).toEqual(['updated']);
    expect(enabled('R17')).toBe(false);
    expect(auditCount()).toBe(before);
  });
});

describe('categoryStages', () => {
  const stage = (id: string) => categories.get(db, id)?.stage ?? null;

  it('sets and clears stages by exact name; unknown and ambiguous names are skipped', () => {
    categories.create(db, { id: 'dup1', name: 'Doppelt', groupId: 'g', class: 'need' }, testCtx);
    categories.create(db, { id: 'dup2', name: 'Doppelt', groupId: 'g', class: 'need' }, testCtx);
    const outcomes = run({
      categoryStages: [
        { category: 'Miete', stage: 1 },
        { category: 'Essen', stage: 2 },
        { category: 'Nirgends', stage: 3 },
        { category: 'Doppelt', stage: 4 },
      ],
    });
    expect(outcomes.map((o) => [o.key, o.status, o.reason])).toEqual([
      ['Miete', 'updated', ''],
      ['Essen', 'updated', ''],
      ['Nirgends', 'skipped', 'unknown_category'],
      ['Doppelt', 'skipped', 'ambiguous_category'],
    ]);
    expect(stage('miete')).toBe(1);
    expect(stage('essen')).toBe(2);
    const cleared = run({ categoryStages: [{ category: 'Miete', stage: null }] });
    expect(cleared[0]).toMatchObject({ status: 'updated', detail: 'stage 1 -> none' });
    expect(stage('miete')).toBeNull();
  });

  it('is idempotent, dry run safe and undoable', () => {
    const first = run({ categoryStages: [{ category: 'Miete', stage: 5 }] });
    expect(statuses(run({ categoryStages: [{ category: 'Miete', stage: 5 }] }))).toEqual([
      'unchanged',
    ]);
    const before = auditCount();
    run({ categoryStages: [{ category: 'Essen', stage: 6 }] }, true);
    expect(auditCount()).toBe(before);
    expect(stage('essen')).toBeNull();
    undoAuditGroups(db, [first[0]!.groupId], operator);
    expect(stage('miete')).toBeNull();
  });
});

describe('assetClasses', () => {
  const names = () => listAssetClasses(db).map((c) => c.name);

  it('renames, treats a finished rename as unchanged, skips unknown and taken names', () => {
    const outcomes = run({
      assetClasses: {
        rename: [
          { from: 'Aktien Welt', to: 'Aktien' },
          { from: 'Nirgends', to: 'Egal' },
          { from: 'Anleihen', to: 'Aktien' },
        ],
      },
    });
    expect(outcomes.map((o) => [o.status, o.reason])).toEqual([
      ['updated', ''],
      ['skipped', 'unknown_asset_class'],
      ['skipped', 'name_taken'],
    ]);
    expect(names()).toEqual(['Aktien', 'Anleihen']);
    expect(
      statuses(run({ assetClasses: { rename: [{ from: 'Aktien Welt', to: 'Aktien' }] } })),
    ).toEqual(['unchanged']);
  });
});

describe('securities', () => {
  const sec = () => getSecurity(db, 's1')!;

  it('sets the quote configuration by ISIN or name and is idempotent', () => {
    const json = {
      securities: [
        {
          isin: 'XX0000000001',
          quoteUrl: 'https://example.org/quote',
          symbol: 'SYNA',
          pricesEnabled: false,
        },
        { name: 'Unbekannt', symbol: 'X' },
      ],
    };
    const outcomes = run(json);
    expect(outcomes.map((o) => [o.status, o.reason])).toEqual([
      ['updated', ''],
      ['skipped', 'unknown_security'],
    ]);
    expect(sec()).toMatchObject({
      quoteUrl: 'https://example.org/quote',
      symbol: 'SYNA',
      pricesEnabled: false,
    });
    expect(run({ securities: [json.securities[0]!] })[0]!.status).toBe('unchanged');
    expect(statuses(run({ securities: [{ name: 'synthetic a', symbol: 'SYN2' }] }))).toEqual([
      'updated',
    ]);
    expect(sec().symbol).toBe('SYN2');
  });

  it('dry run and undo', () => {
    const before = auditCount();
    run({ securities: [{ isin: 'XX0000000001', symbol: 'Z' }] }, true);
    expect(auditCount()).toBe(before);
    expect(sec().symbol).toBeNull();
    const real = run({ securities: [{ isin: 'XX0000000001', symbol: 'Z' }] });
    undoAuditGroups(db, [real[0]!.groupId], operator);
    expect(sec().symbol).toBeNull();
  });
});

describe('expectedPayments and skipOccurrences', () => {
  const payment = {
    name: 'Miete Wohnung',
    kind: 'outflow',
    accountName: 'Giro',
    categoryName: 'Miete',
    rhythm: 'monthly',
    dueDay: 1,
    startDate: '2026-01-01',
    amountCents: 40_000,
    note: 'synthetic',
  };
  const listed = () => listExpectedPayments(db, TODAY);

  it('creates a payment with its first version, then reports unchanged', () => {
    const outcomes = run({ expectedPayments: [payment] });
    expect(outcomes[0]).toMatchObject({ status: 'created', section: 'expectedPayments' });
    const [row] = listed();
    expect(row).toMatchObject({ name: 'Miete Wohnung', accountId: 'giro', categoryId: 'miete' });
    expect(listExpectedVersions(db, row!.id)).toHaveLength(1);
    const before = auditCount();
    expect(statuses(run({ expectedPayments: [payment] }))).toEqual(['unchanged']);
    expect(auditCount()).toBe(before);
  });

  it('updates fields and adds a version for a new amount, in one group', () => {
    run({ expectedPayments: [payment] });
    const outcomes = run({
      expectedPayments: [{ ...payment, dueDay: 3, amountCents: 42_000, validFrom: '2026-03-01' }],
    });
    expect(outcomes[0]).toMatchObject({
      status: 'updated',
      detail: 'dueDay, amount from 2026-03-01',
    });
    const [row] = listed();
    expect(row!.dueDay).toBe(3);
    expect(listExpectedVersions(db, row!.id).map((v) => [v.validFrom, v.amountCents])).toEqual([
      ['2026-01-01', 40_000],
      ['2026-03-01', 42_000],
    ]);
    expect(operatorGroups()).toHaveLength(2);
    // The amount in force is already the wanted one.
    expect(
      statuses(
        run({
          expectedPayments: [
            { ...payment, dueDay: 3, amountCents: 42_000, validFrom: '2026-03-01' },
          ],
        }),
      ),
    ).toEqual(['unchanged']);
  });

  it('supports income payments by income type and skips unknown references', () => {
    const outcomes = run({
      expectedPayments: [
        {
          name: 'Gehalt',
          kind: 'inflow',
          accountName: 'Giro',
          incomeType: 'Gehalt',
          rhythm: 'monthly',
          dueDay: 28,
          startDate: '2026-01-01',
          amountCents: 300_000,
        },
        { ...payment, name: 'A', accountName: 'Nirgends' },
        { ...payment, name: 'B', categoryName: 'Nirgends' },
        { ...payment, name: 'C', categoryName: undefined, incomeType: 'Nirgends' },
      ],
    });
    expect(outcomes.map((o) => [o.status, o.reason])).toEqual([
      ['created', ''],
      ['skipped', 'unknown_account'],
      ['skipped', 'unknown_category'],
      ['skipped', 'unknown_income_type'],
    ]);
    expect(listed()).toHaveLength(1);
  });

  it('undoes a creation on its own and dry run writes nothing', () => {
    const before = auditCount();
    run({ expectedPayments: [payment] }, true);
    expect(auditCount()).toBe(before);
    expect(listed()).toHaveLength(0);
    const real = run({ expectedPayments: [payment] });
    undoAuditGroups(db, [real[0]!.groupId], operator);
    expect(listed()).toHaveLength(0);
  });

  it('marks one occurrence as missed, idempotently, and refuses unknown ones', () => {
    run({ expectedPayments: [payment] });
    const skip = { name: 'miete wohnung', month: '2026-04', reason: 'Zahlung entfällt' };
    const outcomes = run({
      skipOccurrences: [skip, { ...skip, name: 'Unbekannt' }, { ...skip, month: '2030-01' }],
    });
    expect(outcomes.map((o) => [o.status, o.reason])).toEqual([
      ['updated', ''],
      ['skipped', 'unknown_payment'],
      ['skipped', 'no_occurrence'],
    ]);
    const april = db
      .select()
      .from(expectedOccurrence)
      .all()
      .filter((o) => o.dueDate.startsWith('2026-04'));
    expect(april.map((o) => o.status)).toEqual(['missed']);
    expect(statuses(run({ skipOccurrences: [skip] }))).toEqual(['unchanged']);
    undoAuditGroups(db, [outcomes[0]!.groupId], operator);
    expect(
      db
        .select()
        .from(expectedOccurrence)
        .all()
        .filter((o) => o.dueDate.startsWith('2026-04'))
        .map((o) => o.status),
    ).toEqual(['expected']);
  });

  it('refuses to skip an occurrence that is linked to a booking', () => {
    run({ expectedPayments: [payment] });
    const bookingId = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-01',
        amountCents: -40_000,
        splits: [{ categoryId: 'miete', amountCents: -40_000 }],
      },
      testCtx,
    );
    const occurrence = db
      .select()
      .from(expectedOccurrence)
      .all()
      .find((o) => o.dueDate.startsWith('2026-03'))!;
    db.update(expectedOccurrence)
      .set({ status: 'received', bookingId })
      .where(eq(expectedOccurrence.id, occurrence.id))
      .run();
    const month = occurrence.dueDate.slice(0, 7);
    const outcomes = run({
      skipOccurrences: [{ name: 'Miete Wohnung', month, reason: 'test' }],
    });
    expect(outcomes[0]).toMatchObject({ status: 'skipped', reason: 'linked_occurrence' });
  });
});

describe('clearBookings', () => {
  const ids: Record<string, string> = {};
  const pending = (name: string, accountId: string, date: string) => {
    ids[name] = createBooking(
      db,
      {
        accountId,
        date,
        amountCents: -1_000,
        status: 'pending',
        splits: [{ categoryId: 'essen', amountCents: -1_000 }],
      } as Parameters<typeof createBooking>[1],
      testCtx,
    );
  };
  const status = (name: string) => getBooking(db, ids[name]!)?.status;

  beforeEach(() => {
    pending('b1', 'giro', '2026-01-10');
    pending('b2', 'giro', '2026-02-10');
    pending('b3', 'giro', '2026-02-20');
    pending('b4', 'spar', '2026-01-15');
  });

  it('confirms pending bookings before the day per account, one group per run', () => {
    const outcomes = run({ clearBookings: { before: '2026-02-15' } });
    const byKey = Object.fromEntries(outcomes.map((o) => [o.key, o]));
    expect(byKey['Giro']).toMatchObject({ status: 'updated', detail: '2 bookings confirmed' });
    expect(byKey['Sparen']).toMatchObject({ status: 'updated', detail: '1 booking confirmed' });
    expect(byKey['Dollar']).toMatchObject({ status: 'unchanged' });
    expect([status('b1'), status('b2'), status('b3'), status('b4')]).toEqual([
      'confirmed',
      'confirmed',
      'pending',
      'confirmed',
    ]);
    expect(operatorGroups()).toHaveLength(1);
  });

  it('is limited to the listed accounts, strict before the day, and idempotent', () => {
    const json = { clearBookings: { before: '2026-02-10', accounts: ['Giro', 'Nirgends'] } };
    const outcomes = run(json);
    expect(outcomes.map((o) => [o.key, o.status, o.reason])).toEqual([
      ['Giro', 'updated', ''],
      ['Nirgends', 'skipped', 'unknown_account'],
    ]);
    expect([status('b1'), status('b2'), status('b4')]).toEqual(['confirmed', 'pending', 'pending']);
    expect(statuses(run(json))[0]).toBe('unchanged');
  });

  it('dry run reports the counts and changes nothing; undo restores the whole run', () => {
    const before = auditCount();
    const dry = run({ clearBookings: { before: '2027-01-01' } }, true);
    expect(dry.find((o) => o.key === 'Giro')).toMatchObject({ detail: '3 bookings confirmed' });
    expect(auditCount()).toBe(before);
    expect(db.select().from(booking).where(eq(booking.status, 'pending')).all()).toHaveLength(4);
    const real = run({ clearBookings: { before: '2027-01-01' } });
    undoAuditGroups(db, [real.find((o) => o.key === 'Giro')!.groupId], operator);
    expect([status('b1'), status('b2'), status('b3'), status('b4')]).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });
});

describe('createSecurities', () => {
  it('creates through the exposure path, defaults safely, ignores deleted identities and is idempotent', () => {
    deleteSecurity(db, 's1', testCtx);
    const json = {
      createSecurities: [
        {
          name: 'Synthetic A',
          kind: 'etf',
          isin: 'XX0000000001',
          assetClass: 'Aktien Welt',
          symbol: 'SYN',
        },
        { name: 'Synthetic Coin', kind: 'crypto', currency: 'USD', pricesEnabled: true },
      ],
    };
    const before = auditCount();
    const dry = run(json, true);
    expect(auditCount()).toBe(before);
    expect(listSecurities(db)).toHaveLength(0);
    const real = run(json);
    expect(withoutGroups(dry)).toEqual(withoutGroups(real));
    expect(statuses(real)).toEqual(['created', 'created']);
    const a = listSecurities(db).find((s) => s.isin === 'XX0000000001')!;
    expect(a).toMatchObject({
      currency: 'EUR',
      pricesEnabled: false,
      assetClassId: 'ac1',
      symbol: 'SYN',
    });
    expect(
      db
        .select()
        .from(securityExposureVersion)
        .where(eq(securityExposureVersion.securityId, a.id))
        .get(),
    ).toMatchObject({ complete: true });
    expect(
      db
        .select()
        .from(securityAssetExposure)
        .where(eq(securityAssetExposure.securityId, a.id))
        .get(),
    ).toMatchObject({ assetClassId: 'ac1', weightBp: 10000 });
    const after = auditCount();
    expect(statuses(run(json))).toEqual(['unchanged', 'unchanged']);
    expect(auditCount()).toBe(after);
    undoAuditGroups(db, [real[0]!.groupId], operator);
    expect(listSecurities(db)).toHaveLength(0);
  });

  it('skips conflicting, ambiguous and unknown classes; matches names only without an ISIN', () => {
    createSecurity(db, { name: 'Synthetic A', kind: 'crypto' }, testCtx);
    const outcomes = run({
      createSecurities: [
        { name: 'Different label', kind: 'stock', isin: 'XX0000000001' },
        { name: 'Synthetic A', kind: 'etf' },
        { name: 'Synthetic B', kind: 'bond', assetClass: 'Unknown' },
        { name: 'Synthetic C', kind: 'bond', assetClass: 'aktien welt' },
        { name: 'Synthetic D', kind: 'bond', isin: 'XX0000000002' },
      ],
    });
    expect(outcomes.map((o) => [o.status, o.reason])).toEqual([
      ['skipped', 'conflicting'],
      ['skipped', 'ambiguous_security'],
      ['skipped', 'unknown_asset_class'],
      ['skipped', 'unknown_asset_class'],
      ['created', ''],
    ]);
    expect(
      run({
        createSecurities: [
          { name: 'Other label', kind: 'etf', currency: 'USD', isin: 'XX0000000001' },
        ],
      })[0]!.reason,
    ).toBe('conflicting');
    expect(statuses(run({ createSecurities: [{ name: 'synthetic d', kind: 'bond' }] }))).toEqual([
      'unchanged',
    ]);
  });
});

describe('cryptoMappings', () => {
  beforeEach(() => {
    accounts.create(
      db,
      {
        id: 'depot',
        name: 'Synthetic Depot',
        type: 'crypto',
        role: 'investment',
        onBudget: false,
        openingDate: '2023-10-01',
      },
      testCtx,
    );
  });

  it('uses new securities in the same run, merges/replaces keys, and undoes the whole run', () => {
    accounts.create(
      db,
      {
        id: 'cash',
        name: 'Synthetic Cash',
        type: 'checking',
        role: 'investment',
        onBudget: false,
        openingDate: '2023-10-01',
      },
      testCtx,
    );
    const bookingId = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-01',
        amountCents: -100,
        splits: [{ categoryId: 'essen', amountCents: -100 }],
      },
      testCtx,
    );
    const splitId = getBooking(db, bookingId)!.splits[0]!.id;
    const initial = { cryptoMappings: [{ key: 'currency:synthetic-usd', account: 'Dollar' }] };
    run(initial);
    const json = {
      createSecurities: [{ name: 'Synthetic Coin', kind: 'crypto' }],
      cryptoMappings: [
        { key: 'asset:synthetic-coin', account: 'Synthetic Depot', security: 'Synthetic Coin' },
        { key: 'currency:synthetic-eur', account: 'Synthetic Cash' },
      ],
      splitCategories: [{ splitId, category: 'Miete' }],
      rules: { enable: ['R17'] },
    };
    const before = auditCount();
    const dry = run(json, true);
    expect(auditCount()).toBe(before);
    expect(readSourceMappings(db)).toHaveLength(1);
    const real = run(json);
    expect(withoutGroups(dry)).toEqual(withoutGroups(real));
    expect(real.map((o) => o.section)).toEqual([
      'createSecurities',
      'cryptoMappings',
      'cryptoMappings',
      'splitCategories',
      'rules',
    ]);
    expect(new Set(real.map((o) => o.groupId)).size).toBe(1);
    expect(readSourceMappings(db)).toHaveLength(3);
    const after = auditCount();
    expect(statuses(run(json))).toEqual([
      'unchanged',
      'unchanged',
      'unchanged',
      'unchanged',
      'unchanged',
    ]);
    expect(auditCount()).toBe(after);
    const replacement = run({
      cryptoMappings: [{ ...json.cryptoMappings[0], security: 'XX0000000001' }],
    });
    expect(replacement[0]).toMatchObject({ status: 'updated' });
    expect(replacement[0]!.detail).toContain('replaced');
    expect(readSourceMappings(db)).toEqual([
      { key: 'currency:synthetic-usd', accountId: 'usd', securityId: null },
      { key: 'currency:synthetic-eur', accountId: 'cash', securityId: null },
      { key: 'asset:synthetic-coin', accountId: 'depot', securityId: 's1' },
    ]);
    expect(
      statuses(run({ cryptoMappings: [{ ...json.cryptoMappings[0], security: 'XX0000000001' }] })),
    ).toEqual(['unchanged']);
    undoAuditGroups(db, [replacement[0]!.groupId], operator);
    undoAuditGroups(db, [real[0]!.groupId], operator);
    expect(readSourceMappings(db)).toEqual([
      { key: 'currency:synthetic-usd', accountId: 'usd', securityId: null },
    ]);
    expect(listSecurities(db)).toHaveLength(1);
    expect(getBooking(db, bookingId)!.splits[0]!.categoryId).toBe('essen');
  });

  it('skips unknown/exact-name references, invalid targets, duplicate targets and mismatched known currencies', () => {
    run({
      cryptoMappings: [
        { key: 'asset:synthetic-one', account: 'Synthetic Depot', security: 'Synthetic A' },
      ],
    });
    saveReadSourceState(
      db,
      {
        lastSuccess: null,
        lastAttempt: null,
        status: 'idle',
        window: null,
        balances: [
          {
            key: 'currency:synthetic-eur',
            currency: 'EUR',
            amount: { value: '0', assetId: null, currencyId: 'synthetic-eur', cents: 0 },
          },
        ],
      },
      testCtx,
    );
    const result = run({
      cryptoMappings: [
        { key: 'asset:unknown-account', account: 'Unknown', security: 'Synthetic A' },
        { key: 'asset:unknown-security', account: 'Synthetic Depot', security: 'Unknown' },
        { key: 'asset:case', account: 'synthetic depot', security: 'Synthetic A' },
        { key: 'asset:budget', account: 'Giro', security: 'Synthetic A' },
        { key: 'asset:duplicate', account: 'Synthetic Depot', security: 'Synthetic A' },
        { key: 'currency:synthetic-eur', account: 'Dollar' },
      ],
    });
    expect(result.map((o) => o.reason)).toEqual([
      'unknown_account',
      'unknown_security',
      'unknown_account',
      'conflict',
      'conflict',
      'conflict',
    ]);
    expect(readSourceMappings(db)).toHaveLength(1);
  });
});

describe('splitCategories', () => {
  it('changes only categorisation/contact, keeps literal amounts/balances, previews and undoes', () => {
    const id = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-01',
        amountCents: -1500,
        splits: [
          { categoryId: 'essen', amountCents: -1000, memo: 'synthetic' },
          { categoryId: 'miete', amountCents: -500 },
        ],
      },
      testCtx,
    );
    const original = getBooking(db, id)!;
    const splitId = original.splits[0]!.id;
    const json = {
      splitCategories: [{ splitId, category: 'Fixkosten › Auslagen', contact: 'Freund' }],
    };
    const balances = accountSummaries(db, TODAY).map((a) => [a.id, a.balanceCents]);
    const before = auditCount();
    const dry = run(json, true);
    expect(getBooking(db, id)).toEqual(original);
    expect(auditCount()).toBe(before);
    const real = run(json);
    expect(withoutGroups(dry)).toEqual(withoutGroups(real));
    expect(getBooking(db, id)).toMatchObject({
      accountId: 'giro',
      date: '2026-03-01',
      amountCents: -1500,
    });
    expect(getBooking(db, id)!.splits).toMatchObject([
      {
        id: splitId,
        categoryId: 'auslagen',
        contactId: 'k1',
        amountCents: -1000,
        memo: 'synthetic',
      },
      { id: original.splits[1]!.id, categoryId: 'miete', amountCents: -500 },
    ]);
    expect(accountSummaries(db, TODAY).find((a) => a.id === 'giro')!.balanceCents).toBe(98500);
    expect(accountSummaries(db, TODAY).map((a) => [a.id, a.balanceCents])).toEqual(balances);
    expect(statuses(run(json))).toEqual(['unchanged']);
    expect(statuses(run({ splitCategories: [{ splitId, category: 'Auslagen' }] }))).toEqual([
      'unchanged',
    ]);
    expect(getBooking(db, id)!.splits[0]!.contactId).toBe('k1');
    const clear = { splitCategories: [{ splitId, category: 'Essen', contact: null }] };
    const cleared = run(clear);
    expect(getBooking(db, id)!.splits[0]).toMatchObject({ contactId: null, categoryId: 'essen' });
    expect(statuses(run(clear))).toEqual(['unchanged']);
    undoAuditGroups(db, [cleared[0]!.groupId], operator);
    undoAuditGroups(db, [real[0]!.groupId], operator);
    expect(getBooking(db, id)!.splits).toEqual(original.splits);
    expect(accountSummaries(db, TODAY).map((a) => [a.id, a.balanceCents])).toEqual(balances);
  });

  it('skips unknown/deleted splits, ambiguous/exact categories, unknown contacts and refuses invalid contacts atomically', () => {
    const id = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-01',
        amountCents: -1000,
        splits: [{ categoryId: 'essen', amountCents: -1000 }],
      },
      testCtx,
    );
    const splitId = getBooking(db, id)!.splits[0]!.id;
    createEntity(db, categoryGroup, { id: 'g2', name: 'Synthetic Group' }, testCtx);
    categories.create(db, { name: 'Essen', groupId: 'g2', class: 'need' }, testCtx);
    const before = auditCount();
    for (const [category, contact, reason] of [
      ['Unknown', undefined, 'unknown_category'],
      ['essen', undefined, 'unknown_category'],
      ['Essen', undefined, 'ambiguous_category'],
      ['Auslagen', 'Unknown', 'unknown_contact'],
      ['Miete', 'Freund', 'refused'],
    ] as const) {
      expect(run({ splitCategories: [{ splitId, category, contact }] })[0]).toMatchObject({
        status: 'skipped',
        reason,
      });
    }
    expect(auditCount()).toBe(before);
    expect(getBooking(db, id)!.splits[0]).toMatchObject({ categoryId: 'essen', contactId: null });
    expect(run({ splitCategories: [{ splitId: 'missing', category: 'Miete' }] })[0]!.reason).toBe(
      'unknown_split',
    );
    db.update(booking).set({ deletedAt: '2026-03-02' }).where(eq(booking.id, id)).run();
    expect(run({ splitCategories: [{ splitId, category: 'Miete' }] })[0]!.reason).toBe(
      'unknown_split',
    );
    expect(
      db.select().from(bookingSplit).where(eq(bookingSplit.id, splitId)).get()!.amountCents,
    ).toBe(-1000);
  });
});

describe('whole file', () => {
  it('summarises per section and a dry run matches the real run', () => {
    createExpectedPayment(
      db,
      {
        name: 'Alt',
        kind: 'outflow',
        accountId: 'giro',
        categoryId: 'essen',
        rhythm: 'monthly',
        dueDay: 1,
        startDate: '2026-01-01',
      },
      { validFrom: '2026-01-01', amountCents: 100 },
      testCtx,
      TODAY,
    );
    const json = {
      profile: { name: 'Test Person', householdSize: 3 },
      rules: { enable: ['R17'] },
      categoryStages: [{ category: 'Miete', stage: 1 }],
      securities: [{ isin: 'XX0000000001', symbol: 'S' }],
      assetClasses: { rename: [{ from: 'Anleihen', to: 'Renten' }] },
      expectedPayments: [
        {
          name: 'Alt',
          kind: 'outflow',
          accountName: 'Giro',
          categoryName: 'Essen',
          rhythm: 'monthly',
          dueDay: 1,
          startDate: '2026-01-01',
          amountCents: 100,
        },
      ],
      clearBookings: { before: '2026-01-01', accounts: ['Giro'] },
    };
    const dry = run(json, true);
    const real = run(json);
    expect(withoutGroups(dry)).toEqual(withoutGroups(real));
    expect(summarizeOwnerConfig(real).map((s) => [s.section, s.updated, s.unchanged])).toEqual([
      ['profile', 1, 0],
      ['rules', 1, 0],
      ['categoryStages', 1, 0],
      ['assetClasses', 1, 0],
      ['securities', 1, 0],
      ['expectedPayments', 0, 1],
      ['clearBookings', 0, 1],
    ]);
    expect(statuses(run(json)).every((s) => s === 'unchanged')).toBe(true);
  });
});
