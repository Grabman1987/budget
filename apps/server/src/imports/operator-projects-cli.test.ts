import {
  migrateDatabase,
  openDatabase,
  accounts,
  categories,
  createEntity,
  createBooking,
  getBooking,
  schema,
} from '@budget/db';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('owner-config projects prints aggregates, limits booking details and returns 3 on skips', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-projects-'));
  const databasePath = join(dir, 'synthetic.sqlite');
  const file = join(dir, 'config.json');
  const opened = openDatabase(databasePath);
  const ctx = { actor: 'tester' };
  try {
    migrateDatabase(opened.db);
    accounts.create(
      opened.db,
      {
        id: 'synthetic',
        name: 'Synthetic Account',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-01-01',
      },
      ctx,
    );
    createEntity(opened.db, schema.categoryGroup, { id: 'g', name: 'Synthetic Group' }, ctx);
    categories.create(
      opened.db,
      { id: 'c', name: 'Synthetic Category', groupId: 'g', class: 'want' },
      ctx,
    );
    const booking = (amountCents: number, status: 'confirmed' | 'reconciled') =>
      createBooking(
        opened.db,
        {
          accountId: 'synthetic',
          date: '2026-02-10',
          amountCents,
          status,
          splits: [{ categoryId: 'c', amountCents }],
        },
        ctx,
      );
    const eligible = booking(-1201, 'confirmed');
    booking(-799, 'reconciled');
    writeFileSync(
      file,
      JSON.stringify({
        projects: [{ name: 'Synthetic Project', attributeCategory: 'Synthetic Category' }],
      }),
    );
    const cli = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve(import.meta.dirname, 'migrate-cli.ts'),
          'owner-config',
          '--file',
          file,
          ...args,
        ],
        { encoding: 'utf8', env: { ...process.env, DATABASE_PATH: databasePath }, timeout: 30000 },
      );
    const dry = cli('--dry-run');
    expect(dry.status, dry.stderr).toBe(3);
    expect(dry.stdout).toContain(
      'projects created 1 unchanged 0 attributed 1 bookings_unchanged 0 (dry run)',
    );
    expect(opened.db.select().from(schema.project).all()).toEqual([]);
    expect(getBooking(opened.db, eligible)!.projectId).toBeNull();
    const real = cli();
    expect(real.status, real.stderr).toBe(3);
    expect(real.stdout).toContain('projects skipped reconciled_locked 1');
    expect(real.stdout).toContain('projects group');
    for (const value of ['Synthetic', '2026-02-10', '-799', '-1201'])
      expect(real.stdout).not.toContain(value);
    const again = cli('--details');
    expect(again.status, again.stderr).toBe(3);
    expect(again.stdout).toContain(
      'projects created 0 unchanged 1 attributed 0 bookings_unchanged 1',
    );
    expect(again.stdout).toContain('projects skipped reconciled_locked 2026-02-10 -799');
    writeFileSync(file, JSON.stringify({ projects: [{ name: 'Synthetic Project' }] }));
    const clean = cli();
    expect(clean.status, clean.stderr).toBe(0);
    expect(clean.stdout).toContain(
      'projects created 0 unchanged 1 attributed 0 bookings_unchanged 0',
    );
    for (let i = 0; i < 27; i++) booking(-101, 'confirmed');
    writeFileSync(
      file,
      JSON.stringify({
        projects: [
          {
            name: 'Synthetic Project',
            attributeCategory: 'Synthetic Category',
            unlock: true,
          },
        ],
      }),
    );
    const boundedDry = cli('--dry-run');
    expect(boundedDry.status, boundedDry.stderr).toBe(0);
    expect(boundedDry.stdout).toContain('attributed 25 bookings_unchanged 1');
    expect(boundedDry.stdout).toContain('projects remaining 3');
    const batch = cli('--max-bookings', '2');
    expect(batch.status, batch.stderr).toBe(0);
    expect(batch.stdout).toContain('attributed 2 bookings_unchanged 1');
    expect(batch.stdout).toContain('projects remaining 26');
    const finish = cli('--max-bookings', '100');
    expect(finish.status, finish.stderr).toBe(0);
    expect(finish.stdout).toContain('attributed 26 bookings_unchanged 3');
    expect(finish.stdout).toContain('projects remaining 0');
    for (const value of ['0', '-1', '1.5', 'no', '9007199254740992']) {
      const invalid = cli('--max-bookings', value);
      expect(invalid.status).not.toBe(0);
      expect(invalid.stderr).toContain('--max-bookings must be a positive safe integer');
    }
  } finally {
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);

it('owner-config CLI continues payee income and explicit booking selectors without exposing data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-project-selectors-'));
  const databasePath = join(dir, 'synthetic.sqlite');
  const file = join(dir, 'config.json');
  const opened = openDatabase(databasePath);
  const ctx = { actor: 'tester' };
  try {
    migrateDatabase(opened.db);
    accounts.create(
      opened.db,
      {
        id: 'a',
        name: 'Synthetic Account',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-01-01',
      },
      ctx,
    );
    createEntity(opened.db, schema.payee, { id: 'p', name: 'Synthetic Payer' }, ctx);
    createEntity(opened.db, schema.incomeType, { id: 'i', name: 'Synthetic Income' }, ctx);
    const a = createBooking(
      opened.db,
      {
        accountId: 'a',
        payeeId: 'p',
        date: '2026-02-10',
        amountCents: 1201,
        splits: [{ incomeTypeId: 'i', amountCents: 1201 }],
      },
      ctx,
    );
    const b = createBooking(
      opened.db,
      {
        accountId: 'a',
        date: '2026-02-11',
        amountCents: 307,
        splits: [{ incomeTypeId: 'i', amountCents: 307 }],
      },
      ctx,
    );
    writeFileSync(
      file,
      JSON.stringify({
        projects: [
          {
            name: 'Synthetic Project',
            attributePayee: 'SYNTHETIC PAYER',
            incomeType: 'Synthetic Income',
            direction: 'inflow',
          },
          {
            name: 'Synthetic Project',
            attributeBookings: [
              { account: 'Synthetic Account', date: '2026-02-11', amountCents: 307 },
            ],
          },
        ],
      }),
    );
    const cli = () =>
      spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve(import.meta.dirname, 'migrate-cli.ts'),
          'owner-config',
          '--file',
          file,
          '--max-bookings',
          '1',
        ],
        { encoding: 'utf8', env: { ...process.env, DATABASE_PATH: databasePath }, timeout: 30000 },
      );
    const first = cli();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain('attributed 1 bookings_unchanged 0');
    expect(first.stdout).toContain('projects remaining 1');
    expect(getBooking(opened.db, a)!.projectId).not.toBeNull();
    expect(getBooking(opened.db, b)!.projectId).toBeNull();
    const second = cli();
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain('attributed 1 bookings_unchanged 1');
    expect(second.stdout).toContain('projects remaining 0');
    expect(getBooking(opened.db, b)!.projectId).toBe(getBooking(opened.db, a)!.projectId);
    const again = cli();
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain('attributed 0 bookings_unchanged 2');
    for (const output of [first.stdout, second.stdout, again.stdout])
      for (const value of ['Synthetic', '2026-02-10', ' 1201', ' 307'])
        expect(output).not.toContain(value);
  } finally {
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
