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
import { accountSummaries } from './repos/ledger-queries';
import { seedBasics } from './repos/test-helpers';

it('migrates a copied existing ledger additively, reverses only the empty cache on a disposable copy, and preserves populated delivery keys across older migration runners', () => {
  const folder = mkdtempSync(join(tmpdir(), 'budget-receipt-migration-'));
  const source = defaultMigrationsFolder();
  const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string; when: number }[];
  };
  const migrationIndex = journal.entries.findIndex(
    (entry) => entry.tag === '0044_receipt_delivery',
  );
  expect(migrationIndex).toBe(44);
  const oldEntries = journal.entries.slice(0, migrationIndex);
  const oldFolder = join(folder, 'old-migrations');
  mkdirSync(join(oldFolder, 'meta'), { recursive: true });
  writeFileSync(
    join(oldFolder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: oldEntries }),
  );
  for (const entry of oldEntries)
    copyFileSync(join(source, `${entry.tag}.sql`), join(oldFolder, `${entry.tag}.sql`));
  // Exercise migration 0044 independently of later additive migrations.
  const targetFolder = join(folder, 'through-receipt-delivery');
  const targetEntries = journal.entries.slice(0, migrationIndex + 1);
  mkdirSync(join(targetFolder, 'meta'), { recursive: true });
  writeFileSync(
    join(targetFolder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: targetEntries }),
  );
  for (const entry of targetEntries)
    copyFileSync(join(source, `${entry.tag}.sql`), join(targetFolder, `${entry.tag}.sql`));
  const sourcePath = join(folder, 'synthetic-existing.sqlite');
  let existing: OpenedDatabase | undefined;
  let copy: OpenedDatabase | undefined;
  try {
    existing = openDatabase(sourcePath);
    migrateDatabase(existing.db, oldFolder);
    seedBasics(existing.db);
    createBooking(
      existing.db,
      {
        accountId: 'giro',
        date: '2026-10-19',
        amountCents: -1375,
        splits: [
          { amountCents: -1000, categoryId: 'essen' },
          { amountCents: -375, categoryId: 'miete' },
        ],
      },
      { actor: 'synthetic-owner' },
    );
    const tables = existing.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const rows = (opened: OpenedDatabase) =>
      Object.fromEntries(
        tables.map(({ name }) => [
          name,
          opened.sqlite
            .prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`)
            .all(),
        ]),
      );
    const original = rows(existing);
    expect(
      accountSummaries(existing.db, '2026-10-19').find((a) => a.id === 'giro')!.balanceCents,
    ).toBe(98625);
    existing.close();
    existing = undefined; // Flush WAL before copying the synthetic DB file.
    const copiedPath = join(folder, 'migration-copy.sqlite');
    copyFileSync(sourcePath, copiedPath);
    copy = openDatabase(copiedPath);
    migrateDatabase(copy.db, targetFolder);
    migrateDatabase(copy.db, targetFolder);
    // Only the migration journal may change among original tables; audit/financial rows are exact.
    const migrated = rows(copy);
    expect({ ...migrated, __drizzle_migrations: original['__drizzle_migrations'] }).toEqual(
      original,
    );
    expect(copy.sqlite.prepare('SELECT * FROM receipt_delivery').all()).toEqual([]);
    expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
    const newJournal = journal.entries[migrationIndex]!;
    const latest = copy.sqlite
      .prepare('SELECT created_at FROM __drizzle_migrations ORDER BY id DESC LIMIT 1')
      .get() as { created_at: number };
    expect(latest.created_at).toBe(newJournal.when);
    // This reversal is ONLY for a disposable copy with no delivery acknowledgements.
    copy.sqlite.exec('DROP TABLE receipt_delivery');
    copy.sqlite
      .prepare('DELETE FROM __drizzle_migrations WHERE created_at = ?')
      .run(newJournal.when);
    expect(rows(copy)).toEqual(original);
    migrateDatabase(copy.db, targetFolder);
    copy.sqlite
      .prepare('INSERT INTO receipt_delivery (key, request_hash, response_json) VALUES (?, ?, ?)')
      .run('synthetic-physical-upload-0001', 'f'.repeat(64), '{"synthetic":"acknowledged"}');
    const acknowledged = copy.sqlite.prepare('SELECT * FROM receipt_delivery').all();
    migrateDatabase(copy.db, oldFolder); // An older app must retain, never drop, durable keys.
    migrateDatabase(copy.db, targetFolder);
    expect(copy.sqlite.prepare('SELECT * FROM receipt_delivery').all()).toEqual(acknowledged);
    expect({ ...rows(copy), __drizzle_migrations: original['__drizzle_migrations'] }).toEqual(
      original,
    );
    expect(accountSummaries(copy.db, '2026-10-19').find((a) => a.id === 'giro')!.balanceCents).toBe(
      98625,
    );
    expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
    // Original source file was never migrated in place.
    existing = openDatabase(sourcePath);
    expect(rows(existing)).toEqual(original);
    expect(
      existing.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='receipt_delivery'").get(),
    ).toBeUndefined();
  } finally {
    copy?.close();
    existing?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
