// Synthetic-only receipt-aware recovery drill. No arguments, external storage or retained keys.
import {
  accountBalances,
  addReceipt,
  createBooking,
  migrateDatabase,
  openDatabase,
  removeReceipt,
  undo,
  unlinkReceipt,
  type OpenedDatabase,
} from '@budget/db';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createBackupArchive, tarBinary } from '../apps/server/src/backup/backup';
import { receiptPath, storeReceipt } from '../apps/server/src/receipts/files';
import { PDF, PNG } from '../apps/server/src/receipts/testing';
import { seedBasics } from '../packages/db/src/repos/test-helpers';

type Sqlite = OpenedDatabase['sqlite'];
const pngHash = '3fd24bcfdb17a6027c5f3ed896d17a020d6ff9d9e4d06362461a9b44b6ac1b52';
const pdfHash = '59be283d840f08fb0753a6aa06a0625f8b24b11ce1297d68af9e4ed812803135';
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const actor = { actor: 'synthetic-recovery-proof' };

class ProofFailure extends Error {}

function equal(actual: unknown, expected: unknown, code: string) {
  if (!isDeepStrictEqual(actual, expected)) throw new ProofFailure(code);
}

function tool(command: string, args: string[], code: string) {
  try {
    return execFileSync(command, args, {
      stdio: 'pipe',
      windowsHide: true,
      timeout: 30_000,
    }).toString();
  } catch {
    // Child errors may include private paths, partial plaintext or key material.
    throw new ProofFailure(code);
  }
}

function auditProof(sqlite: Sqlite) {
  const rows = sqlite.prepare('SELECT * FROM audit_log ORDER BY id').all() as {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    undo_of_id: string | null;
  }[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    if (row.undo_of_id === null) continue;
    const original = byId.get(row.undo_of_id);
    equal(row.action, 'undo', 'audit undo action mismatch');
    equal(original?.entity_type, row.entity_type, 'audit undo entity mismatch');
    equal(original?.entity_id, row.entity_id, 'audit undo identity mismatch');
  }
  return {
    // This is an independent fingerprint of actual rows, not an invented stored hash chain.
    digest: hash(JSON.stringify(rows)),
    undoLinks: rows.filter((row) => row.undo_of_id !== null).length,
  };
}

function databaseProof(sqlite: Sqlite) {
  const tables = ['account', 'booking', 'booking_split', 'receipt', 'booking_receipt'] as const;
  return {
    rows: tables.map((table) => {
      const order = table === 'booking_receipt' ? 'booking_id, receipt_id' : 'id';
      return [
        table,
        hash(JSON.stringify(sqlite.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all())),
      ];
    }),
    audit: auditProof(sqlite),
  };
}

function literalLedger(opened: OpenedDatabase) {
  equal(
    opened.sqlite
      .prepare('SELECT amount_cents FROM booking WHERE deleted_at IS NULL ORDER BY amount_cents')
      .pluck()
      .all(),
    [-3456, 456],
    'restored booking cents mismatch',
  );
  equal(
    opened.sqlite
      .prepare('SELECT SUM(amount_cents) FROM booking WHERE deleted_at IS NULL')
      .pluck()
      .get(),
    -3000,
    'restored ledger sum mismatch',
  );
  equal(
    opened.sqlite.prepare('SELECT SUM(amount_cents) FROM booking_split').pluck().get(),
    -3000,
    'restored split sum mismatch',
  );
  equal(
    opened.sqlite
      .prepare(
        'SELECT category_id, SUM(amount_cents) AS cents FROM booking_split GROUP BY category_id ORDER BY category_id',
      )
      .all(),
    [
      { category_id: 'essen', cents: -778 },
      { category_id: 'miete', cents: -2222 },
    ],
    'restored category cents mismatch',
  );
  equal(
    accountBalances(opened.db).find((row) => row.accountId === 'giro')?.balanceCents,
    97000,
    'restored account balance mismatch',
  );
  equal(
    opened.sqlite
      .prepare("SELECT COUNT(*) FROM booking WHERE typeof(amount_cents) <> 'integer'")
      .pluck()
      .get(),
    0,
    'restored money is not integer cents',
  );
}

async function treeProof(dir: string): Promise<unknown> {
  const names = (await readdir(dir)).sort();
  return Promise.all(
    names.map(async (name) => {
      const path = join(dir, name);
      return [
        name,
        (await stat(path)).isDirectory() ? await treeProof(path) : hash(await readFile(path)),
      ];
    }),
  );
}

