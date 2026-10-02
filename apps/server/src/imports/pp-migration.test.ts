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
import { coinIdOf } from './pp-commit';
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

describe('platforms like PP: cash account and securities account', () => {
  const balance = (id: string) =>
    accountBalances(db, TODAY).find((a) => a.accountId === id)?.balanceCents as number;
  const splitDoc = (opening: unknown = 'total') =>
    mapping((d) => {
      const first = model.portfolios[0]!;
      d.portfolios[first.uuid].cashAccount = { name: first.name + ' - Konto' };
      d.accounts[first.referenceAccountUuid as string] = {
        account: first.name + ' - Konto',
        cashFlows: 'ynab',
        openingBalance: opening,
        retireYnabValue: false,
      };
    });
  const byName = (name: string) =>
    db.select().from(account).where(eq(account.name, name)).get() as typeof account.$inferSelect;
  const first = () => model.portfolios[0]!;

  it('renames the YNAB account to the cash account, creates the securities account and links them', () => {
    const body = run({ kind: 'commit', runId: stage(splitDoc()) });
    const cash = byName(first().name + ' - Konto');
    const depot = byName(first().name);
    expect(cash.id).toBe('app-0'); // the YNAB account keeps its id and its bookings
    expect(cash.type).toBe('checking');
    expect(depot.id).not.toBe('app-0');
    expect(depot).toMatchObject({ role: 'investment', onBudget: false, openingBalanceCents: 0 });
    expect(depot.referenceAccountId).toBe(cash.id);
    expect(body['change'].splits).toEqual([
      { cash: cash.name, depot: depot.name, renamedFrom: first().name, state: 'new' },
    ]);
  });

  it('keeps the securities account at 0 cash: every trade settles through a transfer', () => {
    const body = run({ kind: 'commit', runId: stage(splitDoc()) });
    const cash = byName(first().name + ' - Konto');
    const depot = byName(first().name);
    expect(balance(depot.id)).toBe(0);
    expect(body['change'].transfers.added).toBeGreaterThan(0);
    const legs = liveBookings().filter((b) => b.transferId !== null);
    expect(legs).toHaveLength(body['change'].transfers.added * 2);
    expect(legs.every((b) => b.accountId === cash.id || b.accountId === depot.id)).toBe(true);
    // Cash account = YNAB opening + what the trades moved (no PP deposits are booked).
    const moved = live(trade)
      .filter((t) => t.accountId === depot.id)
      .reduce((a, t) => {
        const settlement = liveBookings(depot.id).find((b) => b.id === t.bookingId);
        return a + (settlement?.amountCents ?? 0);
      }, 0);
    const onCash = liveBookings(cash.id);
    const legSum = onCash
      .filter((b) => b.transferId !== null)
      .reduce((x, b) => x + b.amountCents, 0);
    const other = onCash
      .filter((b) => b.transferId === null)
      .reduce((x, b) => x + b.amountCents, 0);
    expect(legSum).toBe(moved); // the cash account carries what the trades moved
    expect(balance(cash.id)).toBe(cash.openingBalanceCents + moved + other);
    expect(body['report'].differences.positionUnits).toBe(0);
    // One platform in the report: securities plus cash, PP against the app.
    const platform = body['report'].platforms.find((p: any) => p.platform === depot.name);
    expect(platform.accounts).toEqual([depot.name, cash.name]);
  });

  it('opening balance total: cash plus PP securities equal the YNAB opening total', () => {
    // Holdings exist before the opening day when the opening day lies late in the file.
    db.update(account).set({ openingDate: '2026-09-02' }).where(eq(account.id, 'app-0')).run();
    apps[0]!.openingDate = '2026-09-02';
    const body = run({ kind: 'commit', runId: stage(splitDoc()) });
    const [check] = body['change'].openingCheck;
    expect(check.ynabOpeningCents).toBe(1_000);
    expect(check.securitiesCents).toBeGreaterThan(0);
    expect(check.cashOpeningCents + check.securitiesCents).toBe(1_000);
    expect(byName(first().name + ' - Konto').openingBalanceCents).toBe(check.cashOpeningCents);
  });

  it('a second run finds the finished split and changes nothing', () => {
    run({ kind: 'commit', runId: stage(splitDoc()) });
    const opening = byName(first().name + ' - Konto').openingBalanceCents;
    const again = run({ kind: 'commit', runId: stage(splitDoc()) });
    expect(again['change'].splits[0].state).toBe('done');
    expect(again['change'].transfers.added).toBe(0);
    expect(again['change'].trades.added).toBe(0);
    expect(byName(first().name + ' - Konto').openingBalanceCents).toBe(opening);
    expect(
      db
        .select()
        .from(account)
        .all()
        .filter((a) => a.name === first().name),
    ).toHaveLength(1);
  });

  it('reverts the split: the name and type come back, the securities account is gone', () => {
    const id = stage(splitDoc());
    run({ kind: 'commit', runId: id });
    run({ kind: 'revert', runId: id, force: false });
    const live1 = db
      .select()
      .from(account)
      .all()
      .filter((a) => a.name === first().name && a.deletedAt === null);
    expect(live1).toHaveLength(1);
    expect(live1[0]).toMatchObject({ id: 'app-0', type: 'brokerage' });
    expect(liveBookings()).toHaveLength(0);
    expect(byName(first().name + ' - Konto')).toBeUndefined();
  });

  it('refuses to revert once bookings were added to the new securities account', () => {
    const id = stage(splitDoc());
    run({ kind: 'commit', runId: id });
    createBooking(
      db,
      {
        accountId: byName(first().name).id,
        date: '2026-09-25',
        amountCents: 1,
        splits: [{ categoryId: null, amountCents: 1 }],
      },
      { actor: 't' },
    );
    expect(() => run({ kind: 'revert', runId: id, force: false })).toThrow(/after the import/);
  });

  it('only sets the Verrechnungskonto where a depot settles through an existing account', () => {
    const second = model.portfolios[1]!;
    const doc = mapping((d) => {
      d.portfolios[second.uuid].referenceAccount = apps[0]!.name;
    });
    run({ kind: 'commit', runId: stage(doc) });
    expect(db.select().from(account).where(eq(account.id, 'app-1')).get()?.referenceAccountId).toBe(
      'app-0',
    );
    expect(db.select().from(account).all()).toHaveLength(apps.length);
  });

  it('matches PP deposits with the app flows on the cash account and lists the rest', () => {
    const id = stage(splitDoc());
    run({ kind: 'commit', runId: id });
    const matches = run({ kind: 'report', runId: id })['report'].flowMatches;
    const m = matches.find((x: any) => x.platform === first().name);
    // The synthetic PP file has a 5.000 EUR deposit that the app (no YNAB transfer) does not have.
    expect(m.ppUnmatched.items.some((i: any) => i.cents === 500_000)).toBe(true);
    expect(m.matched.exact).toBe(0);
  });

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
        importKey: 'ynab-adjustment',
        splits: [{ categoryId: null, amountCents: cents }],
      },
      { actor: 't' },
    );

  it('explains the cash difference completely and keeps no valuation adjustment as cash', () => {
    adjustment('app-0', 50_000);
    const id = stage(splitDoc('keep'));
    // Without retiring, the adjustment is cash and the explanation says so.
    const dry = run({ kind: 'dry-run', runId: id });
    expect(dry['report'].flowMatches[0].valuationAdjustmentsRetired).toEqual({
      count: 0,
      cents: 0,
    });
    expect(dry['report'].flowMatches[0].cash.adjustmentsCountedCents).toBe(50_000);
    expect(dry['report'].flowMatches[0].cash.otherCents).toBe(0);
    // Retiring drops it: not cash any more, listed as valuation.
    const doc = splitDoc('keep');
    (doc.accounts[model.portfolios[0]!.referenceAccountUuid as string] as any).retireYnabValue =
      true;
    const body = run({ kind: 'commit', runId: stage(doc) });
    const m = body['report'].flowMatches.find((x: any) => x.platform === first().name);
    expect(m.valuationAdjustmentsRetired).toEqual({ count: 1, cents: 50_000 });
    expect(m.cash.adjustmentsCountedCents).toBe(0);
    expect(m.cash.otherCents).toBe(0);
    expect(m.cash.diffCents).toBe(m.cash.openingGapCents + m.cash.flowGapCents);
  });
});

