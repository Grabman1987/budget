import {
  accountBalances,
  booking,
  bookingSplit,
  deleteBooking,
  insertManyTracked,
  insertRows,
  transfer,
  updateTracked,
  assertLedgerInvariants,
  type Executor,
  type GroupedContext,
} from '@budget/db';
import { addDays, settlementCents } from '@budget/domain';
import {
  matchFlows,
  oldUnitsE8,
  parseStatement,
  planStatementRows,
  ppPositionsAsOf,
  StatementError,
  type AccountTarget,
  type DeliveryItem,
  type ExpectedItem,
  type FlowItem,
  type PlannedBooking,
  type PlannedTrade,
  type SecurityPlan,
  type StatementRow,
} from '@budget/import-pp';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { PpModel } from '@budget/import-pp';
import type { Prepared, PpRunProblem } from './pp-commit';

/**
 * Platform statements applied to the plan and to the ledger (`docs/migration/pp-export.md`,
 * "Platform statement"). Two phases:
 *
 * 1. `prepareStatement` (read-only, before anything is written): which rows PP has, which it lacks.
 *    PP deliveries that the statement shows as purchases become purchases with the statement's
 *    cash; the rows PP lacks are added to the plan: orders as trades of one synthetic
 *    "old holdings" security (units = euros at price 1, held from the opening day to the day the
 *    statement's orders end, then handed over to PP's own deliveries), income and costs as cash
 *    bookings. The opening balance of the cash account follows from the statement's closing balance;
 *    the old holdings are sized so that cash plus securities equal YNAB's opening total.
 * 2. `reconcileStatementTransfers` (in the run's transaction): every external transfer of the
 *    statement exists once, as a transfer between the bank account and the cash account.
 */

export const OLD_PREFIX = 'stmt:old:';

export interface PreparedStatement {
  account: string;
  accountId: string;
  depotId: string;
  bankAccountId: string;
  closingDate: string;
  closingCents: number;
  openingDate: string;
  rows: StatementRow[];
  transferRows: StatementRow[];
  matched: number;
  conversions: number;
  gapOrders: number;
  gapOther: number;
  ppOnly: ExpectedItem[];
  cashOpeningCents: number;
  oldOpeningCents: number;
  securitiesAtOpeningCents: number;
  handover: { day: string; cents: number } | null;
}

const FLOW = new Set(['DEPOSIT', 'REMOVAL', 'TRANSFER_IN', 'TRANSFER_OUT']);

const memoType = (r: StatementRow): PlannedBooking['ppType'] => {
  switch (r.kind) {
    case 'distribution':
      return r.cents >= 0 ? 'DIVIDENDS' : 'TAXES';
    case 'interest':
      return r.cents >= 0 ? 'INTEREST' : 'INTEREST_CHARGE';
    case 'deemed-tax':
    case 'tax-correction':
      return r.cents >= 0 ? 'TAX_REFUND' : 'TAXES';
    default:
      return r.cents >= 0 ? 'FEES_REFUND' : 'FEES';
  }
};

