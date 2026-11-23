import { createBooking, createTestDatabase, openDatabase, schema } from '@budget/db';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';

// Every test spawns the reference-check CLI; cold CI runners need more than the default 5 s.
vi.setConfig({ testTimeout: 30_000 });
import manifest from './testing/reference-check-manifest.json';

const publicManifest = fileURLToPath(
  new URL('./testing/reference-check-manifest.json', import.meta.url),
);
const cli = fileURLToPath(new URL('./migrate-cli.ts', import.meta.url));
const start = '2026-05-01';

function seedReferenceDatabase(path: string, missingFx = false) {
  const { db, sqlite, close } = createTestDatabase();
  try {
    db.insert(schema.account)
      .values([
        {
          id: 'fixture-cash',
          name: 'Synthetic Cash',
          type: 'checking',
          role: 'budget',
          onBudget: true,
          openingDate: start,
          openingBalanceCents: 20_003,
          overdraftLimitCents: 4_009,
        },
        ...['fixture-depot-a', 'fixture-depot-b'].map((id) => ({
          id,
          name: id,
          type: 'brokerage' as const,
          role: 'investment' as const,
          onBudget: false,
          openingDate: start,
        })),
      ])
      .run();
    db.insert(schema.categoryGroup).values({ id: 'fixture-group', name: 'Synthetic Group' }).run();
    db.insert(schema.category)
      .values([
        { id: 'fixture-want', groupId: 'fixture-group', name: 'Synthetic Want', class: 'want' },
        {
          id: 'fixture-future',
          groupId: 'fixture-group',
          name: 'Synthetic Reserve',
          class: 'future',
          openingAvailableCents: 503,
        },
      ])
      .run();
    db.insert(schema.envelopeMonth)
      .values({ categoryId: 'fixture-want', month: '2026-05', assignedCents: 2_101 })
      .run();
    for (const [date, amountCents] of [
      ['2026-05-10', -1_201],
      ['2026-06-01', -207],
    ] as const) {
      createBooking(
        db,
        {
          accountId: 'fixture-cash',
          date,
          amountCents,
          status: 'pending',
          splits: [{ categoryId: 'fixture-want', amountCents }],
        },
        { actor: 'tester' },
      );
    }

    db.insert(schema.security)
      .values({ id: 'fixture-security', name: 'Synthetic Security', kind: 'etf' })
      .run();
    db.insert(schema.holding)
      .values(
        [
          { accountId: 'fixture-depot-a', asOf: start, unitsE8: 125_000_000 },
          { accountId: 'fixture-depot-b', asOf: start, unitsE8: 50_000_000 },
          { accountId: 'fixture-depot-b', asOf: '2026-05-11', unitsE8: 999_000_000 },
        ].map((row, i) => ({ ...row, id: `fixture-holding-${i}`, securityId: 'fixture-security' })),
      )
      .run();
    db.insert(schema.price)
      .values({
        securityId: 'fixture-security',
        date: start,
        priceMicro: 4_000_000,
        source: 'manual',
      })
      .run();

    const payments = [
      { date: '2026-05-12', cents: -1_001 }, // Before payday.
      { date: '2026-05-13', cents: 5_037 }, // Expected income is never free money.
      { date: '2026-05-15', cents: -303 }, // Payday: excluded from free, included in investable.
      { date: '2026-06-14', cents: -457 }, // Exactly 30 days past payday.
      { date: '2026-06-15', cents: -811 }, // Past both windows.
    ];
    for (const { date, cents } of payments) {
      const id = `fixture-payment-${date}`;
      db.insert(schema.expectedPayment)
        .values({
          id,
          name: id,
          accountId: 'fixture-cash',
          kind: cents < 0 ? 'outflow' : 'inflow',
          startDate: date,
          endDate: date,
          dueDay: Number(date.slice(8)),
        })
        .run();
      db.insert(schema.expectedPaymentVersion)
        .values({
          id,
          expectedPaymentId: id,
          validFrom: start,
          amountCents: Math.abs(cents),
          ...(missingFx && date === '2026-05-12'
            ? { currency: 'USD', originalAmountCents: 1_001 }
            : {}),
        })
        .run();
    }
    writeFileSync(path, sqlite.serialize());
  } finally {
    close();
  }
}

function runReferenceCheck(databasePath: string, manifestPath = publicManifest) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', cli, 'reference-check', '--manifest', manifestPath],
    {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_PATH: databasePath },
    },
  );
}

it('matches the six independent reference figures without changing the database or creating files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-reference-'));
  const path = join(dir, 'fixture.sqlite');
  try {
    seedReferenceDatabase(path);
    const before = readFileSync(path);
    const result = runReferenceCheck(path);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stderr).toBe('');
    expect(
      result.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual(
      manifest.items.map(({ figure, expected, tolerance }, i) => ({
        item: i + 1,
        figure,
        expected,
        tolerance,
        actual: expected,
        pass: true,
      })),
    );
    expect(readFileSync(path).equals(before)).toBe(true);
    expect(readdirSync(dir)).toEqual(['fixture.sqlite']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('fails per item for regression outputs, one-unit differences and unknown targets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-reference-'));
  const path = join(dir, 'fixture.sqlite');
  const manifestPath = join(dir, 'negative.json');
  try {
    seedReferenceDatabase(path);
    const wrong = [
      20_003, // Ignore pending bookings.
      0, // Omit the category split.
      18_802, // Omit securities from net worth.
      175_000_001, // Lose one 1e-8 unit.
      16_095, // Drop the last day of the investable window.
      21_810, // Add the overdraft limit to free money.
    ];
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        items: [
          ...manifest.items.map((item, i) => ({ ...item, expected: wrong[i] })),
          { ...manifest.items[3], securityId: 'fixture-absent', expected: 0 },
          { ...manifest.items[0], expected: 18_803 },
          manifest.items[0],
        ],
      }),
    );
    const result = runReferenceCheck(path, manifestPath);
    expect(result.status, result.stderr).toBe(1);
    const outcomes = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(outcomes.map(({ pass }) => pass)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(outcomes[6]).toMatchObject({ item: 7, actual: null, reason: 'unavailable' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('refuses a WAL-mode input without creating sidecar files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-reference-'));
  const path = join(dir, 'fixture.sqlite');
  try {
    seedReferenceDatabase(path);
    openDatabase(path).close();
    const before = readFileSync(path);
    const result = runReferenceCheck(path);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('standalone SQLite snapshot');
    expect(readFileSync(path).equals(before)).toBe(true);
    expect(readdirSync(dir)).toEqual(['fixture.sqlite']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('reports liquidity figures as unavailable when an included outflow has no exchange rate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-reference-'));
  const path = join(dir, 'fixture.sqlite');
  try {
    seedReferenceDatabase(path, true);
    const result = runReferenceCheck(path);
    expect(result.status).toBe(1);
    expect(
      result.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
        .slice(-2),
    ).toMatchObject([
      { figure: 'investable-amount', actual: null, pass: false, reason: 'unavailable' },
      { figure: 'free-until-payday', actual: null, pass: false, reason: 'unavailable' },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('refuses an excessive tolerance and never creates a missing database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-reference-'));
  const path = join(dir, 'missing.sqlite');
  const manifestPath = join(dir, 'invalid.json');
  try {
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        items: [{ ...manifest.items[0], tolerance: 1 }],
      }),
    );
    const invalid = runReferenceCheck(path, manifestPath);
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toContain('Invalid reference manifest');
    const missing = runReferenceCheck(path);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('Cannot open reference database');
    expect(readdirSync(dir)).toEqual(['invalid.json']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
