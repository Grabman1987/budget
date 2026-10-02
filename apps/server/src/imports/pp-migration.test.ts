/* eslint-disable @typescript-eslint/no-explicit-any -- task answers are asserted as plain JSON */
import {
  account,
  accountBalances,
  accounts,
  booking,
  createBooking,
  createTestDatabase,
  importRun,
  price,
  security,
  setManualPrice,
  SYSTEM_PAYEE_IDS,
  trade,
  upsertPrice,
  type Db,
} from '@budget/db';
import { sampleLedger } from '@budget/fixtures';
import { ppExport } from '@budget/fixtures/pp';
import {
  parsePp,
  proposeMigration,
  type PpMigrationInput,
  type AppAccountRef,
} from '@budget/import-pp';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { previousIds } from './commit';
import { PpTaskError, runPpTask, type PpTask } from './pp-tasks';

const TODAY = '2026-09-30';
const ctx = { today: TODAY };
const bytes = new TextEncoder().encode(ppExport(sampleLedger(), { extras: true }));
const model = parsePp(bytes);

let db: Db;
let apps: AppAccountRef[];

const run = (task: PpTask) => runPpTask(db, task, ctx) as Record<string, any>;
function live(table: typeof trade): (typeof trade.$inferSelect)[];
function live(table: typeof security): (typeof security.$inferSelect)[];
function live(table: typeof trade | typeof security) {
  return db.select().from(table).where(isNull(table.deletedAt)).all();
}
const liveBookings = (accountId?: string) =>
  db
    .select()
    .from(booking)
    .where(and(isNull(booking.deletedAt), accountId ? eq(booking.accountId, accountId) : undefined))
    .all();

/** The proposal for the synthetic file, with the options a test wants to change. */
function mapping(edit: (doc: any) => void = () => undefined): PpMigrationInput {
  const { doc } = proposeMigration(model, apps);
  edit(doc);
  return doc;
}
const stage = (doc: PpMigrationInput = mapping()) =>
  (
    run({ kind: 'stage', file: { name: 'synthetic.xml', bytes }, mapping: doc }).run as {
      id: string;
    }
  ).id;

beforeEach(() => {
  db = createTestDatabase().db;
  apps = model.portfolios.map((p, i) => {
    accounts.create(
      db,
      {
        id: `app-${i}`,
        name: p.name,
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: '2023-10-01',
        openingBalanceCents: 1_000 * (i + 1),
        sortOrder: i,
      },
      { actor: 't' },
    );
    return {
      id: `app-${i}`,
      name: p.name,
      role: 'investment',
      currency: 'EUR',
      openingDate: '2023-10-01',
      openingBalanceCents: 1_000 * (i + 1),
    };
  });
});