/** Phase 1 (see the module comment). Mutates `prep`; problems go to `problems`. */
export function prepareStatement(
  prep: Prepared,
  model: PpModel,
  t: AccountTarget,
  text: string,
  oldOpeningOnRerun: number | null,
  problems: PpRunProblem[],
): PreparedStatement | null {
  const cfg = t.statement;
  if (!cfg) return null;
  const err = (code: string, message: string) =>
    problems.push({ severity: 'error', code, message, count: 1 });
  let all: StatementRow[];
  try {
    all = parseStatement(cfg.config.format, text);
  } catch (e) {
    if (e instanceof StatementError) {
      err('statement.parse', `${t.name}: line ${e.line}: ${e.message}`);
      return null;
    }
    throw e;
  }
  const rows = all.filter((r) => r.day >= t.openingDate && r.day <= cfg.config.closing.date);
  const depot = prep.resolved.targets.find((x) => x.cashAccountId === t.accountId) ?? t;
  const isinOf = new Map(prep.securities.map((s) => [s.ppUuid, s.isin] as const));

  // What PP gives the cash account: cash of trades (settled between depot and cash account) and
  // interest, fees and taxes without a trade.
  const expected: ExpectedItem[] = [];
  for (const tr of prep.trades) {
    if (tr.accountId !== depot.accountId || tr.date < t.openingDate) continue;
    const net = settlementCents(tr);
    if (net !== 0)
      expected.push({
        date: tr.date,
        cents: net,
        key: tr.importKey,
        isin: isinOf.get(tr.securityPpUuid) ?? null,
        kind: 'trade',
      });
  }
  for (const b of prep.plan.bookings)
    if (
      b.accountId === t.accountId &&
      !b.viaTrade &&
      !FLOW.has(b.ppType) &&
      b.date >= t.openingDate &&
      b.date <= cfg.config.closing.date
    )
      expected.push({
        date: b.date,
        cents: b.amountCents,
        key: b.importKey,
        isin: null,
        kind: 'booking',
      });
  const deliveries: DeliveryItem[] = prep.trades
    .filter((tr) => tr.accountId === depot.accountId && tr.kind === 'delivery_in')
    .map((tr) => ({
      key: tr.importKey,
      date: tr.date,
      isin: isinOf.get(tr.securityPpUuid) ?? null,
      amountCents: tr.amountCents,
    }));
  const plan = planStatementRows(rows, expected, deliveries);

  // PP deliveries that the statement shows as purchases.
  for (const c of plan.conversions) {
    const tr = prep.trades.find((x) => x.importKey === c.key);
    if (tr) {
      tr.kind = 'buy';
      tr.amountCents = c.amountCents;
      tr.feeCents = 0;
      tr.taxCents = 0;
    }
  }

  // Rows PP lacks.
  const oldUuid = `${OLD_PREFIX}${cfg.ppAccountUuid}`;
  const gapTrades: PlannedTrade[] = [];
  const gapBookings: PlannedBooking[] = [];
  let gapOrders = 0;
  let gapOther = 0;
  for (const r of plan.gap) {
    const order = r.kind === 'order-buy' || r.kind === 'order-sell' || r.kind === 'expiry';
    if (order) {
      gapOrders += 1;
      const amount = Math.abs(r.cents);
      const buy = r.kind === 'order-buy';
      // A buy with positive cash or a sale with negative cash is a correction: a fee.
      const sign = buy ? -1 : 1;
      const kind = Math.sign(r.cents) === sign || r.cents === 0 ? (buy ? 'buy' : 'sell') : 'fee';
      gapTrades.push({
        importKey: `stmt:${r.ref}`,
        securityPpUuid: oldUuid,
        accountId: depot.accountId,
        portfolioPpUuid: oldUuid,
        date: r.day,
        kind,
        unitsE8: kind === 'buy' ? oldUnitsE8(amount) : kind === 'sell' ? -oldUnitsE8(amount) : 0,
        amountCents: amount,
        feeCents: 0,
        taxCents: 0,
        currency: 'EUR',
        note: r.info.slice(0, 120),
      });
    } else {
      gapOther += 1;
      gapBookings.push({
        importKey: `stmt:${r.ref}`,
        accountId: t.accountId,
        date: r.day,
        amountCents: r.cents,
        currency: 'EUR',
        ppType: memoType(r),
        securityPpUuid: null,
        note: r.info.slice(0, 120),
        tradeImportKey: null,
        counterpartKey: null,
        viaTrade: false,
        ppAccountUuid: cfg.ppAccountUuid,
      });
    }
  }

  // Opening: the cash from the statement's closing balance, the old holdings from YNAB's total.
  const sum = rows.reduce((a, r) => a + r.cents, 0);
  const cashOpening = cfg.config.closing.cents - sum;
  const positions = ppPositionsAsOf(prep.plan, addDays(t.openingDate, -1)).filter(
    (p) => p.accountId === depot.accountId,
  );
  if (positions.some((p) => p.valueCents === null))
    err('statement.unpriced', `${t.name}: a PP security held on the opening day has no quote`);
  const securitiesAtOpening = positions.reduce((a, p) => a + (p.valueCents ?? 0), 0);
  const ynabTotal = t.openingBalanceCents;
  const old = Math.max(0, oldOpeningOnRerun ?? ynabTotal - cashOpening - securitiesAtOpening);

  let handover: PreparedStatement['handover'] = null;
  if (old > 0 || gapTrades.length > 0) {
    const ppFirst = prep.trades
      .filter((tr) => tr.accountId === depot.accountId && !tr.securityPpUuid.startsWith(OLD_PREFIX))
      .map((tr) => tr.date)
      .sort()[0];
    const lastOrder = gapTrades
      .map((g) => g.date)
      .sort()
      .at(-1);
    const day = lastOrder ?? ppFirst ?? t.openingDate;
    // Simulate the units of the old holdings: never negative.
    let units = old;
    for (const g of [...gapTrades].sort((a, b) => a.date.localeCompare(b.date))) {
      units += g.kind === 'buy' ? g.amountCents : g.kind === 'sell' ? -g.amountCents : 0;
      if (units < 0) {
        err(
          'statement.old_negative',
          `${t.name}: the old holdings would be sold below zero on ${g.date}`,
        );
        break;
      }
    }
    if (old > 0)
      gapTrades.push({
        importKey: `${OLD_PREFIX}open`,
        securityPpUuid: oldUuid,
        accountId: depot.accountId,
        portfolioPpUuid: oldUuid,
        date: t.openingDate,
        kind: 'delivery_in',
        unitsE8: oldUnitsE8(old),
        amountCents: old,
        feeCents: 0,
        taxCents: 0,
        currency: 'EUR',
        note: 'Altbestand vor PP (Stand der Eröffnung)',
      });
    if (units > 0) {
      gapTrades.push({
        importKey: `${OLD_PREFIX}handover`,
        securityPpUuid: oldUuid,
        accountId: depot.accountId,
        portfolioPpUuid: oldUuid,
        date: day,
        kind: 'delivery_out',
        unitsE8: -oldUnitsE8(units),
        amountCents: units,
        feeCents: 0,
        taxCents: 0,
        currency: 'EUR',
        note: 'Übergabe an die Bestände aus PP',
      });
      handover = { day, cents: units };
    }
    if (gapTrades.length > 0) {
      const security: SecurityPlan = {
        ppUuid: oldUuid,
        action: 'create',
        securityId: null,
        matchedBy: null,
        name: `Altbestand ${depot.name} (vor PP)`,
        isin: null,
        kind: 'other',
        currency: 'EUR',
        symbol: null,
        quoteUrl: null,
        coingeckoId: null,
        quoteExchange: null,
        pricesEnabled: false,
        terBp: 0,
        assetClass: null,
      };
      prep.securities.push(security);
      prep.plan.prices.push({
        securityPpUuid: oldUuid,
        date: t.openingDate,
        priceMicro: 1_000_000,
        currency: 'EUR',
        source: 'import',
      });
    }
  }
  prep.trades.push(...gapTrades);
  prep.trades.sort(
    (a, b) => a.date.localeCompare(b.date) || a.importKey.localeCompare(b.importKey),
  );
  prep.plan.bookings.push(...gapBookings);
  prep.openingCash.set(t.accountId, cashOpening);
  prep.openingCheck.push({
    account: t.name,
    ynabOpeningCents: ynabTotal,
    securitiesCents: old + securitiesAtOpening,
    cashOpeningCents: cashOpening,
  });
  void model;
  return {
    account: t.name,
    accountId: t.accountId,
    depotId: depot.accountId,
    bankAccountId: cfg.bankAccountId,
    closingDate: cfg.config.closing.date,
    closingCents: cfg.config.closing.cents,
    openingDate: t.openingDate,
    rows,
    transferRows: rows.filter((r) => r.kind === 'transfer' && r.cents !== 0),
    matched: plan.matched,
    conversions: plan.conversions.length,
    gapOrders,
    gapOther,
    ppOnly: plan.ppOnly,
    cashOpeningCents: cashOpening,
    oldOpeningCents: old,
    securitiesAtOpeningCents: securitiesAtOpening,
    handover,
  };
}

