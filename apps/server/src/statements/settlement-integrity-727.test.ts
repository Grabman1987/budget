import { afterEach, expect, it, vi } from 'vitest';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  accounts,
  categories,
  createEntity,
  createBooking,
  getBooking,
  getStatementIntake,
  history,
  openDatabase,
  migrateDatabase,
  stageStatementIntake,
  mutateStatementIntake,
  performStatementAction,
  assertStatementSettlementInvariants,
  statementSettlementState,
  balanceSeries,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import {
  parseStatementText,
  type SettlementSource,
  type StatementBonusEvidence,
} from '@budget/domain';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { syntheticPayslipPdf } from '../payslips/testing';
import { storeReceipt, digest } from '../receipts/files';
import { createBackupArchive, runBackup, tarBinary, type BackupConfig } from '../backup/backup';
import { S3Client } from '../backup/s3';

const dirs: string[] = [],
  databases: OpenedDatabase[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'settlement-727-'));
  dirs.push(d);
  return d;
};
const open = (path: string) => {
  const db = openDatabase(path);
  databases.push(db);
  return db;
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) if (db.sqlite.open) db.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const FUND = '72700000-0000-4000-8000-000000000001',
  CARD = '72700000-0000-4000-8000-000000000002';
const GROUP = '72700000-0000-4000-8000-000000000010',
  EXPENSE = '72700000-0000-4000-8000-000000000011';
