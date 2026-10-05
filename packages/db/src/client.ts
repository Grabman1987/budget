import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { moduleRelativePath } from './paths';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

export interface OpenedDatabase {
  db: Db;
  /** The underlying connection (pragmas, backups, closing). */
  sqlite: Database.Database;
  close: () => void;
}

/** Folder with the generated SQL migrations. Override with `BUDGET_MIGRATIONS_DIR` in bundles. */
export const defaultMigrationsFolder = (): string =>
  process.env['BUDGET_MIGRATIONS_DIR'] ?? moduleRelativePath(import.meta.url, '../drizzle');

/**
 * Open a SQLite database with the settings the app relies on: WAL (Litestream), enforced foreign
 * keys, a busy timeout. `':memory:'` is used by tests.
 */
export function openDatabase(path: string): OpenedDatabase {
  const sqlite = new Database(path);
  if (path !== ':memory:') sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, close: () => sqlite.close() };
}

/** The better-sqlite3 connection under a Drizzle handle (`drizzle()` sets `$client`). */
export const sqliteOf = (db: Db): Database.Database =>
  (db as Db & { $client: Database.Database }).$client;

/**
 * Apply pending migrations. Foreign keys are off while they run: SQLite's recommended way to
 * rebuild tables (a parent table is dropped and re-created while child rows point to it; deferred
 * checks would count that as a violation). Afterwards `foreign_key_check` must be empty, else the
 * start fails loudly.
 */
export function migrateDatabase(db: Db, migrationsFolder = defaultMigrationsFolder()): void {
  db.run(sql`PRAGMA foreign_keys = OFF`);
  try {
    migrate(db, { migrationsFolder });
    const problems = db.all(sql`PRAGMA foreign_key_check`);
    if (problems.length > 0) {
      throw new Error(
        `Migration left ${problems.length} foreign key violation(s): ${JSON.stringify(problems.slice(0, 5))}`,
      );
    }
  } finally {
    db.run(sql`PRAGMA foreign_keys = ON`);
  }
}

let migratedTemplate: Buffer | undefined;

/**
 * Fresh in-memory database with all migrations applied. Migrating takes ~0.4 s, so each test
 * process migrates once and every further database is a copy of that image (~0.3 ms).
 */
export function createTestDatabase(): OpenedDatabase {
  if (!migratedTemplate) {
    const template = openDatabase(':memory:');
    migrateDatabase(template.db);
    migratedTemplate = template.sqlite.serialize();
    template.close();
  }
  const sqlite = new Database(migratedTemplate);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, close: () => sqlite.close() };
}
