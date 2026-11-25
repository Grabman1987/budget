import type Database from 'better-sqlite3';

/**
 * Statement cache of a read snapshot (`runInReadSnapshot`).
 *
 * Inside a read snapshot of a connection that never writes (`query_only`) the database cannot
 * change, so one `SELECT` with the same text and the same parameters always returns the same rows.
 * Read models are composed of many repos that each load the same small tables (categories, rules,
 * accounts, ...) or the same whole-ledger sets (bookings, splits, balances per day); they ask the
 * same question many times within one request. While a snapshot is open, `connection.prepare` is
 * replaced on that one connection object by a version whose statements answer a repeated read from
 * the first answer. Nothing else changes: the SQL, its parameters and the result shape stay as the
 * caller asked for them, and every answer is a fresh shallow copy, so a caller that edits its rows
 * cannot change what the next caller gets.
 *
 * Only plain `SELECT`/`WITH` statements without time- or connection-dependent functions are cached;
 * everything else (writes, pragmas, `iterate`, named parameters, blobs) goes straight to SQLite.
 */

/** Statements whose answer can differ between two runs of one snapshot. */
const VOLATILE =
  /\b(random|randomblob|now|current_date|current_time|current_timestamp|changes|total_changes|last_insert_rowid|data_version|pragma_[a-z_]+)\b|\bpragma\b/i;
const READ = /^\s*(?:--[^\n]*\n\s*)*(select|with)\b/i;
/** A result is not kept when it has more cells than this (one whole-ledger load is ~1M). */
const MAX_CELLS = 4_000_000;

export interface StatementCacheStats {
  /** Statements that reached SQLite. */
  executed: number;
  /** Statements answered from an earlier answer. */
  reused: number;
}

type Row = unknown[] | Record<string, unknown>;

const keyOfParams = (params: unknown[]): string | null => {
  let key = '';
  for (const p of params) {
    switch (typeof p) {
      case 'string':
        key += `s${p.length}:${p}`;
        break;
      case 'number':
      case 'bigint':
      case 'boolean':
        key += `${typeof p}${String(p)};`;
        break;
      case 'object':
        if (p === null) {
          key += 'n;';
          break;
        }
        return null;
      default:
        return null;
    }
  }
  return key;
};

const copy = (row: unknown): unknown =>
  Array.isArray(row)
    ? row.slice()
    : row && typeof row === 'object'
      ? { ...(row as Record<string, unknown>) }
      : row;

/** Replaces `connection.prepare` until the returned function is called. */
export function installStatementCache(
  connection: Database.Database,
  stats: StatementCacheStats = { executed: 0, reused: 0 },
): () => void {
  const answers = new Map<string, { value: unknown; many: boolean }>();
  let cells = 0;
  const original = connection.prepare.bind(connection) as (source: string) => Database.Statement;
  const wrapped = (source: string) => {
    const statement = original(source);
    if (!statement.reader || !READ.test(source) || VOLATILE.test(source)) return statement;
    let raw = false;
    let plain = true;
    const read = (many: boolean, args: unknown[]): unknown => {
      const run = (): unknown =>
        many
          ? (statement.all as (...a: unknown[]) => unknown[])(...args)
          : (statement.get as (...a: unknown[]) => unknown)(...args);
      const params = plain ? keyOfParams(args) : null;
      if (params === null) return run();
      const key = `${many ? 'a' : 'g'}${raw ? 'r' : 'o'}|${source}|${params}`;
      let hit = answers.get(key);
      if (!hit) {
        stats.executed += 1;
        const value = run();
        hit = { value, many };
        const size = many ? (value as Row[]).length * (raw ? 8 : 1) : 1;
        if (cells + size > MAX_CELLS) return value;
        cells += size;
        answers.set(key, hit);
        return many ? (value as unknown[]).map(copy) : copy(value);
      }
      stats.reused += 1;
      return many ? (hit.value as unknown[]).map(copy) : copy(hit.value);
    };
    const proxy: Database.Statement = new Proxy(statement, {
      get(target, property) {
        if (property === 'raw')
          return (flag?: boolean) => {
            raw = flag ?? true;
            target.raw(raw);
            return proxy;
          };
        if (property === 'all') return (...args: unknown[]) => read(true, args);
        if (property === 'get') return (...args: unknown[]) => read(false, args);
        const member = Reflect.get(target, property, target);
        if (typeof member !== 'function') return member;
        // `pluck`, `expand`, `safeIntegers`, `bind`, `iterate`, `run`, ...: change or bypass the
        // answer format, so this statement stops using the cache.
        return (...args: unknown[]) => {
          plain = false;
          const result = (member as (...a: unknown[]) => unknown).apply(target, args);
          return result === target ? proxy : result;
        };
      },
    });
    return proxy;
  };
  const patched = connection as unknown as { prepare: unknown };
  patched.prepare = wrapped;
  return () => {
    delete (patched as { prepare?: unknown }).prepare;
  };
}
