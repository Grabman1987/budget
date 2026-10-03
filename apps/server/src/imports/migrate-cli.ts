import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  applyBookEntries,
  applyInstrumentFacts,
  applyOwnerConfig,
  applyMoves,
  applyPayslips,
  listAuditGroups,
  migrateDatabase,
  openDatabase,
  orderAccountsByNames,
  parseBookFile,
  parseGroupsFile,
  parsePayslipsFile,
  parseInstrumentFactsFile,
  parseOwnerConfigFile,
  planGroupMoves,
  summarizeOwnerConfig,
  summarizePayslips,
  undoAuditGroups,
  type MovePlan,
} from '@budget/db';
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
 *   node migrate-cli.js list-groups --since <ISO ts> [--until <ts>] [--entity envelope_month] [--out <file>]
 *   node migrate-cli.js undo-group --group <id> [--group <id> ...] [--dry-run]
 *   node migrate-cli.js move-money --month YYYY-MM --from "<name>" --to "<name>" --cents N [--dry-run]
 *   node migrate-cli.js move-money --file <list-groups json> [--allow-unbalanced] [--dry-run]
 *   node migrate-cli.js book --file <json> [--dry-run] [--details]
 *   node migrate-cli.js payslips --file <json> [--dry-run] [--details] [--replace]
 *   node migrate-cli.js instrument-facts --file <json> [--dry-run]
 *   node migrate-cli.js owner-config --file <json> [--dry-run]
 *
 * Output is aggregates only (counts, problem codes, number of differences); `--details` adds the
 * differences themselves for the operator's terminal. Nothing is logged to files.
 *
 * `order-accounts` sets the owner's account order (`sortOrder`) by exact account name, one audit
 * group (the app's "Rückgängig" machinery can undo it by that group id). Names are separated
 * by `|`; unknown or ambiguous names are reported, never created; accounts not listed follow.
 *
 * `list-groups`, `undo-group` and `move-money` are for reverting an import run on which the owner
 * has already budgeted (the revert refuses while assignments of the owner sit on its categories):
 * list the owner's actions, undo them, revert and re-import, then re-apply the moves by category
 * name. All three only call the app's domain functions (`undo`, `moveMoney`, `assignMany`); the
 * writes are audited with the actor `operator`, one audit group per undo and per move.
 *
 * `book` adds, re-dates, re-prices, re-splits or deletes single bookings from a JSON list (private
 * file, never in the repo): `[{id, kind: add|change_amount|change_date|set_splits|delete, ...}]`. Accounts, categories
 * and payees are given by exact name (accounts and categories are never created, a payee is, as in
 * the app); an existing booking is addressed by `match {account, date, amountCents, payee?, memo?}`
 * and must resolve to exactly one. It calls the booking functions behind the HTTP routes, so
 * transfer pairing, splits, trade cash flows, reconciliation locks and envelopes hold as in the
 * app; what the app refuses is skipped. Each entry is one audit group (actor `operator`) that the
 * app's Rückgängig or `undo-group` reverts on its own. Skipped entries are reported with a reason
 * and the exit code is 3. Running a list twice adds twice: there is no de-duplication.
 * A transfer `add` may carry `transferCategory`; a `match` may be narrowed with `category` and
 * `transferAccount`. `unlock: true` on a change or delete entry unlocks that one reconciled booking (as the app's
 * `unlockReconciled`); without it a reconciled booking is skipped.
 *
 * `payslips` imports historical payslips from a private JSON file `{payslips: [...]}` whose entries
 * mirror the input of the app's payslip route (`month, kind, specialType, grossCents, svCents,
 * taxCents, netCents, lines`) plus `salaryBooking {account, date, amountCents, payee?}`, which is
 * resolved to exactly one booking (date within 3 days) for the link, else the payslip is imported
 * unlinked. One audit group per payslip (actor `operator`, `undo-group`). An existing payslip for
 * the same month, kind and special type is reported as `exists` and kept unless `--replace`.
 * `instrument-facts` enters private per-instrument values from a JSON file (never in the repo):
 * `{securities: [{isin, terBp?, leverageFactorTenths?}], employerPension: [{month, amountCents}],
 * bookSettings?: {birthYear?, birthMonth?}}`.
 * A security is matched by ISIN (exactly one live one, else skipped with a reason), only non-null
 * fields are written, equal values are reported as unchanged. Pension months are upserted through
 * the rules settings function. Every entry is one audit group (actor `operator`) that Rückgängig
 * or `undo-group` reverts on its own; `--dry-run` reports exactly what would change. Exit code 3
 * if an entry was skipped.
 * `owner-config` loads the owner's private settings from one JSON file (never in the repo), all
 * sections optional: `profile`, `rules`, `categoryStages`, `assetClasses`,
 * `securities`, `expectedPayments`, `skipOccurrences`, `clearBookings` (schema: docs/ops.md).
 * Every entry calls the function behind the matching app route, is one audit group (actor
 * `operator`, `undo-group` reverts it on its own) and reports `created`, `updated`, `unchanged`
 * or `skipped <reason>`; a second run reports everything as unchanged. Exit code 3 if an entry
 * was skipped; `--dry-run` rolls everything back and reports what would change.
 */

const args = process.argv.slice(2);
const command = args[0];
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const optionsAll = (name: string) =>
  args.flatMap((a, i) => (a === `--${name}` && args[i + 1] !== undefined ? [args[i + 1]!] : []));
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
    case 'list-groups': {
      const entity = option('entity');
      const until = option('until');
      const groups = listAuditGroups(db, {
        since: required('since'),
        ...(until && { until }),
        ...(entity && { entity }),
      });
      for (const g of groups) {
        console.log(g.groupId, g.ts, g.actor);
        for (const line of g.summary) console.log('   ', line);
      }
      console.log('groups        ', groups.length);
      const out = option('out');
      if (out) {
        const moves = groups
          .filter((g) => g.moves.length > 0)
          .map(({ groupId, ts, moves }) => ({ groupId, ts, moves }));
        writeFileSync(out, `${JSON.stringify(moves, null, 2)}${String.fromCharCode(10)}`);
        console.log('written       ', moves.length, 'groups with moves to', out);
      }
      break;
    }
    case 'undo-group': {
      const dryRun = args.includes('--dry-run');
      const done = undoAuditGroups(db, optionsAll('group'), { actor: 'operator' }, { dryRun });
      for (const d of done)
        console.log('undone        ', d.groupId, d.entries, 'entries', d.undoGroupId);
      console.log('groups        ', done.length, dryRun ? '(dry run)' : '');
      break;
    }
    case 'move-money': {
      const dryRun = args.includes('--dry-run');
      const file = option('file');
      let plan: MovePlan;
      if (file) {
        if (['month', 'from', 'to', 'cents'].some((n) => option(n) !== undefined))
          throw new Error('--file cannot be combined with --month, --from, --to or --cents');
        plan = planGroupMoves(parseGroupsFile(JSON.parse(readFileSync(file, 'utf8'))), {
          allowUnbalanced: args.includes('--allow-unbalanced'),
        });
      } else {
        const text = required('cents');
        if (!/^\d+$/.test(text)) throw new Error('--cents must be a positive whole number');
        plan = {
          moves: [
            {
              month: required('month'),
              from: required('from').trim(),
              to: required('to').trim(),
              cents: Number(text),
            },
          ],
          assignments: [],
          skipped: [],
        };
      }
      for (const s of plan.skipped)
        console.log(
          'skipped       ',
          s.groupId ?? '-',
          s.month,
          s.reason,
          `net ${s.netCents}`,
          JSON.stringify(s.lines),
        );
      const done = applyMoves(db, plan, { actor: 'operator' }, { dryRun });
      for (const d of done)
        console.log(
          d.kind === 'move' ? 'moved         ' : 'assigned      ',
          d.month,
          d.kind === 'move' ? `${d.from} -> ${d.to}` : d.category,
          d.cents,
          d.groupId,
        );
      console.log(
        'moves         ',
        done.length,
        'skipped',
        plan.skipped.length,
        dryRun ? '(dry run)' : '',
      );
      if (plan.skipped.length > 0) process.exitCode = 3;
      break;
    }
    case 'book': {
      const dryRun = args.includes('--dry-run');
      const entries = parseBookFile(JSON.parse(readFileSync(required('file'), 'utf8')));
      const outcomes = applyBookEntries(db, entries, { actor: 'operator' }, { dryRun });
      let skipped = 0;
      for (const o of outcomes) {
        if (o.status === 'skipped') {
          skipped += 1;
          console.log('skipped       ', o.id, o.reason, o.candidates);
          if (args.includes('--details')) console.log('              ', o.detail);
          continue;
        }
        console.log(o.kind, o.id, o.account, o.date, o.cents, o.groupId || '(dry run)');
      }
      console.log(
        'entries       ',
        outcomes.length,
        'done',
        outcomes.length - skipped,
        'skipped',
        skipped,
        dryRun ? '(dry run)' : '',
      );
      if (skipped > 0) process.exitCode = 3;
      break;
    }
    case 'payslips': {
      const dryRun = args.includes('--dry-run');
      const replace = args.includes('--replace');
      const entries = parsePayslipsFile(JSON.parse(readFileSync(required('file'), 'utf8')));
      const outcomes = applyPayslips(db, entries, { actor: 'operator' }, { dryRun, replace });
      const details = args.includes('--details');
      for (const o of outcomes) {
        const slip = `${o.month} ${o.kind}${o.specialType ? `/${o.specialType}` : ''}`;
        if (o.status === 'skipped') {
          console.log('skipped       ', slip, o.reason);
          if (details) console.log('              ', o.detail);
          continue;
        }
        if (o.status === 'exists') {
          console.log('exists        ', slip);
          continue;
        }
        const link = o.linked ? 'linked' : `unlinked ${o.unlinkedReason ?? ''}`.trim();
        console.log(o.status.padEnd(14), slip, link, o.groupId || '(dry run)');
        if (details && !o.linked)
          console.log(
            '              ',
            `net ${o.netCents}`,
            `candidates ${o.candidates ?? 0}`,
            o.detail ?? '',
          );
      }
      const sum = summarizePayslips(outcomes);
      console.log(
        'payslips',
        sum.payslips,
        'created',
        sum.created,
        ...(replace ? ['replaced', sum.replaced] : []),
        'exists',
        sum.exists,
        'unlinked',
        sum.unlinked,
        'skipped',
        sum.skipped,
        dryRun ? '(dry run)' : '',
      );
      if (sum.skipped > 0) process.exitCode = 3;
      break;
    }
    case 'instrument-facts': {
      const dryRun = args.includes('--dry-run');
      const facts = parseInstrumentFactsFile(
        JSON.parse(readFileSync(required('file'), 'utf8')),
        ctx.today,
      );
      const result = applyInstrumentFacts(
        db,
        facts,
        { actor: 'operator' },
        { dryRun, today: ctx.today },
      );
      const count = (status: string) => result.securities.filter((o) => o.status === status).length;
      for (const o of result.securities) {
        if (o.status === 'skipped') {
          console.log('skipped       ', o.isin, o.reason, o.candidates);
          if (args.includes('--details')) console.log('              ', o.detail);
        } else
          console.log(
            o.status === 'updated' ? 'updated       ' : 'unchanged     ',
            o.isin,
            o.changes.join(', '),
            o.groupId || (o.status === 'updated' ? '(dry run)' : ''),
          );
      }
      for (const o of result.pension)
        console.log(
          o.status === 'upserted' ? 'pension       ' : `pension ${o.status}`.padEnd(14),
          o.month,
          o.amountCents,
          o.detail,
          o.groupId || (o.status === 'upserted' ? '(dry run)' : ''),
        );
      if (result.settings) {
        const o = result.settings;
        console.log(
          o.status === 'updated' ? 'settings       ' : `settings ${o.status}`.padEnd(14),
          o.birthMonth,
          o.detail,
          o.groupId || (o.status === 'updated' ? '(dry run)' : ''),
        );
      }
      const secSkipped = count('skipped');
      const pensionSkipped = result.pension.filter((o) => o.status === 'skipped').length;
      console.log(
        'securities    ',
        result.securities.length,
        'updated',
        count('updated'),
        'unchanged',
        count('unchanged'),
        'skipped',
        secSkipped,
        dryRun ? '(dry run)' : '',
      );
      console.log(
        'pension       ',
        result.pension.filter((o) => o.status === 'upserted').length,
        'upserted',
        result.pension.filter((o) => o.status === 'unchanged').length,
        'unchanged',
        pensionSkipped,
        'skipped',
        dryRun ? '(dry run)' : '',
      );
      if (result.settings)
        console.log('settings      ', result.settings.status, dryRun ? '(dry run)' : '');
      if (secSkipped + pensionSkipped + (result.settings?.status === 'skipped' ? 1 : 0) > 0)
        process.exitCode = 3;
      break;
    }
    case 'owner-config': {
      const dryRun = args.includes('--dry-run');
      const config = parseOwnerConfigFile(
        JSON.parse(readFileSync(required('file'), 'utf8')),
        ctx.today,
      );
      const outcomes = applyOwnerConfig(
        db,
        config,
        { actor: 'operator' },
        { dryRun, today: ctx.today },
      );
      for (const o of outcomes) {
        if (o.status === 'skipped') {
          console.log('skipped       ', o.section, o.key, o.reason);
          if (args.includes('--details')) console.log('              ', o.detail);
        } else
          console.log(
            o.status.padEnd(14),
            o.section,
            o.key,
            o.detail,
            o.groupId || (o.status === 'unchanged' ? '' : '(dry run)'),
          );
      }
      for (const s of summarizeOwnerConfig(outcomes))
        console.log(
          s.section.padEnd(16),
          'created',
          s.created,
          'updated',
          s.updated,
          'unchanged',
          s.unchanged,
          'skipped',
          s.skipped,
          dryRun ? '(dry run)' : '',
        );
      if (outcomes.some((o) => o.status === 'skipped')) process.exitCode = 3;
      break;
    }
    default:
      console.log(
        'usage: migrate-cli.js stage|dry-run|report|commit|revert|delete|order-accounts|list-groups|undo-group|move-money|book|payslips|instrument-facts|owner-config [options]',
      );
      process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
} finally {
  close();
}
