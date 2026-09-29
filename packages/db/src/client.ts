import Database from 'better-sqlite3';
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

export function migrateDatabase(db: Db, migrationsFolder = defaultMigrationsFolder()): void {
  migrate(db, { migrationsFolder });
}

/** Fresh in-memory database with all migrations applied. */
export function createTestDatabase(): OpenedDatabase {
  const opened = openDatabase(':memory:');
  migrateDatabase(opened.db);
  return opened;
}
