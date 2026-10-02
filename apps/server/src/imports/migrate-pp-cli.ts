import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { account, migrateDatabase, openDatabase, security } from '@budget/db';
import { todayInVienna } from '@budget/domain';
import { parsePp, proposeMigration, ppMigrationSchema } from '@budget/import-pp';
import { isNull } from 'drizzle-orm';
import type { Gate3Report, ReferenceValues } from './pp-report';
import { findPpRun, PpTaskError, runPpTask, type PpTask } from './pp-tasks';

/**
 * One-time Portfolio Performance migration on the server (owner decision 01.10.2026: no import
 * feature in the app; the owner-authorized migration runs as an operator task, `docs/ops.md`
 * §13). Same shape as `migrate-cli.js` for YNAB: stage, map, dry run, commit, report, revert, each
 * one transaction; revert undoes a whole run.
 *
 *   node migrate-pp-cli.js propose --file <pp.xml> --out <mapping.json>
 *   node migrate-pp-cli.js stage --file <pp.xml> [--mapping <mapping.json>]
 *   node migrate-pp-cli.js map --run <id> --mapping <mapping.json>
 *   node migrate-pp-cli.js dry-run|commit|report --run <id> [--days a,b] [--reference <file>] [--details]
 *   node migrate-pp-cli.js revert|delete --run <id>
 *
 * Output is aggregates only (counts, problem codes, figures per account); `--details` adds the
 * per-position and per-year lines for the operator's terminal and `--out <file>` writes the whole
 * report as JSON (keep it in private storage). Nothing is logged to files.
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
const ctx = { today: option('today') ?? todayInVienna() };

const readJson = (name: string) => JSON.parse(readFileSync(required(name), 'utf8')) as unknown;
const eur = (cents: number | null) =>
  cents === null
    ? '      n/a'
    : `${(cents / 100).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(12)}`;
const pct = (v: number | null) => (v === null ? '   n/a' : `${(v * 100).toFixed(2).padStart(7)}`);

function reportOptions() {
  const days = option('days')?.split(',').filter(Boolean);
  const reference = option('reference')
    ? (JSON.parse(readFileSync(required('reference'), 'utf8')) as ReferenceValues)
    : undefined;
  return { ...(days ? { days } : {}), ...(reference ? { reference } : {}) };
}

function run(task: PpTask) {
  return runPpTask(db, task, ctx);
}

function printProblems(problems: { severity: string; code: string; count: number }[]) {
  const errors = problems.filter((p) => p.severity === 'error');
  console.log(
    'problems      ',
    problems.length,
    'errors',
    errors.length,
    JSON.stringify(Object.fromEntries(problems.map((p) => [`${p.severity} ${p.code}`, p.count]))),
  );
}

function printChange(change: Record<string, unknown> | null | undefined) {
  if (!change) return;
  const c = change as Record<string, Record<string, number> | unknown>;
  for (const key of ['securities', 'assetClasses', 'prices', 'trades', 'bookings'])
    console.log(key.padEnd(14), JSON.stringify(c[key]));
  if (Object.keys((c['notes'] as object) ?? {}).length > 0)
    console.log('adjustments   ', JSON.stringify(c['notes']));
  for (const a of (c['accounts'] as {
    account: string;
    openingFromCents: number;
    openingToCents: number;
    adjustmentsRetired: number;
  }[]) ?? [])
    console.log(
      'account       ',
      a.account.padEnd(26),
      'opening',
      eur(a.openingFromCents),
      '->',
      eur(a.openingToCents),
      'adjustments retired',
      a.adjustmentsRetired,
    );
}

function printReport(report: Gate3Report | null | undefined) {
  if (!report) return;
  console.log('cost method   ', report.costMethod, '| days', report.days.join(' '));
  console.log('counts        ', JSON.stringify(report.counts));
  console.log('differences   ', JSON.stringify(report.differences));
  const lastDay = report.days[report.days.length - 1];
  console.log(`value per account on ${lastDay} (app | PP | diff):`);
  for (const a of report.accounts.filter((x) => x.day === lastDay))
    console.log(
      '  ',
      a.account.padEnd(26),
      eur(a.appValueCents),
      eur(a.ppValueCents),
      eur(a.diffCents),
      `cash ${eur(a.appCashCents)} | ${eur(a.ppCashCents)}`,
      a.appMissingQuotes + a.ppMissingQuotes > 0
        ? `missing quotes app ${a.appMissingQuotes} PP ${a.ppMissingQuotes}`
        : '',
    );
  console.log('returns per depot (TTWROR % | XIRR % ; app, PP replay):');
  for (const d of report.performance) {
    if (d.unavailable) {
      console.log('  ', d.account.padEnd(26), `unavailable (${d.unavailable})`);
      continue;
    }
    for (const p of d.periods)
      console.log(
        '  ',
        d.account.padEnd(26),
        p.period.padEnd(6),
        pct(p.app?.ttwror ?? null),
        pct(p.pp?.ttwror ?? null),
        '|',
        pct(p.app?.xirr ?? null),
        pct(p.pp?.xirr ?? null),
      );
  }
  const contributed = new Map<string, { pp: number; app: number }>();
  for (const l of report.cashFlows) {
    const e = contributed.get(l.account) ?? { pp: 0, app: 0 };
    e.pp += l.pp.netCents;
    e.app += l.app.netCents;
    contributed.set(l.account, e);
  }
  console.log('net money into the depot, all years (PP | app):');
  for (const [name, e] of contributed)
    console.log('  ', name.padEnd(26), eur(e.pp), eur(e.app), eur(e.app - e.pp));
}

function finish(body: Record<string, unknown>) {
  const out = option('out');
  if (out) writeFileSync(resolve(out), JSON.stringify(body, null, 1));
  if (args.includes('--details')) console.log(JSON.stringify(body, null, 1));
}

try {
  switch (command) {
    case 'propose': {
      const model = parsePp(new Uint8Array(readFileSync(required('file'))));
      const apps = db
        .select({
          id: account.id,
          name: account.name,
          role: account.role,
          currency: account.currency,
          openingDate: account.openingDate,
          openingBalanceCents: account.openingBalanceCents,
        })
        .from(account)
        .where(isNull(account.deletedAt))
        .all();
      const existing = db
        .select({
          id: security.id,
          name: security.name,
          isin: security.isin,
          symbol: security.symbol,
          currency: security.currency,
        })
        .from(security)
        .where(isNull(security.deletedAt))
        .all();
      const { doc, open } = proposeMigration(model, apps, existing);
      ppMigrationSchema.parse({
        ...doc,
        portfolios: Object.fromEntries(
          Object.entries(doc.portfolios).map(([k, v]) => [k, v === 'ignore' ? v : { ...v }]),
        ),
      });
      writeFileSync(resolve(required('out')), JSON.stringify(doc, null, 2));
      console.log('written       ', option('out'));
      console.log('open points   ', open.length);
      for (const line of open) console.log('  -', line);
      break;
    }
    case 'stage': {
      const file = required('file');
      const mapping = option('mapping') ? readJson('mapping') : undefined;
      const body = run({
        kind: 'stage',
        file: { name: basename(file), bytes: new Uint8Array(readFileSync(file)) },
        ...(mapping ? { mapping: mapping as never } : {}),
      });
      const view = body['run'] as { id: string; summary: unknown };
      console.log('run           ', view.id);
      console.log('same file as  ', JSON.stringify(body['sameFileAs']));
      console.log('mapping ver.  ', body['mappingVersion']);
      break;
    }
    case 'map': {
      const body = run({ kind: 'map', runId: required('run'), mapping: readJson('mapping') as never });
      console.log('mapping ver.  ', body['mappingVersion']);
      break;
    }
    case 'dry-run':
    case 'commit':
    case 'report': {
      const body = run({
        kind: command,
        runId: required('run'),
        options: reportOptions(),
      } as PpTask);
      console.log('mapping ver.  ', body['mappingVersion'] ?? (body['run'] as { mappingVersion: number }).mappingVersion);
      if (body['problems']) printProblems(body['problems'] as never);
      printChange(body['change'] as never);
      printReport(body['report'] as Gate3Report | null);
      if (command === 'commit') console.log('run status    ', (body['run'] as { status: string }).status);
      finish(body);
      break;
    }
    case 'revert': {
      const body = run({ kind: 'revert', runId: required('run'), force: args.includes('--force') });
      console.log('run status    ', (body['run'] as { status: string }).status);
      break;
    }
    case 'delete': {
      findPpRun(db, required('run'));
      console.log('deleted       ', run({ kind: 'delete', runId: required('run') })['deleted']);
      break;
    }
    default:
      console.log(
        'usage: migrate-pp-cli.js propose|stage|map|dry-run|commit|report|revert|delete [options]',
      );
      process.exitCode = 2;
  }
} catch (error) {
  if (error instanceof PpTaskError)
    console.error(`${error.code}: ${error.message}`, error.details ? JSON.stringify(error.details) : '');
  else console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
} finally {
  close();
}
