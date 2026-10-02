import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { migrateDatabase, openDatabase, orderAccountsByNames } from '@budget/db';
import { todayInVienna } from '@budget/domain';
import { mappingSchema } from '@budget/import-ynab';
import { deleteRun, saveMapping } from './staging';
import { findRun, runTask, type ImportTask } from './tasks';

/**
 * One-time YNAB migration on the server (owner decision 01.10.2026: no import feature in the app;
 * the owner-authorized migration runs as an operator task). Same tasks as the former wizard:
 * stage → mapping → dry run (Gate 2) → commit, each one transaction; revert undoes a whole run.
 *
 *   node migrate-cli.js stage --register <file> --plan <file> --mapping <file>
 *   node migrate-cli.js dry-run|report|commit|revert|delete --run <id>
 *   node migrate-cli.js order-accounts --names "A|B|C" [--dry-run]
 *
 * Output is aggregates only (counts, problem codes, number of differences); `--details` adds the
 * differences themselves for the operator's terminal. Nothing is logged to files.
 *
 * `order-accounts` sets the owner's account order (`sortOrder`) by exact account name, one audit
 * group (the app's "Rückgängig" machinery can undo it by that group id). Names are separated
 * by `|`; unknown or ambiguous names are reported, never created; accounts not listed follow.
 */

const args = process.argv.slice(2);
const command = args[0];
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const required = (name: string) => {
  const value = option(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
};

const dataDir = resolve(process.env['DATA_DIR'] ?? 'data');
const databasePath = resolve(process.env['DATABASE_PATH'] ?? resolve(dataDir, 'budget.sqlite'));
const { db, close } = openDatabase(databasePath);
// The server migrates at start; a fresh local database (a test run) needs it here too.
if (process.env['BUDGET_MIGRATIONS_DIR']) migrateDatabase(db, process.env['BUDGET_MIGRATIONS_DIR']);
const ctx = { today: todayInVienna() };

function run(task: ImportTask) {
  const { status, body } = runTask(db, task, ctx);
  return { status, body: body as Record<string, unknown> };
}

interface Problem {
  severity: string;
  code: string;
}
function printEvaluation(body: Record<string, unknown>) {
  const problems = (body['problems'] as Problem[] | undefined) ?? [];
  const byCode = new Map<string, number>();
  for (const p of problems)
    byCode.set(`${p.severity} ${p.code}`, (byCode.get(`${p.severity} ${p.code}`) ?? 0) + 1);
  const rec = body['reconciliation'] as {
    differences: unknown[];
    checked: unknown;
    moved: unknown[];
  };
  const ledger = (body['ledger'] as unknown[] | undefined) ?? [];
  console.log('start month   ', body['startMonth']);
  console.log('mapping ver.  ', body['mappingVersion']);
  console.log('accounts      ', (body['accounts'] as unknown[]).length);
  console.log('problems      ', problems.length, Object.fromEntries(byCode));
  console.log('checked       ', JSON.stringify(rec.checked));
  console.log('differences   ', rec.differences.length, '(Gate 2: export vs. target model)');
  console.log('moved by rules', rec.moved.length);
  console.log('app vs import ', ledger.length, '(written ledger vs. target model)');
  if (body['change']) console.log('change        ', JSON.stringify(body['change']));
  if (args.includes('--details')) {
    console.log(JSON.stringify({ differences: rec.differences, ledger }, null, 1));
  }
}

try {
  switch (command) {
    case 'stage': {
      const register = required('register');
      const plan = required('plan');
      const mapping = mappingSchema.parse(JSON.parse(readFileSync(required('mapping'), 'utf8')));
      const { status, body } = run({
        kind: 'stage',
        register: { name: basename(register), bytes: readFileSync(register) },
        plan: { name: basename(plan), bytes: readFileSync(plan) },
      });
      if (status !== 201 && status !== 200)
        throw new Error(`stage failed: ${JSON.stringify(body)}`);
      const runView = body['run'] as { id: string; summary: unknown } | undefined;
      if (!runView) throw new Error(`stage failed: ${JSON.stringify(body)}`);
      const version = saveMapping(db, runView.id, mapping);
      console.log('run           ', runView.id);
      console.log('summary       ', JSON.stringify(runView.summary));
      console.log('same export as', JSON.stringify(body['sameExportAs']));
      console.log('mapping ver.  ', version);
      break;
    }
    case 'dry-run':
    case 'report':
      printEvaluation(run({ kind: command, runId: required('run') }).body);
      break;
    case 'commit': {
      const { body } = run({ kind: 'commit', runId: required('run'), deleteMissing: false });
      printEvaluation(body);
      console.log('run status    ', (body['run'] as { status: string }).status);
      break;
    }
    case 'revert': {
      const { body } = run({ kind: 'revert', runId: required('run'), force: false });
      console.log('run status    ', (body['run'] as { status: string }).status);
      break;
    }
    case 'delete': {
      console.log('deleted       ', deleteRun(db, findRun(db, required('run'))));
      break;
    }
    case 'order-accounts': {
      const names = required('names').split('|');
      const result = orderAccountsByNames(
        db,
        names,
        { actor: 'operator' },
        {
          dryRun: args.includes('--dry-run'),
        },
      );
      const listed = names.filter((n) => n.trim()).length - result.unknown.length;
      console.log('listed names  ', names.filter((n) => n.trim()).length);
      console.log('matched       ', listed - result.ambiguous.length);
      console.log('unknown       ', result.unknown.length, JSON.stringify(result.unknown));
      console.log('ambiguous     ', result.ambiguous.length, JSON.stringify(result.ambiguous));
      console.log('accounts total', result.order.length);
      console.log('rows changed  ', result.changed, args.includes('--dry-run') ? '(dry run)' : '');
      if (result.groupId) console.log('audit group   ', result.groupId);
      break;
    }
    default:
      console.log(
        'usage: migrate-cli.js stage|dry-run|report|commit|revert|delete|order-accounts [options]',
      );
      process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
} finally {
  close();
}
