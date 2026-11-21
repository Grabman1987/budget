import { migrateDatabase, openDatabase, accounts, schema } from '@budget/db';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('bank-inbox CLI lists to a file, applies with exit codes and keeps a dry run read-only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-bank-inbox-'));
  const databasePath = join(dir, 'synthetic.sqlite');
  const file = join(dir, 'decisions.json');
  const out = join(dir, 'list.json');
  const opened = openDatabase(databasePath);
  try {
    migrateDatabase(opened.db);
    accounts.create(
      opened.db,
      {
        id: 'giro',
        name: 'Synthetic Giro',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-01-01',
      },
      { actor: 'tester' },
    );
    opened.db
      .insert(schema.bankSyncCandidate)
      .values({
        id: 'c1',
        accountId: 'giro',
        dedupeKey: 'c1',
        date: '2026-09-30',
        amountCents: -1201,
        currency: 'EUR',
        memo: 'Synthetic memo',
      })
      .run();
    opened.db
      .insert(schema.inboxItem)
      .values({ id: 'c1', kind: 'import', title: 'x', refType: 'bank-sync-candidate', refId: 'c1' })
      .run();
    const cli = (...args: string[]) =>
      spawnSync(
        process.execPath,
        ['--import', 'tsx', resolve(import.meta.dirname, 'migrate-cli.ts'), 'bank-inbox', ...args],
        { encoding: 'utf8', env: { ...process.env, DATABASE_PATH: databasePath }, timeout: 30000 },
      );
    const listed = cli('list', '--out', out);
    expect(listed.status, listed.stderr).toBe(0);
    const rows = JSON.parse(readFileSync(out, 'utf8')) as Array<Record<string, unknown>>;
    expect(rows).toMatchObject([
      { type: 'candidate', id: 'c1', accountName: 'Synthetic Giro', amountCents: -1201 },
    ]);
    const decisions = (entries: unknown[]) => writeFileSync(file, JSON.stringify(entries));
    const dismiss = { id: 'e1', candidate: 'c1', action: 'dismiss', reason: 'Synthetic' };
    decisions([dismiss]);
    const dry = cli('apply', '--file', file, '--dry-run');
    expect(dry.status, dry.stderr).toBe(0);
    expect(dry.stdout).toContain('done           e1 dismiss c1 - - (dry run)');
    expect(
      opened.db.select().from(schema.inboxItem).get()!.resolvedAt,
      'dry run writes nothing',
    ).toBeNull();
    const real = cli('apply', '--file', file);
    expect(real.status, real.stderr).toBe(0);
    decisions([dismiss, { id: 'e2', candidate: 'gone', action: 'dismiss', reason: 'x' }]);
    const again = cli('apply', '--file', file);
    expect(again.status).toBe(3);
    expect(again.stdout).toContain('skipped        e1 dismiss already_resolved');
    decisions([{ id: 'e3', bankBooking: 'b', action: 'dismiss', reason: 'x' }]);
    const bad = cli('apply', '--file', file);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('never dismissed');
  } finally {
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);

it('bank-posting CLI defaults to dry-run, bounds apply, and rejects conflicting flags and invalid limits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-bank-posting-'));
  const databasePath = join(dir, 'synthetic.sqlite');
  const opened = openDatabase(databasePath);
  try {
    migrateDatabase(opened.db);
    accounts.create(
      opened.db,
      {
        id: 'giro',
        name: 'Synthetic Giro',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-01-01',
        openingBalanceCents: 100000,
      },
      { actor: 'tester' },
    );
    opened.db
      .insert(schema.bankSyncConsent)
      .values({
        id: 'consent',
        initiator: 'synthetic',
        stateHash: 'synthetic',
        expiresAt: '2026-11-01T00:00:00Z',
        label: 'Synthetic bank',
        nextRunAt: '2026-11-01T00:00:00Z',
      })
      .run();
    opened.db
      .insert(schema.bankSyncAccount)
      .values({
        id: 'source',
        consentId: 'consent',
        accountId: 'giro',
        currency: 'EUR',
        secret: 'unused',
        label: 'Synthetic account',
      })
      .run();
    for (let i = 0; i < 2; i++) {
      const id = `candidate-${i}`;
      opened.db
        .insert(schema.bankSyncCandidate)
        .values({
          id,
          accountId: 'giro',
          dedupeKey: id,
          date: '2026-10-30',
          amountCents: -1201 - i,
          currency: 'EUR',
          memo: 'Synthetic text',
          sourceId: 'source',
        })
        .run();
      opened.db
        .insert(schema.inboxItem)
        .values({
          id,
          kind: 'import',
          title: 'Bankumsatz prüfen',
          refType: 'bank-sync-candidate',
          refId: id,
        })
        .run();
    }
    const cli = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve(import.meta.dirname, 'migrate-cli.ts'),
          'bank-posting',
          ...args,
        ],
        { encoding: 'utf8', env: { ...process.env, DATABASE_PATH: databasePath }, timeout: 30000 },
      );
    const dry = cli();
    expect(dry.status, dry.stderr).toBe(0);
    expect(dry.stdout).toContain('"created":2');
    expect(dry.stdout).toContain('(dry run)');
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
    const bounded = cli('--apply', '--source', 'source', '--max-bookings', '1');
    expect(bounded.status, bounded.stderr).toBe(0);
    expect(bounded.stdout).toContain('"created":1');
    expect(bounded.stdout).toContain('"remaining":1');
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(1);
    const conflict = cli('--apply', '--dry-run');
    expect(conflict.status).toBe(1);
    expect(conflict.stderr).toContain('exclude each other');
    const invalid = cli('--apply', '--max-bookings', '0');
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('positive safe integer');
    for (const args of [
      ['--apply', '--source'],
      ['--apply', '--source', '--max-bookings', '1'],
      ['--apply', '--source', ''],
    ]) {
      const missingSource = cli(...args);
      expect(missingSource.status).toBe(1);
      expect(missingSource.stderr).toContain('--source');
    }
    const unknownSource = cli('--apply', '--source', 'unknown-source');
    expect(unknownSource.status).toBe(1);
    expect(unknownSource.stderr).toContain('bank_sync_account');
    expect(opened.db.select().from(schema.booking).all()).toHaveLength(1);
  } finally {
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);