// ---- phase 2: the external transfers ----------------------------------------------------------

export interface StatementTransferReport {
  account: string;
  statementTransfers: number;
  matched: number;
  /** Matched with another day: the app's day was set to the statement's. */
  dateFixed: number;
  /** One YNAB transfer that the statement shows as several: split. */
  split: number;
  /** A bank booking without a transfer became the transfer (a category stays on its budget leg). */
  converted: { date: string; cents: number }[];
  /** Neither side existed: both legs created (changes the bank account's balance). */
  created: { date: string; cents: number }[];
  /** YNAB transfers the statement does not know: removed. */
  removed: { date: string; cents: number }[];
  bank: { beforeCents: number; afterCents: number };
}

interface Leg {
  id: string;
  date: string;
  cents: number;
  transferId: string;
}

export function reconcileStatementTransfers(
  tx: Executor,
  st: PreparedStatement,
  ctx: GroupedContext,
  runId: string,
): StatementTransferReport {
  const report: StatementTransferReport = {
    account: st.account,
    statementTransfers: st.transferRows.length,
    matched: 0,
    dateFixed: 0,
    split: 0,
    converted: [],
    created: [],
    removed: [],
    bank: { beforeCents: 0, afterCents: 0 },
  };
  const balanceOf = () =>
    accountBalances(tx, st.closingDate).find((a) => a.accountId === st.bankAccountId)
      ?.balanceCents ?? 0;
  report.bank.beforeCents = balanceOf();

  const legsOn = (accountId: string): Leg[] =>
    tx
      .select({
        id: booking.id,
        date: booking.date,
        cents: booking.amountCents,
        transferId: booking.transferId,
        key: booking.importKey,
      })
      .from(booking)
      .where(and(eq(booking.accountId, accountId), isNull(booking.deletedAt)))
      .all()
      .filter(
        (b) =>
          b.transferId !== null &&
          b.date >= st.openingDate &&
          !(b.key ?? '').startsWith('pp:') &&
          !(b.key ?? '').startsWith('stmt:'),
      )
      .map((b) => ({ id: b.id, date: b.date, cents: b.cents, transferId: b.transferId as string }));
  const partnerOf = (leg: Leg): Leg | undefined =>
    tx
      .select({ id: booking.id, date: booking.date, cents: booking.amountCents })
      .from(booking)
      .where(and(eq(booking.transferId, leg.transferId), isNull(booking.deletedAt)))
      .all()
      .filter((b) => b.id !== leg.id)
      .map((b) => ({ ...b, transferId: leg.transferId }))[0];

  // Only transfers with the bank account count; anything else on the cash account stays.
  const ynab = legsOn(st.accountId)
    .map((leg) => ({ leg, partner: partnerOf(leg) }))
    .filter((x) => {
      if (!x.partner) return false;
      const row = tx
        .select({ accountId: booking.accountId })
        .from(booking)
        .where(eq(booking.id, x.partner.id))
        .get();
      return row?.accountId === st.bankAccountId;
    });
  const byId = new Map(ynab.map((x) => [x.leg.id, x]));
  const result = matchFlows(
    st.transferRows.map((r): FlowItem => ({ date: r.day, cents: r.cents, ref: r.ref })),
    ynab.map((x): FlowItem => ({ date: x.leg.date, cents: x.leg.cents, ref: x.leg.id })),
    { exactDays: 7, shiftDays: 7, splitDays: 5, roundTripDays: -1, aggregate: false },
  );
  const rowOf = new Map(st.transferRows.map((r) => [r.ref, r]));
  const touched: string[] = [];
  const setDate = (legId: string, partnerId: string, date: string) => {
    for (const id of [legId, partnerId]) {
      updateTracked(tx, booking, [id], { date }, ctx);
      touched.push(id);
    }
  };
  for (const pair of [...result.exactPairs, ...result.dateShifted]) {
    const x = byId.get(pair.app.ref as string)!;
    report.matched += 1;
    if (x.leg.date !== pair.pp.date) {
      setDate(x.leg.id, (x.partner as Leg).id, pair.pp.date);
      report.dateFixed += 1;
    }
  }

  const creates: {
    row: StatementRow;
    copyOf: string | null;
  }[] = [];
  // One YNAB transfer, several statement rows: the first row keeps the transfer.
  for (const g of result.split) {
    if (g.app.length !== 1 || g.pp.length < 2) {
      // Several YNAB transfers for one row: not supported, left as unmatched below.
      for (const f of g.pp) result.ppOnly.push(f);
      for (const f of g.app) result.appOnly.push(f);
      continue;
    }
    const x = byId.get(g.app[0]!.ref as string)!;
    const [first, ...rest] = g.pp.map((f) => rowOf.get(f.ref as string) as StatementRow);
    const f = first as StatementRow;
    updateTracked(tx, booking, [x.leg.id], { amountCents: f.cents, date: f.day }, ctx);
    updateTracked(
      tx,
      booking,
      [(x.partner as Leg).id],
      { amountCents: -f.cents, date: f.day },
      ctx,
    );
    for (const id of [x.leg.id, (x.partner as Leg).id]) {
      const split = tx.select().from(bookingSplit).where(eq(bookingSplit.bookingId, id)).all();
      const cents = id === x.leg.id ? f.cents : -f.cents;
      if (split.length === 1)
        updateTracked(
          tx,
          bookingSplit,
          [(split[0] as { id: string }).id],
          { amountCents: cents },
          ctx,
        );
      touched.push(id);
    }
    for (const r of rest) creates.push({ row: r as StatementRow, copyOf: (x.partner as Leg).id });
    report.split += 1;
    report.matched += 1;
  }

  // Statement rows without a YNAB transfer: a bank booking that only lacks the link, else new.
  const bankRows = tx
    .select({
      id: booking.id,
      date: booking.date,
      cents: booking.amountCents,
      transferId: booking.transferId,
    })
    .from(booking)
    .where(and(eq(booking.accountId, st.bankAccountId), isNull(booking.deletedAt)))
    .all()
    .filter((b) => b.transferId === null);
  const usedBank = new Set<string>();
  const newPairs: { row: StatementRow; bankId: string | null; copyOf: string | null }[] = [];
  for (const f of result.ppOnly) {
    const row = rowOf.get(f.ref as string) as StatementRow;
    const cand = bankRows
      .filter(
        (b) =>
          !usedBank.has(b.id) &&
          b.cents === -row.cents &&
          Math.abs(Date.parse(b.date) - Date.parse(row.day)) <= 7 * 86_400_000,
      )
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.date) - Date.parse(row.day)) -
          Math.abs(Date.parse(b.date) - Date.parse(row.day)),
      )[0];
    if (cand) usedBank.add(cand.id);
    newPairs.push({ row, bankId: cand?.id ?? null, copyOf: null });
  }
  for (const c of creates) newPairs.push({ row: c.row, bankId: null, copyOf: c.copyOf });

  const trs: (typeof transfer.$inferInsert)[] = [];
  const bks: (typeof booking.$inferInsert)[] = [];
  const spl: (typeof bookingSplit.$inferInsert)[] = [];
  const conversions: { id: string; transferId: string; date: string }[] = [];
  for (const p of newPairs) {
    const transferId = randomUUID();
    trs.push({ id: transferId });
    const kId = randomUUID();
    bks.push({
      id: kId,
      accountId: st.accountId,
      date: p.row.day,
      amountCents: p.row.cents,
      memo: 'Überweisung (Plattform-Auszug)',
      transferId,
      source: 'import',
      importKey: `stmt:${p.row.ref}`,
      importRunId: runId,
    });
    spl.push({
      id: randomUUID(),
      bookingId: kId,
      categoryId: null,
      amountCents: p.row.cents,
      sortOrder: 0,
    });
    if (p.bankId) {
      // The bank booking becomes the transfer leg (its category stays), on the statement's day.
      conversions.push({ id: p.bankId, transferId, date: p.row.day });
      touched.push(p.bankId);
      report.converted.push({ date: p.row.day, cents: p.row.cents });
    } else {
      const original = p.copyOf
        ? (tx.select().from(booking).where(eq(booking.id, p.copyOf)).get() ?? null)
        : null;
      const categoryId = p.copyOf
        ? ((
            tx.select().from(bookingSplit).where(eq(bookingSplit.bookingId, p.copyOf)).get() ?? null
          )?.categoryId ?? null)
        : null;
      const bId = randomUUID();
      bks.push({
        id: bId,
        accountId: st.bankAccountId,
        date: p.row.day,
        amountCents: -p.row.cents,
        memo: original?.memo ?? 'Überweisung (Plattform-Auszug)',
        payeeId: original?.payeeId ?? null,
        status: original?.status ?? 'confirmed',
        transferId,
        source: 'import',
        importRunId: runId,
      });
      spl.push({
        id: randomUUID(),
        bookingId: bId,
        categoryId,
        amountCents: -p.row.cents,
        sortOrder: 0,
      });
      if (p.copyOf) report.split += 0;
      else report.created.push({ date: p.row.day, cents: p.row.cents });
    }
  }
  insertRows(tx, transfer, trs);
  for (const c of conversions)
    updateTracked(tx, booking, [c.id], { transferId: c.transferId, date: c.date }, ctx);
  insertManyTracked(tx, booking, bks, ctx);
  insertManyTracked(tx, bookingSplit, spl, ctx);
  touched.push(...bks.map((b) => b.id as string));

  // YNAB transfers the statement does not know.
  for (const f of result.appOnly) {
    const x = byId.get(f.ref as string);
    if (!x) continue;
    deleteBooking(tx, x.leg.id, ctx, { unlockReconciled: true });
    report.removed.push({ date: x.leg.date, cents: x.leg.cents });
  }
  // A removed transfer is gone with both legs; only live bookings are checked.
  assertLedgerInvariants(tx, touched, false);
  report.bank.afterCents = balanceOf();
  return report;
}

/** The cash account's balance on the statement's closing day against the statement's figure. */
export function statementCheck(
  tx: Executor,
  st: PreparedStatement,
): { balanceCents: number; closingCents: number; diffCents: number } {
  const balance =
    accountBalances(tx, st.closingDate).find((a) => a.accountId === st.accountId)?.balanceCents ??
    0;
  return {
    balanceCents: balance,
    closingCents: st.closingCents,
    diffCents: balance - st.closingCents,
  };
}
