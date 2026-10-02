/* eslint-disable @typescript-eslint/no-explicit-any -- task answers are asserted as plain JSON */
import {
  accountBalances,
  accounts,
  booking,
  bookingSplit,
  createTestDatabase,
  createTransfer,
  security,
  trade,
  type Db,
} from '@budget/db';
import { sampleLedger } from '@budget/fixtures';
import { ppExport } from '@budget/fixtures/pp';
import { parsePp, proposeMigration, SIGN, type AppAccountRef } from '@budget/import-pp';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { runPpTask, type PpTask } from './pp-tasks';

const TODAY = '2026-09-30';
const bytes = new TextEncoder().encode(ppExport(sampleLedger(), { extras: true }));
const model = parsePp(bytes);
const first = model.portfolios[0]!;
const kUuid = first.referenceAccountUuid as string;
const kName = `${first.name} - Konto`;

let db: Db;
let apps: AppAccountRef[];
const run = (task: PpTask) => runPpTask(db, task, { today: TODAY }) as Record<string, any>;
const live = (accountId: string) =>
  db
    .select()
    .from(booking)
    .where(and(eq(booking.accountId, accountId), isNull(booking.deletedAt)))
    .all();
const balance = (id: string, day: string) =>
  accountBalances(db, day).find((a) => a.accountId === id)?.balanceCents as number;

const eur = (cents: number) =>
  `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(Math.abs(cents) % 100).padStart(2, '0')}`;
const dmy = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

interface Row {
  day: string;
  cents: number;
  who?: string;
  info: string;
}
function tsv(rows: Row[]): string {
  const lines = ['buchtag\tvaluta\tbetrag\tta_nr\tempfaenger\tbuchungsinfo'];
  rows.forEach((r, i) =>
    lines.push(
      [dmy(r.day), dmy(r.day), eur(r.cents), String(1000 + i), r.who ?? '', r.info].join('\t'),
    ),
  );
  return lines.join('\n');
}

/** Rows that say exactly what PP's cash account says (trades, dividends, interest, costs). */
function ppRows(): Row[] {
  const acc = model.accounts.find((a) => a.uuid === kUuid)!;
  const isin = new Map(model.securities.map((s) => [s.uuid, s.isin ?? 'XS0000000000']));
  let n = 100;
  const out: Row[] = [];
  for (const t of acc.transactions) {
    if (t.date < '2023-10-01') continue;
    const cents = SIGN[t.type] * t.amountCents;
    const code = isin.get(t.securityUuid ?? '') ?? 'XS0000000000';
    const info =
      t.type === 'BUY'
        ? `Ausführung ORDER Kauf ${code} ${n++}`
        : t.type === 'SELL'
          ? `Ausführung ORDER Verkauf ${code} ${n++}`
          : t.type === 'DIVIDENDS'
            ? `Erträgnisausschüttung ${code}`
            : t.type === 'INTEREST' || t.type === 'INTEREST_CHARGE'
              ? 'Zinsabschluss 01.01.2026 -31.03.2026'
              : 'Steuerkorrektur';
    if (['DEPOSIT', 'REMOVAL', 'TRANSFER_IN', 'TRANSFER_OUT'].includes(t.type)) continue;
    out.push({ day: t.date, cents, info });
  }
  return out;
}

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
  accounts.create(
    db,
    {
      id: 'bank',
      name: 'Bank',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2023-10-01',
      openingBalanceCents: 100_000,
      sortOrder: 9,
    },
    { actor: 't' },
  );
});

const transfer = (day: string, cents: number) =>
  createTransfer(
    db,
    {
      fromAccountId: cents > 0 ? 'bank' : 'app-0',
      toAccountId: cents > 0 ? 'app-0' : 'bank',
      date: day,
      amountCents: Math.abs(cents),
      status: 'confirmed',
      source: 'migration',
      memo: 'ynab',
    },
    { actor: 't' },
  );

const mapping = () => {
  const { doc } = proposeMigration(model, apps);
  const d = doc as any;
  d.portfolios[first.uuid].cashAccount = { name: kName };
  d.accounts[kUuid] = {
    account: kName,
    cashFlows: 'ynab',
    openingBalance: 'keep',
    retireYnabValue: false,
    statement: {
      format: 'flatex-cashkonto',
      file: 'statement.tsv',
      closing: { date: '2026-09-30', cents: 1_000_000 },
      bank: 'Bank',
    },
  };
  return d;
};
const stage = (rows: Row[]) =>
  (
    run({
      kind: 'stage',
      file: { name: 'synthetic.xml', bytes },
      mapping: mapping(),
      statements: {
        [kUuid]: { name: 'statement.tsv', bytes: new TextEncoder().encode(tsv(rows)) },
      },
    }).run as { id: string }
  ).id;

