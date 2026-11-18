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
  } finally {
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);
