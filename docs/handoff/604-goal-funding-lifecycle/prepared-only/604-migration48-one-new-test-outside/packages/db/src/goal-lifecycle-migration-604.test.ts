import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { parseCardDocument, parseStatementText } from '@budget/domain';
import { defaultMigrationsFolder, migrateDatabase, openDatabase, type OpenedDatabase } from './client';
import { categoryGroup } from './schema';
import { accounts, categories, createEntity } from './repos/entities';
import { createBooking, getBooking } from './repos/bookings';
import { history, undo } from './repos/audit';
import { balanceSeries } from './repos/ledger-queries';
import { saveAssignmentRule } from './repos/assignment-rules';
import { stageStatementIntake } from './repos/statement-intake';
import { performStatementAction } from './repos/statement-settlement';
import { performStatementAutomation, prepareStatementAutomation, saveStatementAutomationConfig } from './repos/statement-automation';
import { completeGoal, createGoal, deleteGoal, updateGoal } from './repos/goals';

// Adoption requires the actually delivered card47 tree plus the final reviewed604 delta.
// Every write below targets a synthetic temporary source or its disposable copy, never app data.
const ctx = { actor: 'synthetic-goal48-copy-owner' };
const FUND = '60400000-0000-4000-8000-000000000001';
const CARD = '60400000-0000-4000-8000-000000000002';
const GROUP = '60400000-0000-4000-8000-000000000003';
const FUEL = '60400000-0000-4000-8000-000000000004';
const LEGACY = '60400000-0000-4000-8000-000000000005';
const DELETED = '60400000-0000-4000-8000-000000000006';
const TOKEN = 'c'.repeat(64), SHA = 'a'.repeat(64);
let directory: string, sourcePath: string, sourceHash: string, through47: string, through48: string;
let copy: OpenedDatabase | undefined;
let original: Record<string, unknown[]>, legacyColumns: Record<string, string[]>;
let originalOtherSchema: unknown[], oldActionGroup: string, protectedBookingId: string;
const opened = () => { if (!copy) throw new Error('Disposable copy is not open'); return copy; };
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const tables = (o: OpenedDatabase) => (o.sqlite.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
).all() as { name: string }[]).map((r) => r.name);
const columnsOf = (o: OpenedDatabase, name: string) => (o.sqlite.prepare(
  `PRAGMA table_info(${quote(name)})`,
).all() as { name: string }[]).map((r) => r.name);
const rows = (o: OpenedDatabase) => Object.fromEntries(tables(o).map((name) => [name,
  o.sqlite.prepare(`SELECT * FROM ${quote(name)} ORDER BY rowid`).all(),
]));
const oldProjection = () => Object.fromEntries(Object.entries(legacyColumns).map(([name, columns]) => [name,
  opened().sqlite.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(name)} ORDER BY rowid`).all(),
]));
const otherSchema = (o: OpenedDatabase) => o.sqlite.prepare(
  "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND tbl_name<>'savings_goal' ORDER BY type,name",
).all();
const state = () => JSON.stringify({ rows: rows(opened()), schema: opened().sqlite.prepare(
  "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
).all(), temporarySchema: opened().sqlite.prepare('SELECT type,name,tbl_name,sql FROM sqlite_temp_master ORDER BY type,name').all() });
const balances = (o = opened()) => [FUND, CARD].map((id) => balanceSeries(
  o.db, id, { from: '2031-01-12', to: '2031-01-12' },
)[0]!.balanceCents);
const integrity = () => {
  expect(opened().sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  expect(opened().sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(opened().sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  expect(hash(sourcePath)).toBe(sourceHash);
};

const columns = (cells: readonly (readonly [number, string])[]) => {
  let line = '';
  for (const [at, text] of cells) {
    if (line.length > at) throw new Error('Synthetic columns overlap');
    line = line.padEnd(at) + text;
  }
  return line;
};
const syntheticText = () =>
  [
    'Rechnungsnummer SYNTHETIC-741',
    'Rechnungsdatum 04.01.2031',
    'Einzugsdatum 12.01.2031',
    'Kartennummer: 1111',
    columns([
      [0, 'Datum'],
      [12, 'Bezogen von'],
      [36, 'Produkt'],
      [52, 'Menge'],
      [64, 'Einheit'],
      [74, 'Preis pro'],
      [88, 'Rabatt pro'],
      [104, 'Total Netto'],
      [122, 'MwSt'],
      [136, 'MwSt'],
      [150, 'Total Brutto in'],
    ]),
    columns([
      [104, 'Netto in EUR'],
      [122, 'Satz %'],
      [136, 'Betrag'],
      [150, 'EUR'],
    ]),
    columns([
      [0, '30.12.2030'],
      [12, 'Synthetic station'],
      [36, 'Diesel'],
      [52, '50,000'],
      [64, 'Liter'],
      [74, '1,500000'],
      [88, '0,020000'],
      [104, '74,00'],
      [122, '20,00%'],
      [136, '14,80'],
      [150, '88,80'],
    ]),
    ...['Gesamt Kartensumme', 'Gesamt Firmensumme'].map((label) =>
      columns([
        [0, label],
        [104, '74,00'],
        [136, '14,80'],
        [150, '88,80'],
      ]),
    ),
  ].join('\n');

function seedCard47(o: OpenedDatabase) {
  accounts.create(o.db, { id: FUND, name: 'ContactAlpha synthetic funding', type: 'checking', role: 'budget', onBudget: true, openingDate: '2030-12-01', openingBalanceCents: 50000 }, ctx);
  accounts.create(o.db, { id: CARD, name: 'Synthetic card47', type: 'credit_card', role: 'budget', onBudget: true, openingDate: '2030-12-01', openingBalanceCents: 0 }, ctx);
  createEntity(o.db, categoryGroup, { id: GROUP, name: 'Synthetic expenses' }, ctx);
  categories.create(o.db, { id: FUEL, groupId: GROUP, name: 'Synthetic fuel', class: 'need' }, ctx);
  protectedBookingId = createBooking(o.db, { accountId: CARD, date: '2031-01-06', amountCents: -2300, splits: [{ categoryId: FUEL, amountCents: -2300 }] }, ctx);
  performStatementAction(o.db, { operation: 'configure', key: 'synthetic-goal48-settlement', cardAccountId: CARD, fundingAccountId: FUND, expectedRevision: null, enabled: true }, ctx);
  saveStatementAutomationConfig(o.db, { accountId: CARD, expectedRevision: null, enabled: true, mappedCards: [{ token: TOKEN, accountId: CARD }], scheduledPayment: { mode: 'none' } }, ctx);
  saveAssignmentRule(o.db, null, { name: 'Synthetic station rule', enabled: true, automatic: true, match: { mode: 'all', conditions: [{ type: 'counterparty', text: 'Synthetic station Diesel' }] }, actions: { categoryId: FUEL } }, ctx);
  // The real card parser explicitly supports an issued-date identity without an invented reference.
  const text = syntheticText().split('\n').filter((line) => !line.startsWith('Rechnungsnummer ')).join('\n');
  const intake = stageStatementIntake(o.db, { accountId: CARD, sha256: SHA, sizeBytes: 250, filename: 'synthetic-card47-goal48.pdf', proposal: parseStatementText(text, SHA) }, ctx).intake;
  const p = prepareStatementAutomation(o.db, intake.id, intake);
  const document = parseCardDocument(text, SHA, { ...p.context, previous: null, cardIdentity: () => ({ fingerprint: TOKEN, hint: '****1111' }) });
  expect(document.reasons).toEqual([]);
  expect(document.identity!.reference).toBeNull();
  const saved = performStatementAutomation(o.db, { source: p.source, configRevision: p.config.revision!, settlementConfigRevision: p.settlementConfigRevision, document, key: 'synthetic-goal48-card-run' }, ctx);
  expect(saved).toMatchObject({ status: 'saved', created: 1, matched: 0, credits: 0, receiptLinks: 3, pending: [], reasons: [] });
  oldActionGroup = saved.groupId!;
  expect(saved.items!.filter((item) => item.role !== 'original').map((item) => getBooking(o.db, item.bookingId)!.amountCents).sort((a,b) => a-b)).toEqual([-8880,-8880,8880]);
  expect(balances(o)).toEqual([41120,-2300]);
  expect(o.sqlite.prepare('SELECT count(*) AS n FROM statement_automation_run').get()).toEqual({ n: 1 });
  const settlement = o.sqlite.prepare('SELECT reference,origins_json,state,representation_kind FROM statement_settlement').get() as { reference: string | null; origins_json: string; state: string; representation_kind: string };
  expect(settlement.reference).toBeNull();
  expect(JSON.parse(settlement.origins_json)).toMatchObject({ origin: 'machine' });
  expect(settlement).toMatchObject({ state: 'represented', representation_kind: 'created' });
  expect(history(o.db, 'booking', protectedBookingId)).toHaveLength(1);
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'budget-synthetic-goal48-'));
  const folder = defaultMigrationsFolder();
  const journal = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as { entries: { idx: number; when: number; tag: string }[] };
  const index = journal.entries.findIndex((e) => e.tag === '0048_goal_lifecycle');
  expect(index).toBe(48);
  expect(journal.entries[index - 1]!.tag).toBe('0047_statement_automation');
  expect(journal.entries[index]!.when).toBe(1792520000000);
  const snapshot47 = JSON.parse(readFileSync(join(folder, 'meta', '0047_snapshot.json'), 'utf8')) as { id: string };
  const snapshot48 = JSON.parse(readFileSync(join(folder, 'meta', '0048_snapshot.json'), 'utf8')) as { id: string; prevId: string };
  expect(snapshot47.id).toBe('2773aeae-39e7-49ea-9317-7000e173a4ec');
  expect(snapshot48.prevId).toBe(snapshot47.id);
  expect(snapshot48.id).toBe('87b522c0-6ccd-4dfc-9174-c027ec48cd97');
  function migrations(name: string, length: number) {
    const target = join(directory, name), entries = journal.entries.slice(0, length);
    mkdirSync(join(target, 'meta'), { recursive: true });
    writeFileSync(join(target, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const entry of entries) copyFileSync(join(folder, `${entry.tag}.sql`), join(target, `${entry.tag}.sql`));
    return target;
  }
  through47 = migrations('through47', index);
  through48 = migrations('through48', index + 1);
  sourcePath = join(directory, 'closed-populated47.sqlite');
  const source = openDatabase(sourcePath);
  try {
    migrateDatabase(source.db, through47);
    seedCard47(source);
    // Genuine old-schema fixtures: using the new604 mapper before48 would read absent columns.
    // These retained live/deleted goals and their old audit snapshots contain no lifecycle intent.
    for (const [id, deletedAt] of [[LEGACY, null], [DELETED, '2030-12-31T12:00:00.000Z']] as const) {
      source.sqlite.prepare(`INSERT INTO savings_goal (id,name,target_cents,target_date,account_id,note,created_at,updated_at,deleted_at) VALUES (?,?,120000,'2031-12-31',?,'Synthetic legacy note','2030-12-01T12:00:00.000Z','2030-12-01T12:00:00.000Z',?)`).run(id, 'Synthetic legacy goal', FUND, deletedAt);
      const row = source.sqlite.prepare('SELECT * FROM savings_goal WHERE id=?').get(id);
      source.sqlite.prepare("INSERT INTO audit_log(id,ts,actor,action,entity_type,entity_id,after_json,group_id) VALUES (?,'2030-12-01T12:00:00.000Z',?,'create','savings_goal',?,?,?)").run(`synthetic-legacy-audit-${id}`, ctx.actor, id, JSON.stringify(row), `synthetic-legacy-group-${id}`);
    }
    original = rows(source);
    legacyColumns = Object.fromEntries(tables(source).map((name) => [name, columnsOf(source, name)]));
    originalOtherSchema = otherSchema(source);
    expect(source.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(source.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  } finally { source.close(); }
  expect(existsSync(sourcePath + '-wal')).toBe(false);
  expect(existsSync(sourcePath + '-shm')).toBe(false);
  sourceHash = hash(sourcePath);
  const disposable = join(directory, 'disposable-copy48.sqlite');
  copyFileSync(sourcePath, disposable);
  expect(hash(disposable)).toBe(sourceHash);
  copy = openDatabase(disposable);
  migrateDatabase(copy.db, through48);
});
afterEach(() => {
  copy?.close(); copy = undefined;
  if (directory) rmSync(directory, { recursive: true, force: true });
});

function rollback() {
  //48 only drops its three added columns; FK enforcement remains on throughout.
  expect(opened().sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  opened().sqlite.transaction(() => {
    opened().sqlite.exec(readFileSync(join(defaultMigrationsFolder(), 'rollback', '0048_goal_lifecycle.sql'), 'utf8'));
    expect(opened().sqlite.pragma('foreign_key_check')).toEqual([]);
  })();
}
function assertRefusal() {
  const before = state();
  expect(() => rollback()).toThrow();
  expect(state()).toBe(before);
  integrity();
}

it('upgrades only the closed populated47 copy and preserves every legacy column, card47 row, audit and foreign key', () => {
  const projected = oldProjection();
  expect({ ...projected, __drizzle_migrations: original['__drizzle_migrations'] }).toEqual(original);
  expect(tables(opened())).toEqual(Object.keys(original));
  expect(otherSchema(opened())).toEqual(originalOtherSchema);
  expect(columnsOf(opened(), 'savings_goal')).toEqual([...legacyColumns['savings_goal']!, 'start_month', 'manual_completed_on', 'lifecycle_anchor_json']);
  expect(opened().sqlite.prepare('SELECT id,start_month,manual_completed_on,lifecycle_anchor_json,deleted_at FROM savings_goal ORDER BY id').all()).toEqual([
    { id: LEGACY, start_month: null, manual_completed_on: null, lifecycle_anchor_json: null, deleted_at: null },
    { id: DELETED, start_month: null, manual_completed_on: null, lifecycle_anchor_json: null, deleted_at: '2030-12-31T12:00:00.000Z' },
  ]);
  const migrated = rows(opened())['__drizzle_migrations']!;
  expect(migrated.slice(0,-1)).toEqual(original['__drizzle_migrations']);
  expect(migrated).toHaveLength(original['__drizzle_migrations']!.length + 1);
  expect(migrated.at(-1)).toMatchObject({ created_at: 1792520000000, hash: hash(join(defaultMigrationsFolder(), '0048_goal_lifecycle.sql')) });
  expect(balances()).toEqual([41120,-2300]);
  integrity();
});

it('rolls back unused48 and re-upgrades without losing populated47 goals, machine settlement history, receipts or audit', () => {
  rollback();
  expect(rows(opened())).toEqual(original);
  expect(columnsOf(opened(), 'savings_goal')).toEqual(legacyColumns['savings_goal']);
  expect(otherSchema(opened())).toEqual(originalOtherSchema);
  integrity();
  migrateDatabase(opened().db, through48);
  migrateDatabase(opened().db, through48);
  expect({ ...oldProjection(), __drizzle_migrations: original['__drizzle_migrations'] }).toEqual(original);
  expect(rows(opened())['__drizzle_migrations']).toHaveLength(original['__drizzle_migrations']!.length + 1);
  expect(balances()).toEqual([41120,-2300]);
  integrity();
});

it.each(['start','manual','anchor','deleted','undone','audit only'] as const)(
  'refuses48 rollback with retained %s lifecycle intent or audit and preserves the complete database', (kind) => {
    if (kind === 'anchor' || kind === 'audit only') {
      const saved = createGoal(opened().db, { name: 'Synthetic prospective goal', categoryId: FUEL, targetCents: 120000, targetDate: '2031-12-31', startMonth: '2031-01' }, ctx, '2031-01', '2031-01-12');
      const stored = opened().sqlite.prepare('SELECT lifecycle_anchor_json FROM savings_goal WHERE id=?').get(saved.goal.id) as { lifecycle_anchor_json: string | null };
      expect(stored.lifecycle_anchor_json).not.toBeNull();
      expect(JSON.parse(stored.lifecycle_anchor_json!)).toMatchObject({ version: 1, goalId: saved.goal.id, capturedOn: '2031-01-12', groupId: saved.groupId });
      if (kind === 'audit only') {
        undo(opened().db, { groupId: saved.groupId }, ctx);
        expect(opened().sqlite.prepare('SELECT id FROM savings_goal WHERE id=?').get(saved.goal.id)).toBeUndefined();
        expect(history(opened().db, 'savings_goal', saved.goal.id).some((e) => e.action === 'undo')).toBe(true);
      }
    } else if (kind === 'manual') {
      expect(completeGoal(opened().db, LEGACY, '2031-01-12', ctx).changedCount).toBe(1);
      expect(opened().sqlite.prepare('SELECT manual_completed_on FROM savings_goal WHERE id=?').get(LEGACY)).toEqual({ manual_completed_on: '2031-01-12' });
    } else {
      const intent = updateGoal(opened().db, LEGACY, { startMonth: '2031-01' }, ctx, '2031-01', '2031-01-12');
      if (kind === 'deleted') deleteGoal(opened().db, LEGACY, ctx);
      if (kind === 'undone') {
        undo(opened().db, { groupId: intent.groupId }, ctx);
        expect(opened().sqlite.prepare('SELECT start_month FROM savings_goal WHERE id=?').get(LEGACY)).toEqual({ start_month: null });
        expect(history(opened().db, 'savings_goal', LEGACY).some((e) => e.action === 'undo')).toBe(true);
      }
    }
    assertRefusal();
  },
);

it('refuses a later journal marker before changing schema, data, card47 history or journal (known missing48 guard)', () => {
  // Synthetic journal-only successor proves the ordering precondition independently of goal use.
  expect(opened().sqlite.prepare('SELECT start_month,manual_completed_on,lifecycle_anchor_json FROM savings_goal').all()).toEqual([
    { start_month: null, manual_completed_on: null, lifecycle_anchor_json: null },
    { start_month: null, manual_completed_on: null, lifecycle_anchor_json: null },
  ]);
  opened().sqlite.prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)').run('synthetic-later-than48',1792520000001);
  assertRefusal();
});

it('preserves whole card47 financial Undo and redo after48 without touching the protected later expense or goal/audit history', () => {
  const oldAudit = history(opened().db, 'booking', protectedBookingId);
  const protectedRow = getBooking(opened().db, protectedBookingId);
  const goals = opened().sqlite.prepare('SELECT * FROM savings_goal ORDER BY id').all();
  const goalAudits = opened().sqlite.prepare("SELECT * FROM audit_log WHERE entity_type='savings_goal' ORDER BY rowid").all();
  expect(balances()).toEqual([41120,-2300]);
  const reversed = undo(opened().db, { groupId: oldActionGroup }, ctx);
  expect(balances()).toEqual([50000,-2300]);
  undo(opened().db, { groupId: reversed.groupId }, ctx);
  expect(balances()).toEqual([41120,-2300]);
  expect(getBooking(opened().db, protectedBookingId)).toEqual(protectedRow);
  expect(history(opened().db, 'booking', protectedBookingId)).toEqual(oldAudit);
  expect(opened().sqlite.prepare('SELECT * FROM savings_goal ORDER BY id').all()).toEqual(goals);
  expect(opened().sqlite.prepare("SELECT * FROM audit_log WHERE entity_type='savings_goal' ORDER BY rowid").all()).toEqual(goalAudits);
  integrity();
});
