import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  defaultMigrationsFolder,
  migrateDatabase,
  openDatabase,
  type OpenedDatabase,
} from './client';
import { createBooking } from './repos/bookings';
import { createEntity, softDeleteEntity } from './repos/entities';
import { createGoal } from './repos/goals';
import { accountSummaries } from './repos/ledger-queries';
import { seedBasics, testCtx as ctx } from './repos/test-helpers';
import {
  expectedOccurrence,
  expectedPayment,
  expectedPaymentPause,
  expectedPaymentVersion,
  savingsGoal,
} from './schema';

it('#607 migrates a real disposable amended48 copy, preserves all previous data and anchors, and refuses lossy rollback atomically', () => {
  const folder = mkdtempSync(join(tmpdir(), 'synthetic-payment-pause-607-'));
  const source = defaultMigrationsFolder();
  const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
    entries: Array<{ idx: number; tag: string; when: number }>;
  };
  const position = journal.entries.findIndex(
    (entry) => entry.tag === '0049_expected_payment_pause',
  );
  expect(position).toBe(49);
  const stages = [48, 49].map((last) => {
    const target = join(folder, `through-${last}`);
    mkdirSync(join(target, 'meta'), { recursive: true });
    const entries = journal.entries.slice(0, last + 1);
    writeFileSync(join(target, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const entry of entries)
      copyFileSync(join(source, entry.tag + '.sql'), join(target, entry.tag + '.sql'));
    return target;
  });
  const originalPath = join(folder, 'synthetic-original.sqlite');
  const copiedPath = join(folder, 'disposable-copy.sqlite');
  const rollback = readFileSync(
    join(source, 'rollback', '0049_expected_payment_pause.sql'),
    'utf8',
  );
  let original: OpenedDatabase | undefined;
  let copy: OpenedDatabase | undefined;
  try {
    original = openDatabase(originalPath);
    migrateDatabase(original.db, stages[0]!);
    seedBasics(original.db);
    const bookingId = createBooking(
      original.db,
      {
        accountId: 'giro',
        date: '2026-03-25',
        amountCents: -1234,
        splits: [{ categoryId: 'miete', amountCents: -1234 }],
      },
      ctx,
    );
    // Use the unchanged48 entities, not the new49-dependent payment writer, for predecessor data.
    const payment = createEntity(
      original.db,
      expectedPayment,
      {
        id: 'synthetic-607-predecessor',
        name: 'Synthetic prior payment',
        accountId: 'giro',
        dueDay: 25,
        startDate: '2026-01-01',
      },
      ctx,
    );
    createEntity(
      original.db,
      expectedPaymentVersion,
      {
        expectedPaymentId: payment.id,
        validFrom: '2026-01-01',
        amountCents: 1234,
      },
      ctx,
    );
    createEntity(
      original.db,
      expectedOccurrence,
      {
        expectedPaymentId: payment.id,
        dueDate: '2026-03-25',
        expectedAmountCents: -1234,
        status: 'received',
        bookingId,
      },
      ctx,
    );
    const currentGoal = createGoal(
      original.db,
      {
        name: 'Synthetic retained goal',
        categoryId: 'reise',
        targetCents: 12345,
        startMonth: '2026-03',
      },
      ctx,
      '2026-03',
      '2026-03-20',
    ).goal;
    const deletedGoal = createGoal(
      original.db,
      {
        name: 'Synthetic deleted goal',
        categoryId: 'essen',
        targetCents: 23456,
        startMonth: '2026-03',
      },
      ctx,
      '2026-03',
      '2026-03-20',
    ).goal;
    softDeleteEntity(original.db, savingsGoal, deletedGoal.id, ctx);
    const anchors = original.sqlite
      .prepare('SELECT id,lifecycle_anchor_json,deleted_at FROM savings_goal ORDER BY id')
      .all() as Array<{
      id: string;
      lifecycle_anchor_json: string | null;
      deleted_at: string | null;
    }>;
    expect(anchors.find((row) => row.id === currentGoal.id)?.lifecycle_anchor_json).toEqual(
      expect.any(String),
    );
    expect(anchors.find((row) => row.id === deletedGoal.id)?.deleted_at).toEqual(
      expect.any(String),
    );
    const tables = (
      original.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    const rows = (opened: OpenedDatabase) =>
      Object.fromEntries(
        tables.map((name) => [
          name,
          opened.sqlite
            .prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`)
            .all(),
        ]),
      );
    const before = rows(original);
    expect(
      accountSummaries(original.db, '2026-03-25').find((a) => a.id === 'giro')?.balanceCents,
    ).toBe(98766);
    original.close();
    original = undefined;
    copyFileSync(originalPath, copiedPath);
    copy = openDatabase(copiedPath);
    migrateDatabase(copy.db, stages[1]!);
    migrateDatabase(copy.db, stages[1]!);
    expect({ ...rows(copy), __drizzle_migrations: before['__drizzle_migrations'] }).toEqual(before);
    expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(copy.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(copy.sqlite.prepare('SELECT * FROM expected_payment_pause').all()).toEqual([]);
    // Only a disposable copy with no retained pause intent may use the caller transaction.
    copy.sqlite.transaction(() => copy!.sqlite.exec(rollback))();
    expect(rows(copy)).toEqual(before);
    expect(
      copy.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE name='expected_payment_pause'")
        .get(),
    ).toBeUndefined();
    migrateDatabase(copy.db, stages[1]!);
    const pause = createEntity(
      copy.db,
      expectedPaymentPause,
      {
        expectedPaymentId: payment.id,
        fromDate: '2026-04-01',
        throughDate: '2026-04-30',
      },
      ctx,
    );
    const assertRefusal = () => {
      const bytes = copy!.sqlite.serialize();
      expect(() => copy!.sqlite.transaction(() => copy!.sqlite.exec(rollback))()).toThrow();
      expect(copy!.sqlite.serialize().equals(bytes)).toBe(true);
      expect(copy!.sqlite.pragma('foreign_key_check')).toEqual([]);
    };
    assertRefusal();
    softDeleteEntity(copy.db, expectedPaymentPause, pause.id, ctx);
    assertRefusal();
    // Even if a synthetic cache repair removed the physical tombstone, retained audit intent refuses downgrade.
    copy.sqlite.prepare('DELETE FROM expected_payment_pause WHERE id=?').run(pause.id);
    assertRefusal();
    expect(accountSummaries(copy.db, '2026-03-25').find((a) => a.id === 'giro')?.balanceCents).toBe(
      98766,
    );
    expect(
      copy.sqlite
        .prepare('SELECT id,lifecycle_anchor_json,deleted_at FROM savings_goal ORDER BY id')
        .all(),
    ).toEqual(anchors);
    original = openDatabase(originalPath);
    expect(rows(original)).toEqual(before);
    expect(
      original.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE name='expected_payment_pause'")
        .get(),
    ).toBeUndefined();
  } finally {
    copy?.close();
    original?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
