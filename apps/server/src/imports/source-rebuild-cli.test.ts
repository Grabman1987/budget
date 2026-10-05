import {
  accounts,
  createSecurity,
  inboxItem,
  listTrades,
  mapReadSource,
  migrateDatabase,
  openDatabase,
} from '@budget/db';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('source-rebuild CLI reports dry-run, private JSON, idempotency, skips, and rolls back a refused report write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-source-rebuild-'));
  const databasePath = join(dir, 'synthetic.sqlite'),
    reportPath = join(dir, 'report.json');
  const opened = openDatabase(databasePath);
  try {
    const db = opened.db,
      ctx = { actor: 'tester' };
    migrateDatabase(db);
    accounts.create(
      db,
      {
        id: 'cash',
        name: 'Synthetic Cash',
        type: 'checking',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-02-01',
      },
      ctx,
    );
    accounts.create(
      db,
      {
        id: 'depot',
        name: 'Synthetic Depot',
        type: 'crypto',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-02-01',
        referenceAccountId: 'cash',
      },
      ctx,
    );
    createSecurity(db, { id: 'coin', name: 'Synthetic Coin', kind: 'crypto' }, ctx);
    mapReadSource(db, { key: 'asset:coin', accountId: 'depot', securityId: 'coin' }, ctx, {
      allowUnseen: true,
    });
    mapReadSource(db, { key: 'currency:eur', accountId: 'cash', securityId: null }, ctx, {
      allowUnseen: true,
    });
    const base = {
      type: 'buy',
      walletId: 'synthetic-wallet',
      creditedAt: '2026-03-02T12:00:00Z',
      fee: null,
      tradeFee: null,
      tradeId: 'purchase',
      balanceAfter: null,
      compensates: null,
    };
    db.insert(inboxItem)
      .values({
        id: 'purchase',
        kind: 'import',
        refType: 'read_source',
        title: 'Synthetic purchase',
        detail: JSON.stringify({
          id: 'purchase',
          type: 'buy',
          transactions: [
            {
              ...base,
              id: 'coin-leg',
              flow: 'INCOMING',
              amount: { assetId: 'coin', currencyId: null, value: '1', cents: null },
            },
            {
              ...base,
              id: 'eur-leg',
              flow: 'OUTGOING',
              amount: { assetId: null, currencyId: 'eur', value: '1.00', cents: 100 },
            },
          ],
        }),
      })
      .run();
    const cli = (extra: string[] = []) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve('apps/server/src/imports/migrate-cli.ts'),
          'source-rebuild',
          '--depot',
          'Synthetic Depot',
          '--cash',
          'Synthetic Cash',
          '--since',
          '2026-03-01',
          ...extra,
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, DATA_DIR: dir, DATABASE_PATH: databasePath },
          timeout: 60000,
        },
      );
    const dry = cli(['--dry-run', '--details', '--report', reportPath]);
    expect(dry.status, dry.stderr).toBe(0);
    expect(dry.stdout).toContain('(dry run)');
    expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toMatchObject({
      groupId: '',
      dryRun: true,
      counts: { created: 1, unitDifferences: 0 },
    });
    expect(listTrades(db)).toEqual([]);
    const stakedPreview = cli(['--dry-run', '--staked-now', 'Synthetic Coin=0.25', '--details']);
    expect(stakedPreview.status, stakedPreview.stderr).toBe(3); // Opening is unpriced.
    expect(stakedPreview.stdout).toContain('"openingUnitsE8": 25000000');
    expect(stakedPreview.stdout).toContain('"todayUnitsE8": 25000000');
    expect(listTrades(db)).toEqual([]);
    const invalidStaking = cli(['--staked-now', 'Synthetic Coin=-1']);
    expect(invalidStaking.status).toBe(1);
    expect(listTrades(db)).toEqual([]);
    expect(cli(['--staked-now']).status).toBe(1);
    const refused = cli(['--report', reportPath]);
    expect(refused.status).toBe(1);
    expect(listTrades(db)).toEqual([]);
    const outside = cli(['--report', join(dir, '..', 'outside-report.json')]);
    expect(outside.status).toBe(1);
    expect(outside.stderr).toContain('private volume');
    expect(listTrades(db)).toEqual([]);
    const real = cli();
    expect(real.status, real.stderr).toBe(0);
    expect(listTrades(db)).toHaveLength(1);
    const repeat = cli();
    expect(repeat.status, repeat.stderr).toBe(0);
    expect(repeat.stdout).toContain('"unchanged":1');
    db.insert(inboxItem)
      .values({
        id: 'unknown',
        kind: 'import',
        refType: 'read_source',
        title: 'Synthetic unmapped',
        detail: JSON.stringify({
          id: 'unknown',
          type: 'unknown',
          transactions: [
            {
              ...base,
              id: 'unmapped-leg',
              flow: 'INCOMING',
              amount: { assetId: 'unmapped', currencyId: null, value: '1', cents: null },
            },
          ],
        }),
      })
      .run();
    const skipped = cli(['--details']);
    expect(skipped.status, skipped.stderr).toBe(3);
    expect(skipped.stdout).toContain('unmapped_asset');
  } finally {
    opened.close();
    expect(relative(resolve(tmpdir()), resolve(dir)).startsWith('budget-source-rebuild-')).toBe(
      true,
    );
    rmSync(dir, { recursive: true, force: true });
  }
}, 180000);
