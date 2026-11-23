import {
  accountBalances,
  budget,
  freeUntilPaydayAsOf,
  getSecurity,
  investableAmountAsOf,
  netWorthAsOf,
  openReadonlyDatabase,
  portfolioPositions,
  type Db,
} from '@budget/db';
import { closeSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';

const supportedDate = (value: string) => value >= '1900' && value < '9900';
const date = z.iso.date().refine(supportedDate);
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(supportedDate);
const id = z.string().min(1);
// All supported figures are exact at their stored precision (docs/acceptance-tolerances.md).
const comparison = { expected: z.int(), tolerance: z.literal(0) };
const item = z.discriminatedUnion('figure', [
  z.strictObject({ figure: z.literal('account-balance'), accountId: id, date, ...comparison }),
  z.strictObject({ figure: z.literal('category-activity'), categoryId: id, month, ...comparison }),
  z.strictObject({ figure: z.literal('net-worth'), date, ...comparison }),
  z.strictObject({ figure: z.literal('holding-units'), securityId: id, date, ...comparison }),
  z.strictObject({ figure: z.literal('investable-amount'), date, ...comparison }),
  z.strictObject({ figure: z.literal('free-until-payday'), date, ...comparison }),
]);
const manifestSchema = z.strictObject({ version: z.literal(1), items: z.array(item).min(1) });

function readFigure(db: Db, entry: z.infer<typeof item>): number | undefined {
  switch (entry.figure) {
    case 'account-balance':
      return accountBalances(db, entry.date).find((row) => row.accountId === entry.accountId)
        ?.balanceCents;
    case 'category-activity': {
      const envelopes = budget(db, [entry.month])[0]?.envelopes;
      return envelopes && Object.hasOwn(envelopes, entry.categoryId)
        ? envelopes[entry.categoryId]?.activityCents
        : undefined;
    }
    case 'net-worth': {
      const result = netWorthAsOf(db, entry.date);
      return result.incomplete.some((position) => position.quality === 'missing')
        ? undefined
        : result.totalCents;
    }
    case 'holding-units':
      if (!getSecurity(db, entry.securityId)) return undefined;
      return (
        portfolioPositions(db, entry.date).positions.find(
          (row) => row.securityId === entry.securityId,
        )?.unitsE8 ?? 0
      );
    case 'investable-amount': {
      const result = investableAmountAsOf(db, entry.date);
      return 'unavailable' in result ? undefined : result.investableCents;
    }
    case 'free-until-payday': {
      const result = freeUntilPaydayAsOf(db, entry.date);
      return 'unavailable' in result ? undefined : result.freeCents;
    }
  }
}

// Opening a WAL database can create SQLite sidecar files even on a read-only connection.
// Require a standalone snapshot in rollback journal mode, such as a VACUUM INTO copy.
function openSnapshot(path: string) {
  const fd = openSync(path, 'r');
  try {
    const header = Buffer.alloc(20);
    return readSync(fd, header, 0, header.length, 0) === header.length &&
      header.subarray(0, 16).toString('ascii') === 'SQLite format 3\0' &&
      header[18] === 1 &&
      header[19] === 1
      ? openReadonlyDatabase(path)
      : null;
  } finally {
    closeSync(fd);
  }
}

function commandError(message: string): number {
  // Write synchronously before the operator CLI exits, including when output is redirected.
  writeFileSync(process.stderr.fd, `${message}\n`);
  return 2;
}

export function referenceCheck(databasePath: string, args: string[]): number {
  let file: string | undefined;
  try {
    file = parseArgs({ args, options: { manifest: { type: 'string' } } }).values.manifest;
  } catch {
    return commandError('Usage: reference-check --manifest <file>');
  }
  if (!file) return commandError('Usage: reference-check --manifest <file>');

  let input: unknown;
  try {
    input = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return commandError('Cannot read reference manifest as UTF-8 JSON.');
  }
  const manifest = manifestSchema.safeParse(input);
  if (!manifest.success) {
    const field = manifest.error.issues[0]?.path.join('.');
    return commandError(`Invalid reference manifest${field ? ` at ${field}` : ''}.`);
  }

  let opened;
  try {
    opened = openSnapshot(databasePath);
  } catch {
    return commandError('Cannot open reference database.');
  }
  if (!opened) return commandError('Reference database must be a standalone SQLite snapshot.');

  try {
    opened.sqlite.pragma('temp_store = MEMORY');
    const results = opened.sqlite.transaction(() =>
      manifest.data.items.map((entry, index) => {
        const { figure, expected, tolerance } = entry;
        const base = { item: index + 1, figure, expected, tolerance };
        try {
          const actual = readFigure(opened.db, entry);
          if (actual !== undefined && Number.isSafeInteger(actual))
            return { ...base, actual, pass: actual === expected };
          return { ...base, actual: null, pass: false, reason: 'unavailable' };
        } catch {
          return { ...base, actual: null, pass: false, reason: 'read_error' };
        }
      }),
    )();
    writeFileSync(
      process.stdout.fd,
      results.map((result) => JSON.stringify(result)).join('\n') + '\n',
    );
    return results.every((result) => result.pass) ? 0 : 1;
  } finally {
    opened.close();
  }
}