async function main() {
  equal(process.argv.length, 2, 'this synthetic-only drill accepts no arguments');
  tool('age', ['--version'], 'age missing or unusable; install age and age-keygen');
  tool('age-keygen', ['--help'], 'age-keygen missing or unusable');
  const work = await mkdtemp(join(tmpdir(), 'budget-recovery-proof-'));
  let source: OpenedDatabase | undefined;
  try {
    const sourceDir = join(work, 'source');
    const scratch = join(work, 'scratch');
    const receipts = join(sourceDir, 'receipts');
    const backupDir = join(work, 'backup');
    for (const dir of [sourceDir, scratch, backupDir]) await mkdir(dir, { mode: 0o700 });
    source = openDatabase(join(sourceDir, 'budget.sqlite'));
    migrateDatabase(source.db);
    seedBasics(source.db);
    const expense = createBooking(
      source.db,
      {
        accountId: 'giro',
        date: '2026-01-05',
        amountCents: -3456,
        splits: [
          { categoryId: 'essen', amountCents: -1234 },
          { categoryId: 'miete', amountCents: -2222 },
        ],
      },
      actor,
    );
    const refund = createBooking(
      source.db,
      {
        accountId: 'giro',
        date: '2026-01-06',
        amountCents: 456,
        splits: [{ categoryId: 'essen', amountCents: 456 }],
      },
      actor,
    );
    equal(await storeReceipt(receipts, PNG), pngHash, 'synthetic PNG fingerprint mismatch');
    equal(await storeReceipt(receipts, PDF), pdfHash, 'synthetic PDF fingerprint mismatch');
    const linked = addReceipt(
      source.db,
      {
        sha256: pngHash,
        mime: 'image/png',
        sizeBytes: PNG.length,
        originalFilename: 'synthetic.png',
      },
      expense,
      actor,
    );
    const retained = addReceipt(
      source.db,
      {
        sha256: pdfHash,
        mime: 'application/pdf',
        sizeBytes: PDF.length,
        originalFilename: 'synthetic.pdf',
      },
      undefined,
      actor,
    );
    removeReceipt(source.db, retained.receipt.id, actor);
    const unlink = unlinkReceipt(source.db, linked.receipt.id, expense, actor);
    const undoUnlink = undo(source.db, unlink, actor);
    const redoUnlink = undo(source.db, { groupId: undoUnlink.groupId }, actor);
    const relink = undo(source.db, { groupId: redoUnlink.groupId }, actor);
    literalLedger(source);
    equal(auditProof(source.sqlite).undoLinks, 3, 'synthetic audit undo chain missing');

    const expected = databaseProof(source.sqlite);
    const key = join(work, 'disposable-key.txt');
    tool('age-keygen', ['-o', key], 'disposable key generation failed');
    const recipient = tool(
      'age-keygen',
      ['-y', key],
      'disposable public-key derivation failed',
    ).trim();
    const archive = await createBackupArchive(source.sqlite, backupDir, receipts);
    const sealed = `${archive}.age`;
    const encrypt = (plain: string, encrypted: string) =>
      tool(
        'age',
        ['--encrypt', '-r', recipient, '-o', encrypted, plain],
        'synthetic backup encryption failed',
      );
    encrypt(archive, sealed);

    async function restore(encrypted: string, name: string) {
      const staging = await mkdtemp(join(scratch, '.candidate-'));
      try {
        const plain = join(staging, 'candidate.tar');
        tool('age', ['--decrypt', '-i', key, '-o', plain, encrypted], 'backup decryption failed');
        tool(tarBinary, ['-xf', plain, '-C', staging], 'backup extraction failed');
        let copy: OpenedDatabase | undefined;
        try {
          try {
            // Validate read-only first; malformed SQLite must not leak a connection if
            // openDatabase's writable setup throws before returning its close handle.
            const probe = new Database(join(staging, 'budget.sqlite'), {
              readonly: true,
              fileMustExist: true,
            });
            try {
              equal(
                probe.pragma('integrity_check', { simple: true }),
                'ok',
                'backup database integrity failed',
              );
              equal(probe.pragma('foreign_key_check'), [], 'backup foreign-key integrity failed');
            } finally {
              probe.close();
            }
            copy = openDatabase(join(staging, 'budget.sqlite'));
          } catch {
            throw new ProofFailure('backup database integrity failed');
          }
          try {
            equal(
              await readFile(receiptPath(join(staging, 'receipts'), pngHash)),
              PNG,
              'backup receipt integrity failed',
            );
            equal(
              await readFile(receiptPath(join(staging, 'receipts'), pdfHash)),
              PDF,
              'backup receipt integrity failed',
            );
            equal(
              hash(await readFile(receiptPath(join(staging, 'receipts'), pngHash))),
              pngHash,
              'backup receipt integrity failed',
            );
            equal(
              hash(await readFile(receiptPath(join(staging, 'receipts'), pdfHash))),
              pdfHash,
              'backup receipt integrity failed',
            );
          } catch {
            throw new ProofFailure('backup receipt integrity failed');
          }
          literalLedger(copy);
          equal(databaseProof(copy.sqlite), expected, 'backup rows or audit fingerprint mismatch');
          equal(
            copy.sqlite
              .prepare(
                'SELECT booking_id, receipt_id FROM booking_receipt WHERE deleted_at IS NULL',
              )
              .all(),
            [{ booking_id: expense, receipt_id: linked.receipt.id }],
            'backup receipt-to-booking link mismatch',
          );
          equal(
            copy.sqlite
              .prepare('SELECT id FROM receipt WHERE deleted_at IS NOT NULL')
              .pluck()
              .all(),
            [retained.receipt.id],
            'backup undo-retained receipt missing',
          );
        } finally {
          copy?.close();
        }
        await rm(plain);
        const destination = join(scratch, name);
        await rename(staging, destination);
        return destination;
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    }

    const restored = await restore(sealed, 'verified');
    const copy = openDatabase(join(restored, 'budget.sqlite'));
    try {
      // Restored audit is usable: undo and redo still preserve all ledger cents.
      const unlinked = undo(copy.db, { groupId: relink.groupId }, actor);
      equal(
        copy.sqlite
          .prepare('SELECT COUNT(*) FROM booking_receipt WHERE deleted_at IS NULL')
          .pluck()
          .get(),
        0,
        'restored receipt unlink undo failed',
      );
      undo(copy.db, { groupId: unlinked.groupId }, actor);
      equal(
        copy.sqlite
          .prepare('SELECT COUNT(*) FROM booking_receipt WHERE deleted_at IS NULL')
          .pluck()
          .get(),
        1,
        'restored receipt relink redo failed',
      );
      literalLedger(copy);
      equal(auditProof(copy.sqlite).undoLinks, 5, 'restored undo references lost');
    } finally {
      copy.close();
    }
    await writeFile(join(scratch, 'sentinel.txt'), 'synthetic existing scratch state');
    const originalSource = hash(source.sqlite.serialize());
    const originalReceipts = await treeProof(receipts);
    const originalScratch = await treeProof(scratch);

    async function rejectsUnchanged(candidate: string, name: string, code: string) {
      let message = '';
      try {
        await restore(candidate, name);
      } catch (error) {
        message = error instanceof ProofFailure ? error.message : 'unexpected failure';
      }
      equal(message, code, 'damaged backup did not fail at the expected validation stage');
      equal(
        hash(source!.sqlite.serialize()),
        originalSource,
        'failed restore changed source database',
      );
      equal(
        await treeProof(receipts),
        originalReceipts,
        'failed restore changed source receipt store',
      );
      equal(
        await treeProof(scratch),
        originalScratch,
        'failed restore changed scratch database, receipts or sentinel',
      );
      console.log(`PASS: ${name} rejected; source and scratch unchanged`);
    }

    const encrypted = await readFile(sealed);
    const corrupt = Buffer.from(encrypted);
    corrupt[corrupt.length - 16] = corrupt[corrupt.length - 16]! ^ 1;
    const corruptFile = join(work, 'corrupt.age');
    const truncatedFile = join(work, 'truncated.age');
    await writeFile(corruptFile, corrupt);
    await writeFile(truncatedFile, encrypted.subarray(0, Math.floor(encrypted.length / 2)));
    await rejectsUnchanged(corruptFile, 'corrupt-ciphertext', 'backup decryption failed');
    await rejectsUnchanged(truncatedFile, 'truncated-ciphertext', 'backup decryption failed');

    for (const kind of ['database', 'receipt', 'link', 'audit', 'db-only'] as const) {
      const fixture = await mkdtemp(join(work, 'damaged-'));
      const plain = join(work, `${kind}.tar`);
      const candidate = `${plain}.age`;
      tool(
        tarBinary,
        ['-xf', archive, '-C', fixture],
        'synthetic corruption fixture extraction failed',
      );
      if (kind === 'database')
        await writeFile(join(fixture, 'budget.sqlite'), 'synthetic invalid database');
      else if (kind === 'receipt')
        await writeFile(
          receiptPath(join(fixture, 'receipts'), pngHash),
          'synthetic damaged receipt',
        );
      else if (kind === 'link' || kind === 'audit') {
        const damaged = openDatabase(join(fixture, 'budget.sqlite'));
        try {
          if (kind === 'link')
            damaged.sqlite.prepare('UPDATE booking_receipt SET booking_id = ?').run(refund);
          else damaged.sqlite.exec("UPDATE audit_log SET actor = 'synthetic-tampered'");
        } finally {
          damaged.close();
        }
      }
      tool(
        tarBinary,
        ['-cf', plain, '-C', fixture, 'budget.sqlite', ...(kind === 'db-only' ? [] : ['receipts'])],
        'synthetic corruption fixture packaging failed',
      );
      encrypt(plain, candidate);
      await rejectsUnchanged(
        candidate,
        `damaged-${kind}`,
        kind === 'database'
          ? 'backup database integrity failed'
          : kind === 'receipt' || kind === 'db-only'
            ? 'backup receipt integrity failed'
            : 'backup rows or audit fingerprint mismatch',
      );
      await rm(fixture, { recursive: true, force: true });
    }
    equal(databaseProof(source.sqlite), expected, 'source changed during recovery proof');
    console.log(
      'PASS: encrypted synthetic recovery preserves literal cents, receipt bytes/links, audit fingerprints and undo/redo',
    );
  } finally {
    source?.close();
    await rm(work, { recursive: true, force: true });
  }
}

await main().catch((error: unknown) => {
  console.error(
    `FAIL: ${error instanceof ProofFailure ? error.message : 'synthetic recovery proof failed; private details suppressed'}`,
  );
  process.exitCode = 1;
});