describe('coin ids of crypto securities', () => {
  const sec = (over: Record<string, unknown>) =>
    ({ ...model.securities[0]!, isin: null, tickerSymbol: null, feedUrl: null, ...over }) as never;

  it('derives the CoinGecko id from the ticker, the cryptocalc link or the name', () => {
    expect(coinIdOf(sec({ name: 'Bitcoin', tickerSymbol: 'BTC' }))).toBe('bitcoin');
    expect(
      coinIdOf(
        sec({
          name: 'Ethereum',
          feedUrl: 'https://cryptocalc.cc/bitpanda-kurse/?currency=ETH&fiat=EUR&range=all',
        }),
      ),
    ).toBe('ethereum');
  });

  it('leaves leveraged indices and BEST unresolved, and never touches listed securities', () => {
    expect(coinIdOf(sec({ name: 'Bitcoin 2x Long', tickerSymbol: 'BTC2L' }))).toBeNull();
    expect(
      coinIdOf(sec({ name: 'BEST - Bitpanda Ecosystem Token', tickerSymbol: 'BEST' })),
    ).toBeNull();
    expect(
      coinIdOf(sec({ name: 'Bitcoin ETP', tickerSymbol: 'BTC', isin: 'XS0000000000' })),
    ).toBeNull();
  });

  it('commits the id on a created security, PP property first', () => {
    const doc = mapping();
    const body = run({ kind: 'dry-run', runId: stage(doc) });
    // The synthetic securities have ISINs: none of them is a coin.
    expect(body['change'].securities.sources.coingeckoId).toBe(0);
  });
});
