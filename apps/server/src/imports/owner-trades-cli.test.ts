import { accounts, createSecurity, listTrades, migrateDatabase, openDatabase } from '@budget/db';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('owner-trades CLI validates the whole file, reports skips/details and dry-run with exit codes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-owner-trades-'));
  const databasePath = join(dir, 'synthetic.sqlite');
  const file = join(dir, 'trades.json');
  const opened = openDatabase(databasePath);
  try {
    migrateDatabase(opened.db);
    const ctx = { actor: 'tester' };
    accounts.create(
      opened.db,
      {
        id: 'depot',
        name: 'Synthetic Depot',
        type: 'crypto',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-03-01',
      },
      ctx,
    );
    createSecurity(opened.db, { id: 'coin', name: 'Synthetic Coin', kind: 'crypto' }, ctx);
    const add = {
      kind: 'add',
      id: 'synthetic-add',
      account: 'Synthetic Depot',
      security: 'Synthetic Coin',
      date: '2026-03-02',
      tradeKind: 'buy',
      units: '0.1',
      amountCents: 100,
      importKey: 'synthetic:cli',
    };
    const cli = (trades: unknown[], extra: string[] = []) => {
      writeFileSync(file, JSON.stringify({ trades }));
      return spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve('apps/server/src/imports/migrate-cli.ts'),
          'owner-trades',
          '--file',
          file,
          ...extra,
        ],
        { encoding: 'utf8', env: { ...process.env, DATABASE_PATH: databasePath }, timeout: 20000 },
      );
    };
    const dryRun = cli([add], ['--dry-run']);
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain(
      'added synthetic-add Synthetic Depot 2026-03-02 buy 0.1 100 (dry run)',
    );
    expect(dryRun.stdout).toContain('cash-change Synthetic Depot -100');
    expect(dryRun.stdout).toContain('units-change Synthetic Coin 0.1');
    expect(listTrades(opened.db)).toEqual([]);
    const invalid = cli([add, { ...add, id: 'invalid', units: '0.000000001' }]);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('at most 8 decimals');
    expect(listTrades(opened.db)).toEqual([]);
    const skipped = cli([add, { ...add, id: 'missing', security: 'Unknown' }], ['--details']);
    expect(skipped.status, skipped.stderr).toBe(3);
    expect(skipped.stdout).toContain('skipped missing unknown_security');
    expect(skipped.stdout).toContain('no live match');
    expect(skipped.stdout).toContain('"added":1');
    expect(skipped.stdout).toContain('"skipped":1');
    expect(listTrades(opened.db)).toHaveLength(1);
    const repeat = cli([add]);
    expect(repeat.status, repeat.stderr).toBe(0);
    expect(repeat.stdout).toContain('unchanged synthetic-add');
    expect(repeat.stdout).toContain('cash-change Synthetic Depot 0');
    expect(repeat.stdout).toContain('units-change Synthetic Coin 0');
    expect(listTrades(opened.db)).toHaveLength(1);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ trades: [add] });
  } finally {
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