describe('stage, dry run, commit', () => {
  it('refuses a file that is no PP file and stores nothing', () => {
    expect(() =>
      run({ kind: 'stage', file: { name: 'x.xml', bytes: new TextEncoder().encode('<a/>') } }),
    ).toThrow(PpTaskError);
    expect(db.select().from(importRun).all()).toHaveLength(0);
  });

  it('needs a mapping before a dry run', () => {
    const id = (run({ kind: 'stage', file: { name: 's.xml', bytes } }).run as { id: string }).id;
    expect(() => run({ kind: 'dry-run', runId: id })).toThrow(/mapping/);
  });

  it('dry run writes nothing and reports what a commit does, with 0 differences in units', () => {
    const id = stage();
    const body = run({ kind: 'dry-run', runId: id });
    expect(body['problems'].filter((p: any) => p.severity === 'error')).toEqual([]);
    expect(body['change'].trades.added).toBeGreaterThan(0);
    expect(body['report'].differences.positionUnits).toBe(0);
    expect(live(security)).toHaveLength(0);
    expect(live(trade)).toHaveLength(0);
    expect(db.select().from(price).all()).toHaveLength(0);
    expect(accountBalances(db, TODAY).find((a) => a.accountId === 'app-0')?.balanceCents).toBe(
      1_000,
    );
    expect((body['run'] as { status: string }).status).toBe('dry_run');
  });

  it('commits securities, prices, trades with settlements; holdings, values and cost equal PP', () => {
    const id = stage();
    const body = run({ kind: 'commit', runId: id });
    const change = body['change'];
    expect(change.securities.created).toBe(model.securities.length);
    expect(live(security)).toHaveLength(model.securities.length);
    expect(db.select().from(price).all()).toHaveLength(
      model.securities.reduce((a, s) => a + s.prices.length, 0),
    );
    expect(
      db
        .select()
        .from(price)
        .all()
        .every((p) => p.source === 'import'),
    ).toBe(true);
    expect(live(trade)).toHaveLength(change.trades.added);
    // Every trade that moves money has its settlement booking, none for deliveries.
    const settled = live(trade).filter((t) => t.bookingId !== null).length;
    expect(settled).toBeGreaterThan(0);
    const report = body['report'];
    expect(report.differences.positionUnits).toBe(0);
    expect(report.differences.positionValues).toBe(0);
    expect(report.differences.positionCosts).toBe(0);
    expect(report.positions.length).toBeGreaterThan(0);
    for (const p of report.positions) expect(p.unitsDiffE8).toBe(0);
    expect((body['run'] as { status: string }).status).toBe('committed');
  });

  it('keeps YNAB deposits: PP deposits are only compared, interest and fees are booked', () => {
    run({ kind: 'commit', runId: stage() });
    const change = run({
      kind: 'report',
      runId: (db.select().from(importRun).get() as { id: string }).id,
    }) as Record<string, any>;
    const lines = change['report'].cashFlows as {
      pp: { deposits: number };
      app: { netCents: number };
    }[];
    // The synthetic file has a 5.000 EUR deposit that the app (no YNAB transfers) does not have.
    expect(lines.some((l) => l.pp.deposits === 500_000 && l.app.netCents === 0)).toBe(true);
    const capital = liveBookings().filter((b) => b.importKey?.startsWith('pp:'));
    expect(capital.length).toBeGreaterThan(0);
  });

  it('books PP deposits as plain bookings where the mapping says cashFlows book', () => {
    const doc = mapping((d) => {
      for (const entry of Object.values(d.accounts) as any[])
        if (entry !== 'ignore') entry.cashFlows = 'book';
    });
    run({ kind: 'commit', runId: stage(doc) });
    const memos = liveBookings().map((b) => b.memo);
    expect(memos).toContain('Einzahlung: Einzahlung');
  });

  it('refuses to commit while the dry run has errors', () => {
    const traded = mapToTradedSecurity();
    const doc = mapping((d) => {
      d.securities[traded] = 'skip';
    });
    const id = stage(doc);
    const dry = run({ kind: 'dry-run', runId: id });
    expect(dry['report']).toBeNull();
    expect(dry['problems'].some((p: any) => p.code === 'security.skipped_but_traded')).toBe(true);
    expect(() => run({ kind: 'commit', runId: id })).toThrow(/errors/);
    expect(live(trade)).toHaveLength(0);
  });

  it('leaves the YNAB import alone: its previous ids ignore a PP run', () => {
    run({ kind: 'commit', runId: stage() });
    expect(previousIds(db)).toEqual({ accounts: {}, categories: {} });
  });
});

function mapToTradedSecurity(): string {
  for (const p of model.portfolios) {
    const t = p.transactions.find((x) => x.securityUuid);
    if (t?.securityUuid) return t.securityUuid;
  }
  throw new Error('no traded security');
}

