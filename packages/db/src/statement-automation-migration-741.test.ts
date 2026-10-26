import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { parseStatementText } from '@budget/domain';
import {
  defaultMigrationsFolder,
  migrateDatabase,
  openDatabase,
  type OpenedDatabase,
} from './client';
import { accounts } from './repos/entities';
import { createBooking } from './repos/bookings';
import { history, recordAudit, undo, type Snapshot } from './repos/audit';
import { balanceSeries } from './repos/ledger-queries';
import { stageStatementIntake, mutateStatementIntake } from './repos/statement-intake';
import { performStatementAction } from './repos/statement-settlement';
import { saveStatementAutomationConfig } from './repos/statement-automation';

const ctx = { actor: 'synthetic-copy-owner-741' };
const CARD = '74100000-0000-4000-8000-000000000101';
const FUND = '74100000-0000-4000-8000-000000000102';
let directory: string, sourcePath: string, oldFolder: string, targetFolder: string;
let copy: OpenedDatabase, original: Record<string, unknown[]>, oldBookingId: string;
let settlementId: string, transferGroup: string, migrationWhen: number;
const allTables = (o: OpenedDatabase) =>
  (
    o.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
const rows = (o: OpenedDatabase, names = allTables(o)) =>
  Object.fromEntries(
    names.map((name) => [
      name,
      o.sqlite.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all(),
    ]),
  );
const state = () =>
  JSON.stringify({
    tables: rows(copy),
    schema: copy.sqlite
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
      .all(),
  });
const balances = () =>
  [FUND, CARD].map(
    (id) => balanceSeries(copy.db, id, { from: '2031-01-12', to: '2031-01-12' })[0]!.balanceCents,
  );

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'budget-synthetic-card47-'));
  const source = defaultMigrationsFolder();
  const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string; when: number }[];
  };
  const index = journal.entries.findIndex((e) => e.tag === '0047_statement_automation');
  expect(index).toBe(47);
  expect(journal.entries[index - 1]!.tag).toBe('0046_statement_settlement');
  migrationWhen = journal.entries[index]!.when;
  const folder = (name: string, count: number) => {
    const path = join(directory, name),
      entries = journal.entries.slice(0, count);
    mkdirSync(join(path, 'meta'), { recursive: true });
    writeFileSync(join(path, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const e of entries) copyFileSync(join(source, `${e.tag}.sql`), join(path, `${e.tag}.sql`));
    return path;
  };
  oldFolder = folder('through-46', index);
  targetFolder = folder('through-47', index + 1);
  sourcePath = join(directory, 'closed-existing-46.sqlite');
  const existing = openDatabase(sourcePath);
  try {
    migrateDatabase(existing.db, oldFolder);
    accounts.create(
      existing.db,
      {
        id: FUND,
        name: 'Synthetic funding',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2030-12-01',
        openingBalanceCents: 50000,
      },
      ctx,
    );
    accounts.create(
      existing.db,
      {
        id: CARD,
        name: 'Synthetic card',
        type: 'credit_card',
        role: 'budget',
        onBudget: true,
        openingDate: '2030-12-01',
        openingBalanceCents: 0,
      },
      ctx,
    );
    oldBookingId = createBooking(
      existing.db,
      {
        accountId: CARD,
        date: '2030-12-30',
        amountCents: -10000,
        splits: [{ categoryId: null, amountCents: -10000 }],
      },
      ctx,
    );
    // Seed the historical 46 shape directly: today's writer requires migration49.
    // Retain the original monthly horizon, literal cents and grouped creation audit.
    const paymentId = '74100000-0000-4000-8000-000000000120';
    existing.sqlite
      .prepare(
        `INSERT INTO expected_payment
        (id,name,account_id,kind,due_day,start_date)
        VALUES (?,'Synthetic recurring debit',?,'outflow',12,'2031-01-01')`,
      )
      .run(paymentId, FUND);
    existing.sqlite
      .prepare(
        `INSERT INTO expected_payment_version
        (id,expected_payment_id,valid_from,amount_cents)
        VALUES ('74100000-0000-4000-8000-000000000121',?,'2031-01-01',10000)`,
      )
      .run(paymentId);
    for (const [index, dueDate] of [
      '2031-01-12',
      '2031-02-12',
      '2031-03-12',
      '2031-04-12',
      '2031-05-12',
      '2031-06-12',
      '2031-07-12',
      '2031-08-12',
      '2031-09-12',
      '2031-10-12',
      '2031-11-12',
      '2031-12-12',
      '2032-01-12',
    ].entries())
      existing.sqlite
        .prepare(
          `INSERT INTO expected_occurrence
          (id,expected_payment_id,due_date,expected_amount_cents)
          VALUES (?,?,?,-10000)`,
        )
        .run(
          `74100000-0000-4000-8000-0000000002${String(index).padStart(2, '0')}`,
          paymentId,
          dueDate,
        );
    for (const table of ['expected_payment', 'expected_payment_version', 'expected_occurrence'])
      for (const row of existing.sqlite.prepare(`SELECT * FROM ${table}`).all() as Snapshot[])
        recordAudit(existing.db, {
          actor: ctx.actor,
          action: 'create',
          entityType: table,
          entityId: String(row['id']),
          after: row,
          groupId: '74100000-0000-4000-8000-000000000122',
        });
    const sha = 'b'.repeat(64),
      proposal = parseStatementText(
        'Rechnungsnummer SYNTHETIC-LEGACY-741\nRechnungsdatum 04.01.2031\nAbrechnungsbetrag 100,00 EUR\nEinzugsdatum 12.01.2031',
        sha,
      );
    const staged = stageStatementIntake(
      existing.db,
      { accountId: CARD, sha256: sha, sizeBytes: 200, filename: 'synthetic-legacy.pdf', proposal },
      ctx,
    ).intake;
    const reviewed = mutateStatementIntake(
      existing.db,
      staged.id,
      staged,
      'review',
      {
        facts: {
          reference: 'SYNTHETIC-LEGACY-741',
          issueDate: '2031-01-04',
          debitDate: '2031-01-12',
          periodFrom: null,
          periodTo: null,
          payableCents: 10000,
          currency: 'EUR',
          accountHint: null,
        },
      },
      ctx,
    ).intake;
    const sourceCas = {
      intakeId: reviewed.id,
      accountId: CARD,
      sha256: sha,
      revision: reviewed.revision,
    };
    const config = performStatementAction(
      existing.db,
      {
        operation: 'configure',
        key: 'legacy-config-741',
        cardAccountId: CARD,
        fundingAccountId: FUND,
        enabled: true,
        expectedRevision: null,
      },
      ctx,
    );
    const confirmed = performStatementAction(
      existing.db,
      {
        operation: 'confirm',
        key: 'legacy-confirm-741',
        source: sourceCas,
        configRevision: config.configRevision,
      },
      ctx,
    );
    settlementId = confirmed.settlementId!;
    const represented = performStatementAction(
      existing.db,
      {
        operation: 'create_transfer',
        key: 'legacy-transfer-741',
        source: sourceCas,
        configRevision: config.configRevision,
        settlementId,
        expectedRevision: confirmed.settlementRevision,
        status: 'confirmed',
      },
      ctx,
    );
    transferGroup = represented.groupId!;
    // Retained legacy supersession/soft-delete rows exercise the self-FK table rebuild. These
    // synthetic historical fixtures are not used to claim a new production writer action.
    const legacy = existing.sqlite
      .prepare('SELECT * FROM statement_settlement WHERE id=?')
      .get(settlementId) as Record<string, unknown>;
    const insert = (overrides: Record<string, unknown>) => {
      const row = { ...legacy, ...overrides },
        keys = Object.keys(row);
      existing.sqlite
        .prepare(
          `INSERT INTO statement_settlement (${keys.map((k) => '"' + k + '"').join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
        )
        .run(...keys.map((k) => row[k]));
    };
    const withdrawn = '74100000-0000-4000-8000-000000000110';
    const historical = {
      state: 'withdrawn',
      representation_kind: null,
      action_group_id: null,
      transfer_id: null,
      from_booking_id: null,
      to_booking_id: null,
    };
    insert({ ...historical, id: withdrawn, deleted_at: '2031-01-13T12:00:00.000Z' });
    insert({
      ...historical,
      id: '74100000-0000-4000-8000-000000000111',
      state: 'superseded',
      supersedes_id: withdrawn,
    });
    original = rows(existing);
    expect(existing.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally {
    existing.close();
  }
  // Source connection is closed before the filesystem copy: no live/WAL copy or in-place upgrade.
  const copyPath = join(directory, 'disposable-copy.sqlite');
  copyFileSync(sourcePath, copyPath);
  copy = openDatabase(copyPath);
  migrateDatabase(copy.db, targetFolder);
});
afterEach(() => {
  copy?.close();
  rmSync(directory, { recursive: true, force: true });
});

function rollback(foreignKeysOff = true) {
  if (foreignKeysOff) copy.sqlite.pragma('foreign_keys = OFF');
  try {
    copy.sqlite.transaction(() => {
      copy.sqlite.exec(
        readFileSync(
          join(defaultMigrationsFolder(), 'rollback', '0047_statement_automation.sql'),
          'utf8',
        ),
      );
      expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
    })();
  } finally {
    copy.sqlite.pragma('foreign_keys = ON');
  }
}

it('upgrades only the closed 46 copy, preserves every legacy row and audit, and supports an old whole-action Undo/redo', () => {
  const migrated = rows(copy, Object.keys(original));
  expect({ ...migrated, __drizzle_migrations: original['__drizzle_migrations'] }).toEqual(original);
  expect(rows(copy)['statement_automation_run']).toEqual([]);
  expect(balances()).toEqual([40000, 0]);
  expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(copy.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  const oldAudit = history(copy.db, 'booking', oldBookingId);
  const undone = undo(copy.db, { groupId: transferGroup }, ctx);
  expect(balances()).toEqual([50000, -10000]);
  undo(copy.db, { groupId: undone.groupId }, ctx);
  expect(balances()).toEqual([40000, 0]);
  expect(history(copy.db, 'booking', oldBookingId)).toEqual(oldAudit);
  expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
  const source = openDatabase(sourcePath);
  try {
    expect(rows(source)).toEqual(original);
    expect(
      source.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE name='statement_automation_run'")
        .get(),
    ).toBeUndefined();
  } finally {
    source.close();
  }
});

it('rolls back an unused 47 copy and re-upgrades it without losing legacy references, delivery receipts or audit', () => {
  rollback();
  expect(rows(copy)).toEqual(original);
  expect(copy.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  migrateDatabase(copy.db, targetFolder);
  migrateDatabase(copy.db, targetFolder);
  const migrated = rows(copy, Object.keys(original));
  expect({ ...migrated, __drizzle_migrations: original['__drizzle_migrations'] }).toEqual(original);
  expect(balances()).toEqual([40000, 0]);
  expect(copy.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
});

it('rejects the wrong FK protocol atomically instead of dropping a referenced table', () => {
  const before = state();
  expect(() => rollback(false)).toThrow();
  expect(state()).toBe(before);
  expect(copy.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
});

it.each([
  'config',
  'deleted config',
  'audit only',
  'run',
  'null reference',
  'machine origin',
  'later migration',
] as const)(
  'refuses disposable rollback with retained %s and preserves all tables and schema',
  (kind) => {
    if (['config', 'deleted config', 'audit only'].includes(kind)) {
      saveStatementAutomationConfig(
        copy.db,
        {
          accountId: CARD,
          expectedRevision: null,
          enabled: true,
          mappedCards: [{ token: 'c'.repeat(64), accountId: CARD }],
          scheduledPayment: { mode: 'none' },
        },
        ctx,
      );
      if (kind === 'deleted config')
        copy.sqlite
          .prepare('UPDATE statement_automation_config SET deleted_at=?')
          .run('2031-01-13T12:00:00Z');
      if (kind === 'audit only') copy.sqlite.exec('DELETE FROM statement_automation_config');
    } else if (kind === 'run') {
      copy.sqlite
        .prepare(
          `INSERT INTO statement_automation_run
        (id,key,source_intake_id,source_sha256,source_revision,account_id,identity_key,issue_date,config_revision,plan_hash,source_proof_json,result_json)
        SELECT 'synthetic-run','synthetic-key',source_intake_id,source_sha256,source_revision,card_account_id,'synthetic-identity',issue_date,'synthetic-config','synthetic-hash','{}','{}'
        FROM statement_settlement WHERE id=?`,
        )
        .run(settlementId);
    } else if (kind === 'null reference')
      copy.sqlite
        .prepare('UPDATE statement_settlement SET reference=NULL WHERE id=?')
        .run(settlementId);
    else if (kind === 'machine origin')
      copy.sqlite
        .prepare(
          "UPDATE statement_settlement SET origins_json='{" +
            '"origin":"machine"' +
            "}' WHERE id=?",
        )
        .run(settlementId);
    else
      copy.sqlite
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)')
        .run('synthetic-later-migration-marker', migrationWhen + 1);
    const before = state();
    expect(() => rollback()).toThrow();
    expect(state()).toBe(before);
    expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(copy.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  },
);
