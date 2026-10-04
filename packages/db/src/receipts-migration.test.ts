import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';
import { getBooking } from './repos/bookings';
import { addReceipt, listReceipts } from './repos/receipts';
import { testCtx } from './repos/test-helpers';

it('upgrades existing receipt placeholders without losing split links or ledger rows', () => {
  const source = defaultMigrationsFolder();
  const folder = mkdtempSync(join(tmpdir(), 'budget-receipt-migration-'));
  const opened = openDatabase(':memory:');
  try {
    const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    const receiptIndex = journal.entries.findIndex((entry) => entry.tag.endsWith('_receipts'));
    expect(receiptIndex).toBeGreaterThan(0);
    const entries = journal.entries.slice(0, receiptIndex);
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const entry of entries)
      copyFileSync(join(source, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    migrateDatabase(opened.db, folder);
    // Raw rows: later migrations add account and booking columns that the old schema does not have yet.
    const bookingId = 'legacy-booking';
    const splitId = 'legacy-split';
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents, sort_order) VALUES ('giro', 'Giro', 'checking', 'budget', 1, '2023-10-01', 100000, 1);
      INSERT INTO category_group (id, name) VALUES ('g', 'Fixkosten');
      INSERT INTO category (id, name, group_id, class, kind) VALUES ('essen', 'Essen', 'g', 'need', 'variable');
      INSERT INTO booking (id, account_id, date, amount_cents) VALUES ('legacy-booking', 'giro', '2026-09-17', -1250);
      INSERT INTO booking_split (id, booking_id, category_id, amount_cents) VALUES ('legacy-split', 'legacy-booking', 'essen', -1250);
    `);
    opened.sqlite.exec(`INSERT INTO receipt (id, storage_key, mime, size_bytes)
      VALUES ('legacy-receipt', 'synthetic-legacy-key', 'image/png', 1)`);
    opened.sqlite
      .prepare('INSERT INTO receipt_split (receipt_id, split_id) VALUES (?, ?)')
      .run('legacy-receipt', splitId);

    migrateDatabase(opened.db);
    migrateDatabase(opened.db); // Restarting must not repeat the additive DDL.
    expect(
      opened.sqlite
        .prepare('SELECT storage_key, sha256, original_filename, created_by FROM receipt')
        .all(),
    ).toEqual([
      {
        storage_key: 'synthetic-legacy-key',
        sha256: null,
        original_filename: null,
        created_by: null,
      },
    ]);
    expect(opened.sqlite.prepare('SELECT * FROM receipt_split').all()).toEqual([
      { receipt_id: 'legacy-receipt', split_id: splitId },
    ]);
    expect(getBooking(opened.db, bookingId)?.amountCents).toBe(-1250);
    expect(listReceipts(opened.db, bookingId)).toEqual([]);
    const added = addReceipt(
      opened.db,
      {
        sha256: 'a'.repeat(64),
        mime: 'image/png',
        sizeBytes: 1,
        originalFilename: 'synthetic.png',
      },
      bookingId,
      testCtx,
    );
    expect(listReceipts(opened.db, bookingId).map((row) => row.id)).toEqual([added.receipt.id]);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(opened.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  } finally {
    opened.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