describe('idempotent re-run and revert', () => {
  it('a second run of the same file adds nothing and reports everything unchanged', () => {
    const first = run({ kind: 'commit', runId: stage() });
    const trades = live(trade).length;
    const bookings = liveBookings().length;
    const second = run({ kind: 'commit', runId: stage() });
    const c = second['change'];
    expect(c.securities).toMatchObject({ created: 0, matched: model.securities.length });
    expect(c.prices).toMatchObject({ inserted: 0, replaced: 0 });
    expect(c.trades).toMatchObject({ added: 0, changed: 0, missing: 0 });
    expect(c.trades.unchanged).toBe(first['change'].trades.added);
    expect(c.bookings.added).toBe(0);
    expect(live(trade)).toHaveLength(trades);
    expect(liveBookings()).toHaveLength(bookings);
    expect(second['report'].differences.positionUnits).toBe(0);
  });

  it('reports a trade that changed in a newer file and leaves it alone', () => {
    run({ kind: 'commit', runId: stage() });
    const [row] = live(trade);
    db.update(trade)
      .set({ amountCents: row!.amountCents + 1 })
      .where(eq(trade.id, row!.id))
      .run();
    const again = run({ kind: 'commit', runId: stage() });
    expect(again['change'].trades.changed).toBe(1);
    expect(live(trade).find((t) => t.id === row!.id)?.amountCents).toBe(row!.amountCents + 1);
  });

  it('reverts the newest run as a whole and the same file commits again', () => {
    const idA = stage();
    run({ kind: 'commit', runId: idA });
    const before = {
      trades: live(trade).length,
      bookings: liveBookings().length,
      balance: accountBalances(db, TODAY),
    };
    const idB = stage();
    run({ kind: 'commit', runId: idB });
    // Only the newest committed run can be reverted.
    expect(() => run({ kind: 'revert', runId: idA, force: false })).toThrow(/newer/);
    run({ kind: 'revert', runId: idB, force: false });
    run({ kind: 'revert', runId: idA, force: false });
    expect(live(security)).toHaveLength(0);
    expect(live(trade)).toHaveLength(0);
    expect(liveBookings()).toHaveLength(0);
    expect(db.select().from(price).all()).toHaveLength(0);
    expect(accountBalances(db, TODAY).find((a) => a.accountId === 'app-0')?.balanceCents).toBe(
      1_000,
    );
    const status = db.select().from(importRun).where(eq(importRun.id, idA)).get();
    expect(status?.status).toBe('reverted');
    // Retired keys: the same file commits again with the same result.
    const idC = stage();
    const again = run({ kind: 'commit', runId: idC });
    expect(again['change'].trades.added).toBe(before.trades);
    expect(liveBookings()).toHaveLength(before.bookings);
    expect(accountBalances(db, TODAY)).toEqual(before.balance);
  });

  it('refuses the revert once trades were added to its securities afterwards', () => {
    const id = stage();
    run({ kind: 'commit', runId: id });
    const [t] = live(trade);
    db.insert(trade)
      .values({
        id: 'later',
        securityId: t!.securityId,
        accountId: t!.accountId,
        date: '2026-09-20',
        kind: 'delivery_in',
        unitsE8: 1,
        amountCents: 1,
      })
      .run();
    expect(() => run({ kind: 'revert', runId: id, force: false })).toThrow(/after the import/);
  });
});

describe('prices', () => {
  it('lets a manual price win, replaces a refreshed one and restores both on revert', () => {
    const sec = model.securities.find((s) => s.isin !== null && s.prices.length > 2)!;
    const [d1, d2] = sec.prices;
    // The app already knows the security (matched by ISIN) with two prices of its own.
    db.insert(security)
      .values({ id: 'pre', name: 'Known ETF', kind: 'etf', isin: sec.isin, currency: 'EUR' })
      .run();
    db.insert(price)
      .values({
        securityId: 'pre',
        date: d1!.date,
        priceMicro: 7,
        currency: 'EUR',
        source: 'yfinance',
      })
      .run();
    setManualPrice(
      db,
      { securityId: 'pre', date: d2!.date, priceMicro: 8, currency: 'EUR' },
      { actor: 't' },
    );
    const id = stage();
    const body = run({ kind: 'commit', runId: id });
    expect(body['change'].securities.matched).toBe(1);
    expect(body['change'].prices.replaced).toBe(1);
    expect(body['change'].prices.manualKept).toBe(1);
    const rows = db.select().from(price).where(eq(price.securityId, 'pre')).all();
    expect(rows.find((r) => r.date === d1!.date)).toMatchObject({
      priceMicro: d1!.priceMicro,
      source: 'import',
    });
    expect(rows.find((r) => r.date === d2!.date)).toMatchObject({
      priceMicro: 8,
      source: 'manual',
    });
    expect(rows).toHaveLength(sec.prices.length);
    run({ kind: 'revert', runId: id, force: false });
    const after = db.select().from(price).where(eq(price.securityId, 'pre')).all();
    expect(after.map((r) => [r.date, r.priceMicro, r.source])).toEqual([
      [d1!.date, 7, 'yfinance'],
      [d2!.date, 8, 'manual'],
    ]);
    // The matched security was not created by the run and stays.
    expect(db.select().from(security).where(eq(security.id, 'pre')).get()?.deletedAt).toBeNull();
  });

  it('protects imported history from a later refresh', () => {
    run({ kind: 'commit', runId: stage() });
    const sec = db.select().from(security).where(isNull(security.deletedAt)).all()[0]!;
    const last = db
      .select()
      .from(price)
      .where(eq(price.securityId, sec.id))
      .all()
      .map((p) => p.date)
      .sort()
      .at(-1)!;
    expect(
      upsertPrice(db, {
        securityId: sec.id,
        date: last,
        priceMicro: 1,
        currency: 'EUR',
        source: 'yfinance',
      }),
    ).toBe(false);
  });
});