describe('platform statement', () => {
  const rowsWithTransfers = (): Row[] => [
    ...ppRows(),
    // matches the YNAB transfer, two days later than YNAB has it
    { day: '2026-09-02', cents: 50_000, who: 'Max Muster', info: 'Einzahlung' },
    // YNAB does not have it, the bank neither: created
    { day: '2026-09-03', cents: -12_000, who: 'Max Muster', info: 'Auszahlung' },
    // not in PP: an order of securities held before PP, and a distribution
    { day: '2026-08-20', cents: -20_000, info: 'Ausführung ORDER Kauf XS1111111111 555' },
    { day: '2026-08-21', cents: 123, info: 'Erträgnisausschüttung XS1111111111' },
  ];

  it('makes the cash account follow the statement exactly and derives its opening balance', () => {
    transfer('2026-08-31', 50_000);
    transfer('2026-09-04', 7_700); // YNAB only: removed
    const rows = rowsWithTransfers();
    const id = stage(rows);
    const body = run({ kind: 'commit', runId: id });
    const st = body['change'].statements[0];
    expect(st.check).toEqual({ balanceCents: 1_000_000, closingCents: 1_000_000, diffCents: 0 });
    const sum = rows.reduce((a, r) => a + r.cents, 0);
    expect(st.cashOpeningCents).toBe(1_000_000 - sum);
    expect(balance('app-0', '2026-09-30')).toBe(1_000_000);
    expect(body['change'].openingCheck.at(-1)).toMatchObject({
      ynabOpeningCents: 1_000,
      cashOpeningCents: 1_000_000 - sum,
    });
    // PP is complete for its trades: every PP item has a row.
    expect(st.ppOnlyItems).toBe(0);
    expect(st.gapIncomeAndCosts).toBe(1);
    expect(st.oldHoldings.gapOrders).toBe(1);
  });

  it('matches transfers with the bank account, fixes days, creates and removes', () => {
    transfer('2026-08-31', 50_000);
    transfer('2026-09-04', 7_700);
    const bankBefore = balance('bank', '2026-09-30');
    const body = run({ kind: 'commit', runId: stage(rowsWithTransfers()) });
    const t = body['change'].statements[0].transfers;
    expect(t.statementTransfers).toBe(2);
    expect(t).toMatchObject({ matched: 1, dateFixed: 1 });
    expect(t.created).toEqual([{ date: '2026-09-03', cents: -12_000 }]);
    expect(t.removed).toEqual([{ date: '2026-09-04', cents: 7_700 }]);
    // The matched transfer now has the statement's day on both legs.
    const legs = db
      .select()
      .from(booking)
      .where(and(isNull(booking.deletedAt), eq(booking.amountCents, 50_000)))
      .all();
    expect(legs.map((b) => b.date)).toEqual(['2026-09-02']);
    // The bank account: +120 (created transfer back to the bank) and +77 (YNAB-only removed).
    expect(balance('bank', '2026-09-30')).toBe(bankBefore + 12_000 + 7_700);
    expect(t.bank).toEqual({ beforeCents: bankBefore, afterCents: bankBefore + 19_700 });
  });

  it('converts a bank booking without a transfer into the transfer (its category stays)', () => {
    // The bank side exists as an ordinary booking; only the cash account lacks the other leg.
    db.insert(booking)
      .values({
        id: 'plain',
        accountId: 'bank',
        date: '2026-09-04',
        amountCents: 12_000,
        source: 'migration',
      })
      .run();
    db.insert(bookingSplit)
      .values({ id: 'plain-split', bookingId: 'plain', amountCents: 12_000 })
      .run();
    const rows = rowsWithTransfers().map((r) =>
      r.cents === -12_000 ? { ...r, cents: -12_000 } : r,
    );
    // The bank gave +120 (bank booking is +120 here, the statement shows the cash leaving: -120).
    db.update(booking).set({ amountCents: 12_000 }).where(eq(booking.id, 'plain')).run();
    transfer('2026-08-31', 50_000);
    const body = run({ kind: 'commit', runId: stage(rows) });
    const t = body['change'].statements[0].transfers;
    expect(t.converted).toEqual([{ date: '2026-09-03', cents: -12_000 }]);
    expect(t.created).toEqual([]);
    const row = db.select().from(booking).where(eq(booking.id, 'plain')).get()!;
    expect(row.transferId).not.toBeNull();
    expect(row.date).toBe('2026-09-03');
  });

  it('splits one YNAB transfer that the statement shows as two', () => {
    transfer('2026-08-31', 50_000);
    const rows = rowsWithTransfers().filter((r) => r.cents !== 50_000);
    rows.push(
      { day: '2026-09-01', cents: 30_000, who: 'Max Muster', info: 'Kauf XS2222222222 1' },
      { day: '2026-09-01', cents: 20_000, who: 'Max Muster', info: 'Kauf XS3333333333 2' },
    );
    const body = run({ kind: 'commit', runId: stage(rows) });
    expect(body['change'].statements[0].transfers.split).toBe(1);
    const amounts = live('app-0')
      .filter((b) => b.transferId !== null && b.memo !== 'Verrechnung')
      .map((b) => b.amountCents)
      .sort((a, b) => a - b);
    expect(amounts).toContain(30_000);
    expect(amounts).toContain(20_000);
    expect(body['change'].statements[0].check.diffCents).toBe(0);
  });

  it('turns a PP delivery into the purchase the statement shows', () => {
    const delivery = model.portfolios
      .flatMap((p, i) =>
        p.transactions.filter((t) => t.type === 'DELIVERY_INBOUND').map((t) => ({ t, i })),
      )
      .find((x) => x.i === 0);
    if (!delivery) return;
    const code = model.securities.find((s) => s.uuid === delivery.t.securityUuid)?.isin;
    if (!code || delivery.t.date < '2023-10-01') return;
    const rows = [
      ...rowsWithTransfers(),
      {
        day: delivery.t.date,
        cents: -delivery.t.amountCents,
        info: `Ausführung ORDER Kauf ${code} 9999`,
      },
    ];
    const body = run({ kind: 'commit', runId: stage(rows) });
    expect(body['change'].statements[0].deliveriesToPurchases).toBe(1);
    const sec = db.select().from(security).where(eq(security.isin, code)).get()!;
    const t = db
      .select()
      .from(trade)
      .where(
        and(eq(trade.securityId, sec.id), eq(trade.date, delivery.t.date), isNull(trade.deletedAt)),
      )
      .all()
      .find((x) => x.importKey === `pp:${delivery.t.uuid}`)!;
    expect(t.kind).toBe('buy');
    expect(t.bookingId).not.toBeNull();
  });

  it('hands the old holdings over and reverts everything with the run', () => {
    transfer('2026-08-31', 50_000);
    const id = stage(rowsWithTransfers());
    const body = run({ kind: 'commit', runId: id });
    expect(body['change'].statements[0].oldHoldings.openingCents).toBeGreaterThanOrEqual(0);
    run({ kind: 'revert', runId: id, force: false });
    expect(live('app-0').filter((b) => b.importKey?.startsWith('stmt:'))).toHaveLength(0);
    expect(db.select().from(booking).where(eq(booking.id, 'bank')).all()).toHaveLength(0);
    expect(balance('bank', '2026-09-30')).toBe(100_000 - 50_000);
  });

  it('is repeatable: a second run finds everything done', () => {
    transfer('2026-08-31', 50_000);
    run({ kind: 'commit', runId: stage(rowsWithTransfers()) });
    const before = live('app-0').length;
    const again = run({ kind: 'commit', runId: stage(rowsWithTransfers()) });
    expect(again['change'].statements[0].check.diffCents).toBe(0);
    expect(live('app-0')).toHaveLength(before);
    expect(again['change'].statements[0].transfers.created).toEqual([]);
    expect(again['change'].statements[0].transfers.removed).toEqual([]);
  });

  it('refuses a statement that does not parse and a missing file', () => {
    const bad = run({
      kind: 'stage',
      file: { name: 'synthetic.xml', bytes },
      mapping: mapping(),
      statements: { [kUuid]: { name: 's.tsv', bytes: new TextEncoder().encode('x\ty') } },
    }).run as { id: string };
    const dry = run({ kind: 'dry-run', runId: bad.id });
    expect(dry['problems'].some((p: any) => p.code === 'statement.parse')).toBe(true);
    const none = run({ kind: 'stage', file: { name: 'synthetic.xml', bytes }, mapping: mapping() })
      .run as { id: string };
    expect(
      run({ kind: 'dry-run', runId: none.id })['problems'].some(
        (p: any) => p.code === 'statement.missing',
      ),
    ).toBe(true);
  });
});
