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

const TAG = '0052_contact_merge';

/** Migration folder that stops after 0051: the genuine predecessor schema, no rollback tricks. */
function predecessorFolder(root: string): string {
  const source = defaultMigrationsFolder();
  const folder = join(root, 'through-0051');
  mkdirSync(join(folder, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.filter((e) => e.tag < TAG);
  expect(journal.entries.at(-1)?.tag).toBe('0051_contact_archive');
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal));
  for (const e of journal.entries)
    copyFileSync(join(source, `${e.tag}.sql`), join(folder, `${e.tag}.sql`));
  return folder;
}

const tableNames = (o: OpenedDatabase) =>
  (
    o.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
/** Every table row, ordered, restricted to the columns that exist in the predecessor schema. */
const dump = (o: OpenedDatabase, skipColumn?: string) =>
  Object.fromEntries(
    tableNames(o).map((name) => {
      const columns = (o.sqlite.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[])
        .map((c) => c.name)
        .filter((c) => c !== skipColumn);
      return [
        name,
        o.sqlite
          .prepare(
            `SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM "${name}" ORDER BY rowid`,
          )
          .all(),
      ];
    }),
  );
const columns = (o: OpenedDatabase, table: string) =>
  (o.sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
const applied = (o: OpenedDatabase) =>
  (o.sqlite.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }).n;

it('#871 migration 0052 on a copy of a genuine 0051 database: data preserved, rollback exact and guarded', () => {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-contact-merge-871-'));
  let opened: OpenedDatabase | undefined;
  try {
    const path = join(root, 'predecessor.sqlite');
    const db = (opened = openDatabase(path));
    migrateDatabase(opened.db, predecessorFolder(root));
    expect(columns(opened, 'contact')).not.toContain('merged_into_id');
    // Synthetic rows through raw SQL only (nothing of the application layer touches 0052).
    opened.sqlite.exec(`
      INSERT INTO contact (id, name) VALUES ('ka', 'Kontakt A'), ('kb', 'Kontakt B');
      INSERT INTO contact (id, name, archived_at) VALUES ('kc', 'Kontakt C', '2026-02-01T00:00:00.000Z');
      INSERT INTO contact_alias (id, contact_id, alias, alias_norm) VALUES ('al1', 'ka', 'Kontakt A (alt)', 'kontakt a (alt)');
      INSERT INTO payee (id, name, contact_id) VALUES ('pb', 'Zahler B', 'kb');
      INSERT INTO audit_log (id, actor, action, entity_type, entity_id, after_json, group_id)
        VALUES ('au1', 'synthetic', 'create', 'contact', 'ka', '{"id":"ka","archived_at":null}', 'g1');
    `);
    const before = dump(opened);
    const beforeMigrations = applied(opened);

    migrateDatabase(opened.db); // applies exactly 0052
    migrateDatabase(opened.db); // idempotent
    expect(applied(opened)).toBe(beforeMigrations + 1);
    expect(columns(opened, 'contact')).toContain('merged_into_id');
    expect(dump(opened, 'merged_into_id')).toEqual(before);
    expect(
      opened.sqlite
        .prepare('SELECT count(*) AS n FROM contact WHERE merged_into_id IS NOT NULL')
        .get(),
    ).toEqual({ n: 0 });
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(opened.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);

    const rollback = readFileSync(
      join(defaultMigrationsFolder(), 'rollback', `${TAG}.sql`),
      'utf8',
    );
    const run = (o: OpenedDatabase) => o.sqlite.transaction(() => o.sqlite.exec(rollback))();

    // Rollback on unused data is exact; forward again restores the column.
    run(opened);
    expect(columns(opened, 'contact')).not.toContain('merged_into_id');
    expect(applied(opened)).toBe(beforeMigrations);
    expect(dump(opened)).toEqual(before);
    migrateDatabase(opened.db);
    expect(columns(opened, 'contact')).toContain('merged_into_id');

    // A merged contact refuses the downgrade atomically (bytes unchanged).
    opened.sqlite.exec("UPDATE contact SET merged_into_id = 'ka' WHERE id = 'kb'");
    let bytes = opened.sqlite.serialize();
    expect(() => run(db)).toThrow();
    expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
    // ...and so does audited merge intent although the pointer is gone (undone merge).
    opened.sqlite.exec(`
      UPDATE contact SET merged_into_id = NULL WHERE id = 'kb';
      INSERT INTO audit_log (id, actor, action, entity_type, entity_id, after_json, group_id)
        VALUES ('au2', 'synthetic', 'update', 'contact', 'kb', '{"merged_into_id":"ka"}', 'g2');
    `);
    bytes = opened.sqlite.serialize();
    expect(() => run(db)).toThrow();
    expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
  } finally {
    opened?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
