import type Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { databaseStamp } from './request-memo';
import type { Executor } from './types';

/**
 * Ledger version: one counter row that SQLite triggers bump on every insert, update or delete of
 * a table the read models can read. Cached read models are valid while it is unchanged, so a write
 * that cannot change any model (session `last_seen_at`, audit rows, market run logs, the
 * Litestream commit) no longer throws the cache away.
 *
 * Safety: the counter moves inside the same transaction as the write, so a rollback undoes both,
 * and every connection (server, workers, operator scripts) bumps it because the triggers live in
 * the database file. New tables are covered by default: `ensureLedgerVersionTriggers` runs after
 * every migration and adds triggers for each table not listed in `NON_LEDGER_TABLES` (it also
 * restores triggers a table rebuild dropped). Excluding a table is the opt-out and needs a reason.
 */
export const NON_LEDGER_TABLES: ReadonlySet<string> = new Set([
  // Sessions and passkey ceremonies: `touchSession` writes every few minutes.
  'auth_session',
  'auth_challenge',
  'auth_event',
  'passkey',
  'recovery_code',
  // Market refresh bookkeeping; the prices it stores are in `price` / `fx_rate` (versioned).
  'market_run',
  'market_attempt',
  // One-off migration staging, read by no read model.
  'ynab_plan_row',
  'ynab_register_row',
  // Secrets; no model reads them.
  'payslip_secret',
]);

const EVENTS = [
  ['ai', 'INSERT'],
  ['au', 'UPDATE'],
  ['ad', 'DELETE'],
] as const;

/**
 * Tables whose UPDATE only counts when a listed column really changes: the overview page
 * re-evaluates the rules on every visit and upserts identical `rule_result` rows.
 */
export const UPDATE_ONLY_WHEN_CHANGED: Readonly<Record<string, readonly string[]>> = {
  rule_result: ['rule_id', 'as_of', 'status', 'value_text', 'detail_json', 'action_needed'],
};

/** `CREATE TRIGGER` statements (idempotent) that bump the ledger version for `table`. */
export function ledgerTriggerStatements(table: string): string[] {
  const changed = UPDATE_ONLY_WHEN_CHANGED[table];
  return EVENTS.map(([suffix, event]) => {
    const when =
      event === 'UPDATE' && changed
        ? ` WHEN ${changed.map((column) => `old.\`${column}\` IS NOT new.\`${column}\``).join(' OR ')}`
        : '';
    return `CREATE TRIGGER IF NOT EXISTS \`ledger_version_${table}_${suffix}\` AFTER ${event} ON \`${table}\`${when} BEGIN UPDATE \`ledger_version\` SET \`version\` = \`version\` + 1 WHERE \`id\` = 1; END`;
  });
}

export const LEDGER_VERSION_TABLE_SQL = [
  'CREATE TABLE IF NOT EXISTS `ledger_version` (`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1), `version` integer NOT NULL)',
  'INSERT OR IGNORE INTO `ledger_version` (`id`, `version`) VALUES (1, 0)',
];

const ledgerTables = (sqlite: Database.Database): string[] =>
  (
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite!_%' ESCAPE '!' AND name NOT LIKE '!_!_%' ESCAPE '!' AND name <> 'ledger_version'",
      )
      .all() as { name: string }[]
  )
    .map((row) => row.name)
    .filter((name) => !NON_LEDGER_TABLES.has(name));

/** What SQLite keeps of a trigger statement: the text without `IF NOT EXISTS`, whitespace folded. */
const normalized = (statement: string): string =>
  statement.replace(' IF NOT EXISTS', '').replace(/\s+/g, ' ').trim();

/**
 * Adds the counter row, any missing trigger and re-creates a trigger whose stored SQL differs from
 * the expected one (a stale definition would silently stop invalidating). Safe to run repeatedly;
 * changes no data. The check-and-create runs in one immediate transaction, so two starting
 * processes cannot interleave.
 */
export function ensureLedgerVersionTriggers(sqlite: Database.Database): void {
  const stored = new Map(
    (
      sqlite
        .prepare(
          `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'ledger_version_%'`,
        )
        .all() as { name: string; sql: string }[]
    ).map((row) => [row.name, normalized(row.sql)]),
  );
  const todo: string[] = [];
  for (const table of ledgerTables(sqlite))
    ledgerTriggerStatements(table).forEach((statement, index) => {
      const name = `ledger_version_${table}_${EVENTS[index]![0]}`;
      const current = stored.get(name);
      if (current === normalized(statement)) return;
      if (current !== undefined) todo.push(`DROP TRIGGER \`${name}\``);
      todo.push(statement);
    });
  const hasTable = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ledger_version'`)
    .get();
  if (hasTable && todo.length === 0) return;
  sqlite
    .transaction(() => {
      for (const statement of [...LEDGER_VERSION_TABLE_SQL, ...todo]) sqlite.exec(statement);
    })
    .immediate();
}

/**
 * The ledger version as a cache stamp. Reads the committed counter (also one another connection
 * bumped), so it is cheap and needs no per-connection bookkeeping.
 */
export function ledgerVersion(db: Executor): string {
  let row: { version: number } | undefined;
  try {
    row = db.get<{ version: number } | undefined>(
      sql`SELECT version FROM ledger_version WHERE id = 1`,
    );
  } catch {
    row = undefined;
  }
  // A database built without the migrations (test fixtures, an old restored copy) has no counter:
  // fall back to the conservative whole-database stamp, which invalidates on any write.
  return row ? String(row.version) : `db:${databaseStamp(db)}`;
}
