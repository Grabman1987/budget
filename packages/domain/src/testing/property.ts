import fc from 'fast-check';

/**
 * Seeded, reproducible property tests (cockpit F8).
 *
 * - The seed is fixed (`DEFAULT_SEED`), so CI runs are deterministic and a red run can be replayed
 *   locally with the very same inputs.
 * - `PROPERTY_SEED=<int>` replays a reported seed, `PROPERTY_SEED=random` explores new inputs.
 * - `PROPERTY_RUNS=<n>` overrides every run count (e.g. a long nightly soak).
 * - A failure rethrows with the seed, the shrunk counterexample and a copy-paste replay command.
 */
export const DEFAULT_SEED = 20_261_117;

/** Environment lookup without Node typings (the domain package is platform-neutral). */
const env = (name: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];

function resolveSeed(): number {
  const raw = env('PROPERTY_SEED');
  if (raw === undefined || raw === '') return DEFAULT_SEED;
  if (raw === 'random') return Math.floor(Math.random() * 2 ** 31);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`PROPERTY_SEED must be an integer or "random"`);
  return parsed;
}

export const propertySeed: number = resolveSeed();

/** Run count for a property: `PROPERTY_RUNS` when set, else the property's own default. */
export function propertyRuns(defaultRuns: number): number {
  const raw = env('PROPERTY_RUNS');
  if (raw === undefined || raw === '') return defaultRuns;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error('PROPERTY_RUNS must be >= 1');
  return parsed;
}

/** `fc.assert` with the fixed seed; on failure the message names the seed and how to replay it. */
export function checkProperty<T>(
  name: string,
  property: fc.IPropertyWithHooks<T> | fc.IAsyncPropertyWithHooks<T>,
  defaultRuns: number,
): void | Promise<void> {
  const numRuns = propertyRuns(defaultRuns);
  const wrap = (error: unknown): never => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Property "${name}" failed (seed ${propertySeed}, ${numRuns} runs).\n` +
        `Replay: PROPERTY_SEED=${propertySeed} npx vitest run -t "${name}"\n${message}`,
      { cause: error },
    );
  };
  try {
    const result = fc.assert(property as fc.IPropertyWithHooks<T>, {
      seed: propertySeed,
      numRuns,
      endOnFailure: false,
    }) as void | Promise<void>;
    if (result && typeof (result as Promise<void>).then === 'function')
      return (result as Promise<void>).catch(wrap);
  } catch (error) {
    wrap(error);
  }
}

/** Minimal handle of a SQLite connection (better-sqlite3) for the canonical dump. */
export interface DumpSource {
  prepare(sql: string): { all(...args: unknown[]): unknown[] };
}

export interface DumpOptions {
  /** Tables left out entirely (e.g. the audit log, which grows with every write and undo). */
  skipTables?: ReadonlyArray<string>;
  /** Leave out soft-deleted rows (`deleted_at` set): a hidden row counts as absent. */
  liveOnly?: boolean;
  /** Further row filter (e.g. rows that only hang off hidden parents). */
  keepRow?: (table: string, row: Record<string, unknown>) => boolean;
}

/**
 * Canonical, order-independent dump of every table: rows serialised as JSON and sorted, with the
 * volatile `created_at` / `updated_at` columns left out. Two databases hold the same data exactly
 * when their dumps are equal.
 */
export function canonicalDump(
  source: DumpSource,
  { skipTables = [], liveOnly = false, keepRow }: DumpOptions = {},
): Record<string, string[]> {
  const tables = source
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%drizzle%' ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  const dump: Record<string, string[]> = {};
  for (const { name } of tables) {
    // ledger_version is a monotone cache-invalidation counter bumped by every write, undo included.
    if (name === 'ledger_version' || skipTables.includes(name)) continue;
    const rows = (source.prepare(`SELECT * FROM "${name}"`).all() as Array<Record<string, unknown>>)
      .filter((row) => !(liveOnly && row['deleted_at'] != null))
      .filter((row) => keepRow?.(name, row) ?? true);
    const lines = rows.map((row) => {
      const copy: Record<string, unknown> = {};
      for (const key of Object.keys(row).sort())
        if (key !== 'created_at' && key !== 'updated_at') copy[key] = row[key];
      return JSON.stringify(copy);
    });
    if (lines.length > 0) dump[name] = lines.sort();
  }
  return dump;
}
