import { afterEach, expect, it } from 'vitest';
import {
  copyFileSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { migrateDatabase, openDatabase, stageStatementIntake } from '@budget/db';
import { parseStatementText } from '@budget/domain';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { syntheticColumnarPayslipPdf } from '../payslips/testing';
import { createBackupArchive, tarBinary } from '../backup/backup';
import { digest, storeReceipt } from '../receipts/files';
import { statementExtract } from '../../../../scripts/statement-extract';
import { extractStatement } from './service';
const dirs: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'statement-726-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const pdf = () =>
  syntheticColumnarPayslipPdf(
    [
      [{ x: 40, text: 'Rechnungsdatum: 01.10.2026' }],
      [{ x: 40, text: 'Abrechnungsbetrag: 120,00 EUR' }],
    ],
    '',
  );
it('upgrades a synthetic database COPY without changing old rows, round-trips an empty rollback, and refuses populated rollback', () => {
  const d = temp(),
    m = join(d, 'migrations');
  cpSync(resolve('packages/db/drizzle'), m, { recursive: true });
  const journal = JSON.parse(readFileSync(join(m, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number }[];
  };
  journal.entries = journal.entries.filter((e) => e.idx < 45);
  writeFileSync(join(m, 'meta/_journal.json'), JSON.stringify(journal));
  const source = openDatabase(join(d, 'original.sqlite'));
  migrateDatabase(source.db, m);
  seedBasics(source.db);
  source.sqlite.pragma('wal_checkpoint(TRUNCATE)');
  copyFileSync(source.sqlite.name, join(d, 'copy.sqlite'));
  source.close();
  const copy = openDatabase(join(d, 'copy.sqlite'));
  try {
    const tables = copy.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='__drizzle_migrations' ORDER BY name",
      )
      .all() as { name: string }[];
    const rows = () =>
      JSON.stringify(
        tables.map((t) => copy.sqlite.prepare(`SELECT * FROM "${t.name}" ORDER BY rowid`).all()),
      );
    const before = rows();
    migrateDatabase(copy.db);
    expect(rows()).toBe(before);
    expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
    const down = readFileSync(
      resolve('packages/db/drizzle/rollback/0045_statement_intake.sql'),
      'utf8',
    );
    copy.sqlite.transaction(() => copy.sqlite.exec(down))();
    expect(rows()).toBe(before);
    migrateDatabase(copy.db);
    stageStatementIntake(
      copy.db,
      {
        accountId: 'giro',
        sha256: 'a'.repeat(64),
        sizeBytes: 10,
        filename: 's.pdf',
        proposal: parseStatementText('', 'a'.repeat(64)),
      },
      { actor: 'test' },
    );
    expect(() => copy.sqlite.transaction(() => copy.sqlite.exec(down))()).toThrow();
    expect(copy.sqlite.prepare('SELECT count(*) n FROM statement_intake').get()).toEqual({ n: 1 });
    expect(copy.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  } finally {
    copy.close();
  }
});
it('backs up and restores an unbooked pending source PDF and its metadata using the unchanged backup format', async () => {
  const d = temp(),
    blobs = join(d, 'blobs'),
    bytes = await pdf(),
    db = openDatabase(join(d, 'ledger.sqlite'));
  migrateDatabase(db.db);
  seedBasics(db.db);
  try {
    const sha = await storeReceipt(blobs, bytes);
    stageStatementIntake(
      db.db,
      {
        accountId: 'giro',
        sha256: sha,
        sizeBytes: bytes.length,
        filename: 'synthetic.pdf',
        proposal: await extractStatement(bytes),
      },
      { actor: 'test' },
    );
    const archive = await createBackupArchive(db.sqlite, d, blobs),
      out = join(d, 'restored');
    mkdirSync(out);
    execFileSync(tarBinary, ['-xf', archive, '-C', out]);
    expect(readFileSync(join(out, 'receipts', sha))).toEqual(bytes);
    const restored = openDatabase(join(out, 'budget.sqlite'));
    try {
      expect(restored.sqlite.prepare('SELECT sha256,status FROM statement_intake').get()).toEqual({
        sha256: sha,
        status: 'pending',
      });
      expect(restored.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    } finally {
      restored.close();
    }
  } finally {
    db.close();
  }
});
it('shares the parser with a one-file private CLI, refuses overwrite, and never needs a DB/network or password argument', async () => {
  const d = temp(),
    input = join(d, 'synthetic.pdf'),
    output = join(d, 'private.json'),
    bytes = await pdf();
  writeFileSync(input, bytes);
  async function* empty() {
    yield Buffer.from('');
  }
  await statementExtract([input, output], empty());
  expect(lstatSync(output).mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({
    sha256: digest(bytes),
    fields: { payableCents: { value: 12000 }, debitDate: { value: null } },
  });
  await expect(statementExtract([input, output], empty())).rejects.toThrow();
  await expect(statementExtract([input, output, '--password=secret'], empty())).rejects.toThrow();
});
it('retains encrypted/unreadable source states without fabricating fields or page provenance', async () => {
  const bytes = await syntheticColumnarPayslipPdf(
    [[{ x: 40, text: 'Abrechnungsbetrag: 120,00 EUR' }]],
    'synthetic-password',
  );
  expect((await extractStatement(bytes)).extraction).toBe('password_required');
  expect((await extractStatement(bytes, 'wrong')).fields.payableCents.value).toBeNull();
  expect((await extractStatement(bytes, 'synthetic-password')).fields.payableCents.value).toBe(
    12000,
  );
  expect((await extractStatement(Buffer.from('%PDF-invalid synthetic'))).extraction).toBe(
    'unreadable_or_limit',
  );
});
it('runs the actual TypeScript CLI subprocess with the same bounded PDF worker and private output', async () => {
  const d = temp(),
    input = join(d, 'synthetic-cli.pdf'),
    output = join(d, 'private-cli.json'),
    bytes = await pdf();
  writeFileSync(input, bytes);
  const stdout = execFileSync(
    process.execPath,
    ['--import', 'tsx', resolve('scripts/statement-extract.ts'), input, output],
    {
      cwd: resolve('.'),
      encoding: 'utf8',
      timeout: process.platform === 'win32' ? 20000 : 4000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  expect(stdout).toBe('Extraction saved privately.\n');
  expect(lstatSync(output).mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({
    extraction: 'parsed',
    sha256: digest(bytes),
    fields: { payableCents: { value: 12000 }, debitDate: { value: null } },
  });
});