const ctx = { actor: 'synthetic-727' };
const tableNames = (db: OpenedDatabase) =>
  (
    db.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='__drizzle_migrations' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((t) => t.name);
const rows = (db: OpenedDatabase, tables = tableNames(db)) =>
  JSON.stringify(
    tables.map((t) => [t, db.sqlite.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all()]),
  );
function addAccounts(db: OpenedDatabase) {
  for (const [id, type, openingBalanceCents] of [
    [FUND, 'checking', 50000],
    [CARD, 'credit_card', 0],
  ] as const)
    accounts.create(
      db.db,
      {
        id,
        name: id === FUND ? 'Synthetic funding' : 'Synthetic card',
        type,
        role: 'budget',
        onBudget: true,
        openingDate: '2026-09-01',
        openingBalanceCents,
      },
      ctx,
    );
  createEntity(db.db, schema.categoryGroup, { id: GROUP, name: 'Synthetic expenses' }, ctx);
  categories.create(
    db.db,
    { id: EXPENSE, groupId: GROUP, name: 'Synthetic expense', class: 'need' },
    ctx,
  );
}
const action = (db: OpenedDatabase, input: unknown) => performStatementAction(db.db, input, ctx);
const fields = {
  reference: 'SYNTHETIC-727',
  issueDate: '2026-10-01',
  periodFrom: null,
  periodTo: null,
  payableCents: 7875,
  currency: 'EUR',
  debitDate: '2026-10-10',
  accountHint: null,
};
async function source(db: OpenedDatabase, blobs: string) {
  const text = [
    'Rechnungsnummer SYNTHETIC-727',
    'Rechnungsdatum 01.10.2026',
    'Abrechnungsbetrag 78,75 EUR',
  ];
  const bytes = await syntheticPayslipPdf(text, ''),
    sha256 = await storeReceipt(blobs, bytes);
  const staged = stageStatementIntake(
    db.db,
    {
      accountId: CARD,
      sha256,
      sizeBytes: bytes.length,
      filename: 'synthetic.pdf',
      proposal: parseStatementText(text.join('\n'), sha256),
    },
    ctx,
  ).intake;
  const intake = mutateStatementIntake(
    db.db,
    staged.id,
    staged,
    'review',
    { facts: fields },
    ctx,
  ).intake;
  const accepted: SettlementSource = {
    intakeId: intake.id,
    revision: intake.revision,
    accountId: CARD,
    sha256,
  };
  return { accepted, bytes };
}
const down = () =>
  readFileSync(resolve('packages/db/drizzle/rollback/0046_statement_settlement.sql'), 'utf8');
it('upgrades only a genuine through45 synthetic COPY, round-trips empty46 rollback and refuses populated or history-only rollback', () => {
  const dir = temp(),
    migrations = join(dir, 'migrations');
  cpSync(resolve('packages/db/drizzle'), migrations, { recursive: true });
  const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number }[];
  };
  const through46 = journal.entries.filter((e) => e.idx <= 46);
  journal.entries = through46.filter((e) => e.idx <= 45);
  writeFileSync(join(migrations, 'meta/_journal.json'), JSON.stringify(journal));
  const original = open(join(dir, 'original.sqlite'));
  migrateDatabase(original.db, migrations);
  seedBasics(original.db);
  const oldTables = tableNames(original),
    oldRows = rows(original);
  expect(oldTables).toContain('statement_intake');
  expect(oldTables).not.toContain('statement_bonus');
  original.sqlite.pragma('wal_checkpoint(TRUNCATE)');
  copyFileSync(original.sqlite.name, join(dir, 'copy.sqlite'));
  original.close();
  const originalBytes = readFileSync(join(dir, 'original.sqlite')),
    copy = open(join(dir, 'copy.sqlite'));
  journal.entries = through46;
  writeFileSync(join(migrations, 'meta/_journal.json'), JSON.stringify(journal));
  migrateDatabase(copy.db, migrations);
  expect(rows(copy, oldTables)).toBe(oldRows);
  expect(tableNames(copy).filter((t) => !oldTables.includes(t))).toEqual([
    'statement_bonus',
    'statement_settlement',
    'statement_settlement_config',
    'statement_settlement_delivery',
  ]);
  expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(copy.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  copy.sqlite.transaction(() => copy.sqlite.exec(down()))();
  expect(tableNames(copy)).toEqual(oldTables);
  expect(rows(copy)).toBe(oldRows);
  migrateDatabase(copy.db, migrations);
  expect(rows(copy, oldTables)).toBe(oldRows);
  addAccounts(copy);
  action(copy, {
    operation: 'configure',
    key: 'synthetic-727-rollback-config',
    cardAccountId: CARD,
    fundingAccountId: FUND,
    enabled: true,
    expectedRevision: null,
  });
  let before = rows(copy);
  expect(() => copy.sqlite.transaction(() => copy.sqlite.exec(down()))()).toThrow();
  expect(rows(copy)).toBe(before);
  // A disposable corruption fixture proves that even retained history alone forbids rollback.
  copy.sqlite.exec(
    'DELETE FROM statement_settlement_config; DELETE FROM statement_settlement_delivery',
  );
  expect(
    copy.sqlite
      .prepare(
        "SELECT count(*) AS n FROM audit_log WHERE entity_type='statement_settlement_config'",
      )
      .get(),
  ).toEqual({ n: 1 });
  before = rows(copy);
  expect(() => copy.sqlite.transaction(() => copy.sqlite.exec(down()))()).toThrow();
  expect(rows(copy)).toBe(before);
  expect(copy.sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(copy.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  expect(readFileSync(join(dir, 'original.sqlite'))).toEqual(originalBytes);
});
async function representedFixture() {
  const dir = temp(),
    blobs = join(dir, 'receipts'),
    db = open(join(dir, 'live.sqlite'));
  migrateDatabase(db.db);
  addAccounts(db);
  const purchaseId = createBooking(
    db.db,
    {
      accountId: CARD,
      date: '2026-09-20',
      amountCents: -8000,
      status: 'confirmed',
      splits: [{ categoryId: EXPENSE, amountCents: -8000 }],
    },
    ctx,
  );
  const { accepted, bytes } = await source(db, blobs),
    configRevision = action(db, {
      operation: 'configure',
      key: 'synthetic-727-backup-config',
      cardAccountId: CARD,
      fundingAccountId: FUND,
      enabled: true,
      expectedRevision: null,
    }).configRevision!;
  const p = getBooking(db.db, purchaseId)!,
    split = p.splits[0]!;
  const evidence: StatementBonusEvidence = {
    origin: 'owner',
    bonusCents: 125,
    creditDate: '2026-09-30',
    treatment: 'gross_then_credit',
    existingCreditsReviewed: true,
    feesAdjustmentsReviewed: true,
    selectedOriginals: [
      {
        bookingId: p.id,
        bookingRevision: history(db.db, 'booking', p.id)[0]!.id,
        splitId: split.id,
        splitRevision: history(db.db, 'booking_split', split.id)[0]!.id,
        accountId: CARD,
        currency: 'EUR',
        bookingAmountCents: -8000,
        splitAmountCents: -8000,
        categoryId: EXPENSE,
      },
    ],
    allocations: [{ categoryId: EXPENSE, amountCents: 125 }],
  };
  const bonus = action(db, {
    operation: 'confirm_bonus',
    key: 'synthetic-727-backup-bonus',
    source: accepted,
    configRevision,
    evidence,
  });
  const credit = action(db, {
    operation: 'create_bonus',
    key: 'synthetic-727-backup-credit',
    bonusId: bonus.bonusId,
    expectedRevision: bonus.bonusRevision,
    source: accepted,
    configRevision,
    selectedOriginals: evidence.selectedOriginals.map(
      ({ bookingId, bookingRevision, splitId, splitRevision }) => ({
        bookingId,
        bookingRevision,
        splitId,
        splitRevision,
      }),
    ),
  });
  const reviewRequest = {
    operation: 'amend_bonus',
    key: 'synthetic-727-backup-reassessment',
    bonusId: bonus.bonusId,
    expectedRevision: credit.bonusRevision,
    source: accepted,
    configRevision,
    evidence,
    sourceReview: {
      acknowledged: true,
      facts: { ...fields, reference: 'SYNTHETIC-727-CORRECTED' },
    },
  };
  const reassessed = action(db, reviewRequest),
    current = getStatementIntake(db.db, accepted.intakeId),
    refreshed = { ...accepted, revision: current.revision };
  const settlement = action(db, {
    operation: 'confirm',
    key: 'synthetic-727-backup-settlement',
    source: refreshed,
    configRevision,
  });
  const payRequest = {
    operation: 'create_transfer',
    key: 'synthetic-727-backup-payment',
    settlementId: settlement.settlementId,
    expectedRevision: settlement.settlementRevision,
    source: refreshed,
    configRevision,
  };
  const paid = action(db, payRequest);
  return {
    dir,
    blobs,
    db,
    bytes,
    sha: accepted.sha256,
    purchaseId,
    creditId: credit.bookingId!,
    oldBonusId: bonus.bonusId!,
    reviewRequest,
    reassessed,
    payRequest,
    paid,
  };
}
function assertRestored(
  db: OpenedDatabase,
  f: Awaited<ReturnType<typeof representedFixture>>,
  expectedRows: string,
) {
  expect(rows(db)).toBe(expectedRows);
  expect(db.sqlite.pragma('foreign_key_check')).toEqual([]);
  expect(db.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  assertStatementSettlementInvariants(db.db);
  expect(getBooking(db.db, f.purchaseId)!.amountCents).toBe(-8000);
  expect(getBooking(db.db, f.creditId)!.amountCents).toBe(125);
  expect(
    [FUND, CARD].map(
      (id) => balanceSeries(db.db, id, { from: '2026-10-10', to: '2026-10-10' })[0]!.balanceCents,
    ),
  ).toEqual([42125, 0]);
  const state = statementSettlementState(db.db, CARD);
  expect(state.bonuses.find((b) => b.id === f.oldBonusId)).toMatchObject({
    state: 'superseded',
    reference: 'SYNTHETIC-727',
  });
  expect(state.bonuses.find((b) => b.id === f.reassessed.bonusId)).toMatchObject({
    state: 'represented',
    bookingId: f.creditId,
    reference: 'SYNTHETIC-727-CORRECTED',
  });
  expect(state.settlements).toHaveLength(1);
  expect(state.settlements[0]).toMatchObject({ state: 'represented', payableCents: 7875 });
  expect(action(db, f.reviewRequest)).toEqual(f.reassessed);
  expect(action(db, f.payRequest)).toEqual(f.paid);
  expect(rows(db)).toBe(expectedRows);
}
it('round-trips all four46 tables, independent represented credit and payment, immutable evidence, source blob and replay receipts in the unchanged archive', async () => {
  const f = await representedFixture(),
    before = rows(f.db),
    archive = await createBackupArchive(f.db.sqlite, f.dir, f.blobs),
    out = join(f.dir, 'restored');
  mkdirSync(out);
  execFileSync(tarBinary, ['-xf', archive, '-C', out]);
  expect(readdirSync(join(out, 'receipts'))).toEqual([f.sha]);
  expect(readFileSync(join(out, 'receipts', f.sha))).toEqual(f.bytes);
  assertRestored(open(join(out, 'budget.sqlite')), f, before);
  expect(rows(f.db)).toBe(before);
});
it('encrypts the actual backup before upload and restores46 with a throwaway age key, or refuses unavailable encryption without uploading', async () => {
  const f = await representedFixture(),
    before = rows(f.db),
    identity = join(f.dir, 'synthetic-age-key.txt');
  const available =
    spawnSync('age', ['--version'], { stdio: 'ignore' }).status === 0 &&
    spawnSync('age-keygen', ['--help'], { stdio: 'ignore' }).status === 0;
  if (process.env['BUDGET_REQUIRE_AGE'] === '1') expect(available).toBe(true);
  if (available) execFileSync('age-keygen', ['-o', identity], { stdio: 'ignore' });
  const recipient = available
    ? /public key: (age1\w+)/.exec(readFileSync(identity, 'utf8'))![1]!
    : `age1${'q'.repeat(58)}`;
  const config: BackupConfig = {
    recipients: [recipient],
    prefix: 'synthetic/',
    ageBin: available ? 'age' : 'synthetic-727-unavailable-age',
    s3: {
      endpoint: 'http://127.0.0.1:9',
      bucket: 'synthetic',
      accessKeyId: 'synthetic',
      secretAccessKey: 'synthetic',
      region: 'auto',
    },
  };
  const client = new S3Client(config.s3);
  let sealed: Buffer | undefined;
  const upload = vi.spyOn(client, 'putFile').mockImplementation(async (_key, path) => {
    sealed = readFileSync(path);
  });
  vi.spyOn(client, 'list').mockResolvedValue([]);
  const remove = vi.spyOn(client, 'delete').mockResolvedValue();
  if (!available) {
    await expect(
      runBackup(f.db.sqlite, config, new Date('2026-10-10T12:00:00Z'), client, f.blobs),
    ).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
    expect(rows(f.db)).toBe(before);
    return;
  }
  const result = await runBackup(
    f.db.sqlite,
    config,
    new Date('2026-10-10T12:00:00Z'),
    client,
    f.blobs,
  );
  expect(result.key).toBe('synthetic/budget-2026-10-10.tar.age');
  expect(upload).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
  expect(sealed!.subarray(0, 21).toString()).toBe('age-encryption.org/v1');
  const encrypted = join(f.dir, 'downloaded.tar.age'),
    plain = join(f.dir, 'decrypted.tar'),
    out = join(f.dir, 'decrypted');
  writeFileSync(encrypted, sealed!);
  execFileSync('age', ['--decrypt', '-i', identity, '-o', plain, encrypted]);
  mkdirSync(out);
  execFileSync(tarBinary, ['-xf', plain, '-C', out]);
  expect(digest(readFileSync(join(out, 'receipts', f.sha)))).toBe(f.sha);
  expect(readFileSync(join(out, 'receipts', f.sha))).toEqual(f.bytes);
  assertRestored(open(join(out, 'budget.sqlite')), f, before);
  expect(rows(f.db)).toBe(before);
});
it('refuses a corrupt represented bonus or a partial46 family before producing a backup', async () => {
  const f = await representedFixture();
  f.db.sqlite.prepare("UPDATE statement_bonus SET bonus_cents=126 WHERE state='represented'").run();
  let before = rows(f.db);
  await expect(createBackupArchive(f.db.sqlite, join(f.dir, 'corrupt'), f.blobs)).rejects.toThrow();
  expect(rows(f.db)).toBe(before);
  // Independent disposable fixture for the all-four-family guard.
  const partial = open(join(f.dir, 'partial.sqlite'));
  migrateDatabase(partial.db);
  partial.sqlite.exec('DROP TABLE statement_settlement_delivery');
  before = rows(partial);
  await expect(
    createBackupArchive(partial.sqlite, join(f.dir, 'partial-backup'), f.blobs),
  ).rejects.toThrow();
  expect(rows(partial)).toBe(before);
});
