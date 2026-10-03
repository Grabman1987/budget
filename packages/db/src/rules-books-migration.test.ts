import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestDatabase, defaultMigrationsFolder, openDatabase } from './client';
import { security } from './schema';

describe('rules/books additive migration', () => {
  it('upgrades a populated pre-migration database to the fresh schema and keeps its rows', () => {
    const fresh = createTestDatabase();
    const upgraded = openDatabase(':memory:');
    try {
      const folder = defaultMigrationsFolder();
      const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
        entries: { tag: string }[];
      };
      const migration = journal.entries.findIndex((e) => e.tag.endsWith('_fluffy_harpoon'));
      expect(migration).toBeGreaterThan(0);
      const apply = (tag: string) =>
        upgraded.sqlite.exec(
          readFileSync(join(folder, `${tag}.sql`), 'utf8').replaceAll(
            '--> statement-breakpoint',
            '',
          ),
        );
      upgraded.sqlite.pragma('foreign_keys = OFF');
      for (const entry of journal.entries.slice(0, migration)) apply(entry.tag);
      upgraded.sqlite.pragma('foreign_keys = ON');
      upgraded.sqlite
        .prepare("INSERT INTO security (id, name, kind) VALUES ('s1', 'Synthetischer ETF', 'etf')")
        .run();
      apply(journal.entries[migration]!.tag);

      expect(upgraded.db.select().from(security).get()).toMatchObject({
        id: 's1',
        leverageFactor: 10,
      });
      // Later migrations upgrade the same database; the comparison is against the latest schema.
      for (const entry of journal.entries.slice(migration + 1)) apply(entry.tag);
      const schemaOf = (o: typeof fresh) =>
        o.sqlite
          .prepare(
            "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY type, name",
          )
          .all();
      const norm = (rows: unknown[]) => JSON.parse(JSON.stringify(rows).replace(/\s+/g, ' '));
      const columnsOf = (o: typeof fresh, table: string) => o.sqlite.pragma(`table_info(${table})`);
      expect(norm(schemaOf(upgraded)).map((r: { name: string }) => r.name)).toEqual(
        norm(schemaOf(fresh)).map((r: { name: string }) => r.name),
      );
      for (const table of ['security', 'employer_pension'])
        expect(columnsOf(upgraded, table)).toEqual(columnsOf(fresh, table));
      expect(upgraded.sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      fresh.close();
      upgraded.close();
    }
  });
});