describe("the switch of an account's YNAB value", () => {
  const adjustment = (accountId: string, cents: number) =>
    createBooking(
      db,
      {
        accountId,
        date: '2025-03-01',
        amountCents: cents,
        payeeId: SYSTEM_PAYEE_IDS.manual_adjustment.id,
        source: 'migration',
        status: 'reconciled',
        importKey: `ynab-adjustment-${accountId}`,
        splits: [{ categoryId: null, amountCents: cents }],
      },
      { actor: 't' },
    );
  const balance = (id: string) =>
    accountBalances(db, TODAY).find((a) => a.accountId === id)?.balanceCents as number;

  it('retires the adjustments of an account with a depot, undoably; keeps the opening balance', () => {
    const adj = adjustment('app-0', 50_000);
    const withAdjustment = balance('app-0');
    const body = run({ kind: 'commit', runId: stage() });
    const line = body['change'].accounts.find((a: any) => a.account === apps[0]!.name);
    expect(line).toMatchObject({
      openingFromCents: 1_000,
      openingToCents: 1_000,
      adjustmentsRetired: 1,
    });
    expect(db.select().from(booking).where(eq(booking.id, adj)).get()?.deletedAt).not.toBeNull();
    expect(withAdjustment - 50_000).toBe(1_000);
    expect(
      db.select().from(account).where(eq(account.id, 'app-0')).get()?.openingBalanceCents,
    ).toBe(1_000);
    run({
      kind: 'revert',
      runId: (db.select().from(importRun).get() as { id: string }).id,
      force: false,
    });
    expect(db.select().from(booking).where(eq(booking.id, adj)).get()?.deletedAt).toBeNull();
    expect(balance('app-0')).toBe(withAdjustment);
  });

  it('keeps the adjustments where the mapping says retireYnabValue false (P2P values)', () => {
    const adj = adjustment('app-1', 20_000);
    const doc = mapping((d) => {
      for (const entry of Object.values(d.accounts) as any[])
        if (entry !== 'ignore') entry.retireYnabValue = false;
    });
    run({ kind: 'commit', runId: stage(doc) });
    expect(db.select().from(booking).where(eq(booking.id, adj)).get()?.deletedAt).toBeNull();
  });

  it('sets the opening balance to PP cash, or to a given number, when asked', () => {
    const ref = model.portfolios[0]!.referenceAccountUuid as string;
    const doc = mapping((d) => {
      d.accounts[ref].openingBalance = 'pp';
      const other = model.portfolios[1]!.referenceAccountUuid as string;
      d.accounts[other].openingBalance = 4_242;
    });
    const body = run({ kind: 'commit', runId: stage(doc) });
    const [a, b] = body['change'].accounts;
    // The synthetic PP file starts after the opening day, so PP's cash before it is 0.
    expect(a.openingToCents).toBe(0);
    expect(b.openingToCents).toBe(4_242);
    expect(
      db.select().from(account).where(eq(account.id, 'app-1')).get()?.openingBalanceCents,
    ).toBe(4_242);
    run({
      kind: 'revert',
      runId: (db.select().from(importRun).get() as { id: string }).id,
      force: false,
    });
    expect(
      db.select().from(account).where(eq(account.id, 'app-1')).get()?.openingBalanceCents,
    ).toBe(2_000);
  });
});
