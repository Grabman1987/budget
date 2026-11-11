import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  defaultMigrationsFolder,
  migrateDatabase,
  openDatabase,
  type OpenedDatabase,
} from './client';
import { addContactAlias, archiveContact } from './repos/contact-identity';
import { seedIdentityContacts } from './repos/contact-identity-fixture';
import { listContactStatements } from './repos/contacts';
import { seedBasics } from './repos/test-helpers';

const ctx = () => ({ actor: 'tester', groupId: crypto.randomUUID() });

it('#870 migrates 0050/0051 on a copied fixture database: counts, content and statements unchanged; rollback exact and guarded', () => {
  const folder = mkdtempSync(join(tmpdir(), 'synthetic-contact-870-'));
  const source = defaultMigrationsFolder();
  const rollback = (tag: string) => readFileSync(join(source, 'rollback', `${tag}.sql`), 'utf8');
  const originalPath = join(folder, 'synthetic-original.sqlite');
  const copiedPath = join(folder, 'disposable-copy.sqlite');
  let original: OpenedDatabase | undefined;
  let copy: OpenedDatabase | undefined;
  const run = (opened: OpenedDatabase, tag: string) =>
    opened.sqlite.transaction(() => opened.sqlite.exec(rollback(tag)))();
  try {
    original = openDatabase(originalPath);
    migrateDatabase(original.db);
    seedBasics(original.db);
    seedIdentityContacts(original.db);
    // Bring the fixture to the predecessor schema (empty new structures: rollback is allowed).
    run(original, '0051_contact_archive');
    run(original, '0050_contact_alias');
    const tables = (opened: OpenedDatabase) =>
      (
        opened.sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all() as Array<{ name: string }>
      ).map((row) => row.name);
    const predecessorTables = tables(original);
    expect(predecessorTables).not.toContain('contact_alias');
    expect(
      (original.sqlite.prepare('PRAGMA table_info(contact)').all() as Array<{ name: string }>).map(
        (c) => c.name,
      ),
    ).not.toContain('archived_at');
    const dump = (opened: OpenedDatabase, names: string[]) =>
      Object.fromEntries(
        names
          .filter((n) => n !== '__drizzle_migrations')
          .map((name) => [
            name,
            opened.sqlite
              .prepare(
                name === 'contact'
                  ? 'SELECT id, name, note, created_at, updated_at, deleted_at FROM contact ORDER BY rowid'
                  : `SELECT * FROM "${name}" ORDER BY rowid`,
              )
              .all(),
          ]),
      );
    const before = dump(original, predecessorTables);
    const counts = (opened: OpenedDatabase, names: string[]) =>
      Object.fromEntries(
        names
          .filter((n) => n !== '__drizzle_migrations')
          .map((n) => [
            n,
            (opened.sqlite.prepare(`SELECT count(*) AS n FROM "${n}"`).get() as { n: number }).n,
          ]),
      );
    const beforeCounts = counts(original, predecessorTables);
    expect(beforeCounts['audit_log']).toBeGreaterThan(0);
    original.close();
    original = undefined;

    copyFileSync(originalPath, copiedPath);
    copy = openDatabase(copiedPath);
    migrateDatabase(copy.db);
    migrateDatabase(copy.db); // idempotent
    expect(dump(copy, predecessorTables)).toEqual(before);
    expect(counts(copy, predecessorTables)).toEqual(beforeCounts);
    expect(copy.sqlite.prepare('SELECT count(*) AS n FROM contact_alias').get()).toEqual({ n: 0 });
    expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(copy.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    const statements = () =>
      listContactStatements(copy!.db, '2026-09-17', true)
        .filter((c) => c.id === 'ka' || c.id === 'kb')
        .map((c) => [c.id, c.receivableCents, c.creditCents]);
    expect(statements()).toEqual([
      ['ka', 4500, 0],
      ['kb', 0, 0],
    ]);

    // Rollback of both steps on the unused copy is exact, then forward again.
    run(copy, '0051_contact_archive');
    run(copy, '0050_contact_alias');
    expect(dump(copy, predecessorTables)).toEqual(before);
    expect(counts(copy, predecessorTables)).toEqual(beforeCounts);
    migrateDatabase(copy.db);
    expect(statements()).toEqual([
      ['ka', 4500, 0],
      ['kb', 0, 0],
    ]);

    // Retained data refuses the downgrade atomically (bytes unchanged).
    const refuses = (tag: string) => {
      const bytes = copy!.sqlite.serialize();
      expect(() => run(copy!, tag)).toThrow();
      expect(copy!.sqlite.serialize().equals(bytes)).toBe(true);
    };
    refuses('0050_contact_alias'); // 0051 is still applied: never cross a later migration
    archiveContact(copy.db, 'kb', ctx());
    refuses('0051_contact_archive'); // archived contact
    addContactAlias(copy.db, 'ka', 'Kontakt A (alt)', ctx());
    expect(statements()).toEqual([
      ['ka', 4500, 0],
      ['kb', 0, 0],
    ]);
    original = openDatabase(originalPath);
    expect(dump(original, predecessorTables)).toEqual(before);
  } finally {
    copy?.close();
    original?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
