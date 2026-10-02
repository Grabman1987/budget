import {
  account,
  accountBalances,
  auditLog,
  assertLedgerInvariants,
  booking,
  bookingSplit,
  createAssetClass,
  createEntity,
  transfer,
  createSecurity,
  createTradesBulk,
  deleteBooking,
  holding,
  importPriceChange,
  importRun,
  INCOME_TYPES,
  insertManyTracked,
  insertRows,
  listAssetClasses,
  price,
  priceAudit,
  runInTransaction,
  security,
  SYSTEM_PAYEE_IDS,
  trade,
  undo,
  updateTracked,
  type Executor,
  type GroupedContext,
  type TradeInput,
} from '@budget/db';
import {
  mapToTarget,
  normalizeTrade,
  planSecurities,
  ppCash,
  ppPositionsAsOf,
  resolveMigration,
  skippedButTraded,
  type ImportPlan,
  type PlannedTrade,
  type PpMigration,
  type PpModel,
  type PpSecurity,
  type ResolvedMigration,
  type SecurityPlan,
} from '@budget/import-pp';
import { addDays, settlementCents } from '@budget/domain';
import { and, asc, eq, gt, inArray, isNotNull, isNull, like, ne, or, sql } from 'drizzle-orm';
import { deriveCoingeckoId } from '@budget/market';
import { randomUUID } from 'node:crypto';
import { ImportStateError } from './commit';

/**
 * The target layer of a one-time Portfolio Performance run (`docs/ops.md` §13,
 * `docs/migration/pp-export.md`): securities, prices, trades with their settlement bookings and
 * the cash items YNAB cannot know, in one transaction under the audit group `import:<run id>`, so
 * `undo` reverts the run as a whole. Prices are market data outside the audit log; the run's own
 * record of them (`import_price_change`) reverts them. Idempotent: trades and bookings carry the
 * key `pp:<uuid>`, a second run of the same or a newer file adds what is new and reports what
 * changed. The dry run is the same write in a transaction that is rolled back.
 */

export const ppGroup = (runId: string): string => `import:${runId}`;

export type PpSeverity = 'error' | 'warning';
export interface PpRunProblem {
  severity: PpSeverity;
  code: string;
  message: string;
  count: number;
}

/** Problems that make a commit unsafe: a skipped or unreadable transaction changes the numbers. */
const BLOCKING = new Set([
  'missing-uuid',
  'duplicate-uuid',
  'unknown-type',
  'negative-amount',
  'transaction-invalid',
  'reference-unresolved',
  'trade-no-security',
  'trade-no-units',
]);

export interface Prepared {
  resolved: ResolvedMigration;
  securities: SecurityPlan[];
  plan: ImportPlan;
  /** Trades fitted to the ledger's rules, oldest first. */
  trades: PlannedTrade[];
  /** The new opening balance per app account: PP's cash before the opening day, or the number set. */
  openingCash: Map<string, number>;
  /** Split platforms: YNAB's opening total, PP's securities that day and the cash opening that follows. */
  openingCheck: {
    account: string;
    ynabOpeningCents: number;
    securitiesCents: number;
    cashOpeningCents: number;
  }[];
  /** Adjustments made by `normalizeTrade`, by code. */
  notes: Record<string, number>;
  problems: PpRunProblem[];
}

/**
 * CoinGecko id of a crypto security without PP's own `COINGECKOCOINID` (that one always wins in
 * `planSecurities`): derived from the ticker, else the cryptocalc link, else the name
 * (`deriveCoingeckoId`). Unresolved coins (leveraged indices, BEST) keep their cryptocalc link.
 */
export function coinIdOf(s: PpSecurity): string | null {
  if (s.isin !== null) return null;
  const r = deriveCoingeckoId({
    ...(s.tickerSymbol ? { symbol: s.tickerSymbol } : {}),
    name: s.name,
    ...(s.feedUrl ? { quoteUrl: s.feedUrl } : {}),
  });
  return r.status === 'resolved' ? r.id : null;
}

const addProblem = (
  list: PpRunProblem[],
  severity: PpSeverity,
  code: string,
  message: string,
  count = 1,
): void => {
  const found = list.find((p) => p.severity === severity && p.code === code);
  if (found) found.count += count;
  else list.push({ severity, code, message, count });
};

/** Read-only: resolve the mapping against the app, plan the rows, check what a commit would refuse. */
export function preparePp(
  db: Executor,
  model: PpModel,
  doc: PpMigration,
  resolveCoin: (security: PpSecurity) => string | null = coinIdOf,
): Prepared {
  const problems: PpRunProblem[] = [];
  const apps = db
    .select({
      id: account.id,
      name: account.name,
      role: account.role,
      currency: account.currency,
      openingDate: account.openingDate,
      openingBalanceCents: account.openingBalanceCents,
      referenceAccountId: account.referenceAccountId,
    })
    .from(account)
    .where(isNull(account.deletedAt))
    .all();
  const resolved = resolveMigration(model, doc, apps);
  for (const p of resolved.problems) addProblem(problems, p.severity, p.code, p.message);

  const existing = db
    .select({
      id: security.id,
      name: security.name,
      isin: security.isin,
      symbol: security.symbol,
      currency: security.currency,
    })
    .from(security)
    .where(isNull(security.deletedAt))
    .all();
  const planned = planSecurities(model, doc, existing, resolveCoin);
  for (const p of planned.problems) addProblem(problems, p.severity, p.code, p.message);

  const plan = mapToTarget(model, resolved.mapping);
  for (const p of plan.problems) {
    // Accounts and portfolios the document does not mention are the resolver's business.
    if (p.code === 'unmapped-account' || p.code === 'unmapped-portfolio') continue;
    addProblem(
      problems,
      BLOCKING.has(p.code) ? 'error' : 'warning',
      p.code,
      p.message,
      Math.max(1, p.count),
    );
  }
  const bad = skippedButTraded(plan, planned.securities);
  if (bad.length > 0)
    addProblem(
      problems,
      'error',
      'security.skipped_but_traded',
      'A skipped security has trades; map it or skip its trades',
      bad.length,
    );

  const notes: Record<string, number> = {};
  const trades: PlannedTrade[] = [];
  const skip = new Set(planned.securities.filter((s) => s.action === 'skip').map((s) => s.ppUuid));
  for (const t of plan.trades) {
    if (skip.has(t.securityPpUuid)) continue;
    const n = normalizeTrade(t);
    for (const note of n.notes) notes[note] = (notes[note] ?? 0) + 1;
    if (n.error) addProblem(problems, 'error', 'trade.rule', `A trade breaks a rule: ${n.error}`);
    trades.push(n.trade);
  }
  trades.sort((a, b) => a.date.localeCompare(b.date) || a.importKey.localeCompare(b.importKey));

  const openingCash = new Map<string, number>();
  const openingCheck: Prepared['openingCheck'] = [];
  for (const t of resolved.targets) {
    if (t.openingBalance === 'pp')
      openingCash.set(t.accountId, ppCash(model, t.ppAccountUuids, t.openingDate, false));
    else if (typeof t.openingBalance === 'number') openingCash.set(t.accountId, t.openingBalance);
    else if (t.openingBalance === 'total') {
      // Cash plus securities equal YNAB's total on the opening day (only when the split is new:
      // a finished split already carries its opening balance).
      const sp = resolved.splits.find((p) => p.cashAccountId === t.accountId);
      if (sp?.state !== 'new') continue;
      const positions = ppPositionsAsOf(plan, addDays(t.openingDate, -1), skip).filter(
        (p) => p.accountId === sp.depotAccountId,
      );
      if (positions.some((p) => p.valueCents === null)) {
        addProblem(
          problems,
          'error',
          'opening.unpriced',
          `A security held on the opening day of "${t.name}" has no quote`,
        );
        continue;
      }
      const securities = positions.reduce((a, p) => a + (p.valueCents ?? 0), 0);
      const cash = t.openingBalanceCents - securities;
      openingCash.set(t.accountId, cash);
      openingCheck.push({
        account: t.name,
        ynabOpeningCents: t.openingBalanceCents,
        securitiesCents: securities,
        cashOpeningCents: cash,
      });
    }
  }
  return {
    resolved,
    securities: planned.securities,
    plan,
    trades,
    openingCash,
    openingCheck,
    notes,
    problems,
  };
}

export const hasErrors = (problems: ReadonlyArray<PpRunProblem>): boolean =>
  problems.some((p) => p.severity === 'error');

export interface PpChangeReport {
  securities: {
    created: number;
    matched: number;
    skipped: number;
    /** Live sources the created securities got from PP's feeds. */
    sources: { quoteUrl: number; coingeckoId: number; symbol: number };
    /** Created securities without any live source (names of public securities). */
    noSource: string[];
  };
  assetClasses: { created: number };
  prices: { inserted: number; replaced: number; unchanged: number; manualKept: number };
  trades: {
    added: number;
    unchanged: number;
    /** Same key, other figures: left alone (the owner decides). */
    changed: number;
    /** Written by an earlier run, not in this file: left alone. */
    missing: number;
    deletedByOwner: number;
  };
  bookings: {
    added: number;
    unchanged: number;
    /** PP deposits/removals/transfers: YNAB has them (`cashFlows: ynab`), only compared. */
    ynabFlows: number;
    /** Cash legs of trades: the trade's settlement booking carries them. */
    tradeLegs: number;
    /** Dated before the account's opening day: the opening balance subsumes them. */
    beforeOpening: number;
  };
  /** Platforms split into a cash account and a securities account, and transfers between them. */
  splits: { cash: string; depot: string; renamedFrom: string; state: 'new' | 'done' }[];
  transfers: { added: number };
  openingCheck: Prepared['openingCheck'];
  /** Reconciliation bookings that make a platform's cash equal its statement (what YNAB missed). */
  corrections: {
    account: string;
    date: string;
    targetCents: number;
    beforeCents: number;
    correctionCents: number;
    as: 'flow' | 'result';
  }[];
  accounts: {
    account: string;
    openingFromCents: number;
    openingToCents: number;
    adjustmentsRetired: number;
    adjustmentsRetiredCents: number;
  }[];
  /** Adjustments `normalizeTrade` made, by code. */
  notes: Record<string, number>;
}

export interface PpIdMap {
  /** PP security uuid -> app security id (only the securities the run handles). */
  securities: Record<string, string>;
}

/** Replace the placeholder ids of securities accounts the run creates by their real ids. */
function remapAccounts(prep: Prepared, real: ReadonlyMap<string, string>): void {
  if (real.size === 0) return;
  const r = (id: string) => real.get(id) ?? id;
  const rn = (id: string | null) => (id === null ? null : r(id));
  for (const t of prep.resolved.targets) {
    t.accountId = r(t.accountId);
    t.referenceAccountId = rn(t.referenceAccountId);
    t.cashAccountId = rn(t.cashAccountId);
  }
  for (const sp of prep.resolved.splits) sp.depotAccountId = r(sp.depotAccountId);
  for (const m of [prep.resolved.mapping.portfolios, prep.resolved.mapping.accounts])
    for (const v of Object.values(m)) if (v !== 'ignore') v.accountId = r(v.accountId);
  for (const t of [...prep.plan.trades, ...prep.trades]) t.accountId = r(t.accountId);
  for (const b of prep.plan.bookings) b.accountId = r(b.accountId);
  for (const a of prep.plan.investmentAccounts) a.accountId = r(a.accountId);
  for (const [k, v] of [...prep.openingCash]) {
    prep.openingCash.delete(k);
    prep.openingCash.set(r(k), v);
  }
}

export interface PpWriteResult {
  report: PpChangeReport;
  ids: PpIdMap;
}

const MEMO: Record<string, string> = {
  DEPOSIT: 'Einzahlung',
  REMOVAL: 'Auszahlung',
  INTEREST: 'Zinsen',
  INTEREST_CHARGE: 'Sollzinsen',
  DIVIDENDS: 'Dividende',
  FEES: 'Gebühren',
  FEES_REFUND: 'Gebührenerstattung',
  TAXES: 'Steuern',
  TAX_REFUND: 'Steuererstattung',
  BUY: 'Kauf',
  SELL: 'Verkauf',
  TRANSFER_IN: 'Übertrag ein',
  TRANSFER_OUT: 'Übertrag aus',
};
const FLOW_TYPES = new Set(['DEPOSIT', 'REMOVAL', 'TRANSFER_IN', 'TRANSFER_OUT']);
const PP_KEY = 'pp:%';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** `PP_TRACE=1` prints the seconds each phase of a run took (operator diagnostics, no data). */
export function tracer(): (phase: string) => void {
  if (!process.env['PP_TRACE']) return () => undefined;
  let last = Date.now();
  return (phase) => {
    const now = Date.now();
    console.error(`pp-trace ${phase.padEnd(10)} ${((now - last) / 1000).toFixed(1)} s`);
    last = now;
  };
}

/** Write a prepared run (see the module comment). Runs inside the caller's transaction. */
export function writePp(
  tx: Executor,
  prep: Prepared,
  input: { runId: string; actor: string },
): PpWriteResult {
  const ctx: GroupedContext = { actor: input.actor, groupId: ppGroup(input.runId) };
  const trace = tracer();
  const report: PpChangeReport = {
    securities: {
      created: 0,
      matched: 0,
      skipped: 0,
      sources: { quoteUrl: 0, coingeckoId: 0, symbol: 0 },
      noSource: [],
    },
    assetClasses: { created: 0 },
    prices: { inserted: 0, replaced: 0, unchanged: 0, manualKept: 0 },
    trades: { added: 0, unchanged: 0, changed: 0, missing: 0, deletedByOwner: 0 },
    bookings: { added: 0, unchanged: 0, ynabFlows: 0, tradeLegs: 0, beforeOpening: 0 },
    splits: [],
    transfers: { added: 0 },
    openingCheck: prep.openingCheck,
    corrections: [],
    accounts: [],
    notes: prep.notes,
  };

  // Platforms like PP: the YNAB account becomes the cash account, a securities account is new.
  const real = new Map<string, string>();
  for (const sp of prep.resolved.splits) {
    report.splits.push({
      cash: sp.cashName,
      depot: sp.depotName,
      renamedFrom: sp.previousName,
      state: sp.state,
    });
    if (sp.state === 'done') continue;
    const old = tx.select().from(account).where(eq(account.id, sp.cashAccountId)).get();
    if (!old) throw new Error('The account to split disappeared');
    updateTracked(tx, account, [old.id], { name: sp.cashName, type: 'checking' }, ctx);
    const created = createEntity(
      tx,
      account,
      {
        id: randomUUID(),
        name: sp.depotName,
        type: old.type,
        role: 'investment',
        onBudget: false,
        institutionId: old.institutionId,
        currency: old.currency,
        openingBalanceCents: 0,
        openingDate: old.openingDate,
        referenceAccountId: old.id,
        sortOrder: old.sortOrder,
        closedAt: old.closedAt,
      },
      ctx,
    );
    real.set(sp.depotAccountId, created.id);
  }
  remapAccounts(prep, real);
  // Verrechnungskonto of the other depots (no split): only the link.
  const current = new Map(
    tx
      .select({ id: account.id, ref: account.referenceAccountId })
      .from(account)
      .all()
      .map((a) => [a.id, a.ref]),
  );
  for (const t of prep.resolved.targets)
    if (t.referenceAccountId !== null && current.get(t.accountId) !== t.referenceAccountId)
      updateTracked(tx, account, [t.accountId], { referenceAccountId: t.referenceAccountId }, ctx);

  // Asset classes by name (created when missing).
  const classes = new Map(listAssetClasses(tx).map((c) => [norm(c.name), c.id]));
  const wanted = [
    ...new Set(
      prep.securities.flatMap((s) => (s.action !== 'skip' && s.assetClass ? [s.assetClass] : [])),
    ),
  ].sort();
  for (const name of wanted) {
    if (classes.has(norm(name))) continue;
    const row = createAssetClass(tx, { name, sortOrder: classes.size }, ctx);
    classes.set(norm(name), row.id);
    report.assetClasses.created += 1;
  }

  // Securities: matched ones are used as they are, the others are created.
  const ids: PpIdMap = { securities: {} };
  for (const s of prep.securities) {
    if (s.action === 'skip') {
      report.securities.skipped += 1;
      continue;
    }
    if (s.action === 'match') {
      ids.securities[s.ppUuid] = s.securityId as string;
      report.securities.matched += 1;
      continue;
    }
    const row = createSecurity(
      tx,
      {
        id: randomUUID(),
        name: s.name,
        kind: s.kind,
        symbol: s.symbol,
        isin: s.isin,
        currency: s.currency,
        terBp: s.terBp,
        assetClassId: s.assetClass ? (classes.get(norm(s.assetClass)) ?? null) : null,
        quoteUrl: s.quoteUrl,
        coingeckoId: s.coingeckoId,
        quoteExchange: s.quoteExchange,
        pricesEnabled: s.pricesEnabled,
      },
      ctx,
    );
    ids.securities[s.ppUuid] = row.id;
    report.securities.created += 1;
    if (s.quoteUrl) report.securities.sources.quoteUrl += 1;
    if (s.coingeckoId) report.securities.sources.coingeckoId += 1;
    if (s.symbol) report.securities.sources.symbol += 1;
    if (!s.quoteUrl && !s.coingeckoId && !s.symbol) report.securities.noSource.push(s.name);
  }

  trace('classes+sec');
  // Prices: the whole history. A manual price wins, an identical imported one stays, everything
  // else is inserted or replaced, and the run remembers what it changed (`import_price_change`).
  const pricesOf = new Map<string, ImportPlan['prices']>();
  for (const p of prep.plan.prices) {
    const list = pricesOf.get(p.securityPpUuid) ?? [];
    list.push(p);
    pricesOf.set(p.securityPpUuid, list);
  }
  for (const [ppUuid, list] of pricesOf) {
    const securityId = ids.securities[ppUuid];
    if (securityId === undefined) continue;
    const stored = new Map(
      tx
        .select()
        .from(price)
        .where(eq(price.securityId, securityId))
        .all()
        .map((r) => [r.date, r]),
    );
    const inserts: (typeof price.$inferInsert)[] = [];
    const changes: (typeof importPriceChange.$inferInsert)[] = [];
    for (const p of list) {
      const old = stored.get(p.date);
      if (old === undefined) {
        inserts.push({
          securityId,
          date: p.date,
          priceMicro: p.priceMicro,
          currency: p.currency,
          source: 'import',
        });
        changes.push({ importRunId: input.runId, securityId, date: p.date });
        continue;
      }
      if (old.source === 'manual') {
        report.prices.manualKept += 1;
        continue;
      }
      if (
        old.source === 'import' &&
        old.priceMicro === p.priceMicro &&
        old.currency === p.currency
      ) {
        report.prices.unchanged += 1;
        continue;
      }
      changes.push({
        importRunId: input.runId,
        securityId,
        date: p.date,
        oldPriceMicro: old.priceMicro,
        oldCurrency: old.currency,
        oldSource: old.source,
      });
      tx.update(price)
        .set({ priceMicro: p.priceMicro, currency: p.currency, source: 'import' })
        .where(and(eq(price.securityId, securityId), eq(price.date, p.date)))
        .run();
      tx.insert(priceAudit)
        .values({
          id: randomUUID(),
          securityId,
          date: p.date,
          oldPriceMicro: old.priceMicro,
          newPriceMicro: p.priceMicro,
          oldSource: old.source,
          newSource: 'import',
        })
        .run();
      report.prices.replaced += 1;
    }
    insertRows(tx, price, inserts);
    insertRows(tx, importPriceChange, changes);
    report.prices.inserted += inserts.length;
  }

  trace('prices');
  // Accounts: the value estimates of YNAB stop counting (opening balance and adjustments).
  const adjustmentPayees = [
    SYSTEM_PAYEE_IDS.reconciliation_adjustment.id,
    SYSTEM_PAYEE_IDS.manual_adjustment.id,
  ];
  for (const t of prep.resolved.targets) {
    const line: PpChangeReport['accounts'][number] = {
      account: t.name,
      openingFromCents: t.openingBalanceCents,
      openingToCents: t.openingBalanceCents,
      adjustmentsRetired: 0,
      adjustmentsRetiredCents: 0,
    };
    const cents = prep.openingCash.get(t.accountId);
    if (cents !== undefined) {
      line.openingToCents = cents;
      if (cents !== t.openingBalanceCents)
        updateTracked(tx, account, [t.accountId], { openingBalanceCents: cents }, ctx);
    }
    if (t.retireYnabValue) {
      const rows = tx
        .select({ id: booking.id, cents: booking.amountCents })
        .from(booking)
        .where(
          and(
            eq(booking.accountId, t.accountId),
            isNull(booking.deletedAt),
            isNull(booking.transferId),
            eq(booking.source, 'migration'),
            inArray(booking.payeeId, adjustmentPayees),
          ),
        )
        .all();
      for (const r of rows) deleteBooking(tx, r.id, ctx, { unlockReconciled: true });
      line.adjustmentsRetired = rows.length;
      line.adjustmentsRetiredCents = rows.reduce((a, r) => a + r.cents, 0);
    }
    report.accounts.push(line);
  }

  trace('accounts');
  // Trades (with their settlement bookings), oldest first.
  const mapped = new Set(prep.resolved.targets.map((t) => t.accountId));
  const known = new Map(
    tx
      .select()
      .from(trade)
      .where(like(trade.importKey, PP_KEY))
      .all()
      .map((r) => [`${r.accountId}|${r.importKey}`, r]),
  );
  const planned = new Set(prep.trades.map((t) => `${t.accountId}|${t.importKey}`));
  const fresh: TradeInput[] = [];
  for (const t of prep.trades) {
    const securityId = ids.securities[t.securityPpUuid] as string;
    const found = known.get(`${t.accountId}|${t.importKey}`);
    if (found) {
      if (found.deletedAt !== null) report.trades.deletedByOwner += 1;
      else if (
        found.securityId !== securityId ||
        found.date !== t.date ||
        found.kind !== t.kind ||
        found.unitsE8 !== t.unitsE8 ||
        found.amountCents !== t.amountCents ||
        found.feeCents !== t.feeCents ||
        found.taxCents !== t.taxCents
      )
        report.trades.changed += 1;
      else report.trades.unchanged += 1;
      continue;
    }
    fresh.push({
      securityId,
      accountId: t.accountId,
      date: t.date,
      kind: t.kind,
      unitsE8: t.unitsE8,
      amountCents: t.amountCents,
      feeCents: t.feeCents,
      taxCents: t.taxCents,
      importKey: t.importKey,
      note: t.note,
      source: 'import',
      importRunId: input.runId,
    });
  }
  createTradesBulk(tx, fresh, ctx);
  report.trades.added += fresh.length;
  // Where a platform is split, the cash of a trade moves between its cash account and the
  // securities account by a transfer, so the securities account stays at 0 cash.
  const cashOf = new Map(
    prep.resolved.targets.flatMap((t) => (t.cashAccountId ? [[t.accountId, t.cashAccountId]] : [])),
  );
  const legTransfers: (typeof transfer.$inferInsert)[] = [];
  const legBookings: (typeof booking.$inferInsert)[] = [];
  const legSplits: (typeof bookingSplit.$inferInsert)[] = [];
  for (const t of fresh) {
    const cashId = cashOf.get(t.accountId);
    if (cashId === undefined) continue;
    const net = settlementCents({
      kind: t.kind,
      amountCents: t.amountCents,
      feeCents: t.feeCents ?? 0,
      taxCents: t.taxCents ?? 0,
    });
    if (net === 0) continue;
    // The cash account gets the trade's settlement (a buy leaves it), the securities account the
    // opposite, which cancels the settlement booking there.
    const transferId = randomUUID();
    legTransfers.push({ id: transferId });
    for (const [accountId, cents] of [
      [cashId, net],
      [t.accountId, -net],
    ] as const) {
      const id = randomUUID();
      legBookings.push({
        id,
        accountId,
        date: t.date,
        amountCents: cents,
        memo: 'Verrechnung',
        transferId,
        source: 'import',
        importKey: `${t.importKey}:cash`,
        importRunId: input.runId,
      });
      legSplits.push({
        id: randomUUID(),
        bookingId: id,
        categoryId: null,
        amountCents: cents,
        sortOrder: 0,
      });
    }
  }
  insertRows(tx, transfer, legTransfers);
  insertManyTracked(tx, booking, legBookings, ctx);
  insertManyTracked(tx, bookingSplit, legSplits, ctx);
  assertLedgerInvariants(
    tx,
    legBookings.map((r) => r.id as string),
    false,
  );
  report.transfers.added = legTransfers.length;
  trace('trades');
  for (const [key, row] of known)
    if (mapped.has(row.accountId) && row.deletedAt === null && !planned.has(key))
      report.trades.missing += 1;

  // Cash items YNAB cannot know (interest, fees, taxes, refunds) and, where chosen, PP's deposits.
  const targetOf = new Map(prep.resolved.targets.map((t) => [t.accountId, t]));
  const knownBookings = new Set(
    tx
      .select({ accountId: booking.accountId, key: booking.importKey })
      .from(booking)
      .where(like(booking.importKey, PP_KEY))
      .all()
      .map((r) => `${r.accountId}|${r.key}`),
  );
  const bookingRows: (typeof booking.$inferInsert)[] = [];
  const splitRows: (typeof bookingSplit.$inferInsert)[] = [];
  for (const b of prep.plan.bookings) {
    const target = targetOf.get(b.accountId);
    if (!target) continue;
    if (b.viaTrade) {
      report.bookings.tradeLegs += 1;
      continue;
    }
    const flow = FLOW_TYPES.has(b.ppType);
    if (flow && target.cashFlows === 'ynab') {
      report.bookings.ynabFlows += 1;
      continue;
    }
    if (b.date < target.openingDate) {
      report.bookings.beforeOpening += 1;
      continue;
    }
    if (knownBookings.has(`${b.accountId}|${b.importKey}`)) {
      report.bookings.unchanged += 1;
      continue;
    }
    // Interest, fees and taxes are performance (Kapitalerträge, also when negative); deposits and
    // removals, and a cash leg without a trade, are money crossing the depot's boundary.
    const performance = !flow && b.ppType !== 'BUY' && b.ppType !== 'SELL';
    const id = randomUUID();
    bookingRows.push({
      id,
      accountId: b.accountId,
      date: b.date,
      amountCents: b.amountCents,
      memo: b.note ? `${MEMO[b.ppType]}: ${b.note}` : (MEMO[b.ppType] ?? null),
      source: 'import',
      importKey: b.importKey,
      importRunId: input.runId,
    });
    splitRows.push({
      id: randomUUID(),
      bookingId: id,
      categoryId: null,
      amountCents: b.amountCents,
      incomeTypeId: performance ? INCOME_TYPES.capital.id : null,
      sortOrder: 0,
    });
    report.bookings.added += 1;
  }
  insertManyTracked(tx, booking, bookingRows, ctx);
  insertManyTracked(tx, bookingSplit, splitRows, ctx);
  assertLedgerInvariants(
    tx,
    bookingRows.map((r) => r.id as string),
    false,
  );
  trace('bookings');

  // Real cash of the platforms: one reconciliation booking per account whose balance on the
  // statement day differs (what YNAB's flows missed). Re-runs replace an earlier one of the run's
  // key family with the amount that is needed now.
  const reconRows: (typeof booking.$inferInsert)[] = [];
  const reconSplits: (typeof bookingSplit.$inferInsert)[] = [];
  for (const t of prep.resolved.targets) {
    const target = t.cashTarget;
    if (!target) continue;
    const balances = new Map(
      accountBalances(tx, target.date).map((b) => [b.accountId, b.balanceCents]),
    );
    const prefix = `pp:cash-target:${t.accountId}:${target.date}`;
    const earlier = tx
      .select({
        id: booking.id,
        cents: booking.amountCents,
        key: booking.importKey,
        deleted: booking.deletedAt,
      })
      .from(booking)
      .where(and(eq(booking.accountId, t.accountId), like(booking.importKey, `${prefix}%`)))
      .all();
    const live = earlier.filter((e) => e.deleted === null);
    const own = (balances.get(t.accountId) ?? 0) - live.reduce((a, e) => a + e.cents, 0);
    const others = target.minusIds.reduce((a, id) => a + (balances.get(id) ?? 0), 0);
    const want = target.cents - others;
    const needed = want - own;
    const before = balances.get(t.accountId) ?? 0;
    if (live.length > 0 && live.reduce((a, e) => a + e.cents, 0) === needed) {
      report.corrections.push({
        account: t.name,
        date: target.date,
        targetCents: want,
        beforeCents: before,
        correctionCents: needed,
        as: target.as,
      });
      continue;
    }
    for (const e of live) deleteBooking(tx, e.id, ctx, { unlockReconciled: true });
    report.corrections.push({
      account: t.name,
      date: target.date,
      targetCents: want,
      beforeCents: own,
      correctionCents: needed,
      as: target.as,
    });
    if (needed === 0) continue;
    const id = randomUUID();
    reconRows.push({
      id,
      accountId: t.accountId,
      date: target.date,
      amountCents: needed,
      payeeId: SYSTEM_PAYEE_IDS.reconciliation_adjustment.id,
      memo: 'Abgleich mit Plattform-Saldo',
      source: 'import',
      importKey: `${prefix}:${earlier.length + 1}`,
      importRunId: input.runId,
    });
    reconSplits.push({
      id: randomUUID(),
      bookingId: id,
      categoryId: null,
      amountCents: needed,
      incomeTypeId: target.as === 'result' ? INCOME_TYPES.capital.id : null,
      sortOrder: 0,
    });
  }
  insertManyTracked(tx, booking, reconRows, ctx);
  insertManyTracked(tx, bookingSplit, reconSplits, ctx);
  assertLedgerInvariants(
    tx,
    reconRows.map((r) => r.id as string),
    false,
  );
  trace('corrections');
  return { report, ids };
}

class Rollback extends Error {
  constructor(readonly result: unknown) {
    super('dry run');
  }
}

/** Run `fn` in a transaction that is rolled back: the result of what a commit would do. */
export function inRollback<T>(db: Executor, fn: (tx: Executor) => T): T {
  try {
    runInTransaction(db, (tx) => {
      throw new Rollback(fn(tx));
    });
  } catch (error) {
    if (error instanceof Rollback) return error.result as T;
    throw error;
  }
  throw new Error('unreachable');
}

// ---- revert ---------------------------------------------------------------------------------

/**
 * Trades, holdings or bookings someone added after the run to securities or accounts the run
 * created would stay live on deleted ones, so the revert is refused until they were moved.
 */
function assertNotInUse(tx: Executor, runId: string): void {
  const created = (entityType: string) =>
    tx
      .select({ id: auditLog.entityId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.groupId, ppGroup(runId)),
          eq(auditLog.action, 'create'),
          eq(auditLog.entityType, entityType),
          isNull(auditLog.undoOfId),
        ),
      )
      .all()
      .map((r) => r.id);
  // Bookings added later to a securities account the run created.
  const accounts = created('account');
  if (accounts.length > 0) {
    const foreign = tx
      .select({ id: booking.id })
      .from(booking)
      .where(
        and(
          inArray(booking.accountId, accounts),
          isNull(booking.deletedAt),
          or(isNull(booking.importRunId), ne(booking.importRunId, runId)),
        ),
      )
      .get();
    if (foreign)
      throw new ImportStateError(
        'in_use',
        'Bookings added after the import use the securities account it created',
      );
  }
  const securities = created('security');
  if (securities.length === 0) return;
  const ownTrades = new Set(created('trade'));
  const foreignTrade = tx
    .select({ id: trade.id })
    .from(trade)
    .where(and(inArray(trade.securityId, securities), isNull(trade.deletedAt)))
    .all()
    .some((r) => !ownTrades.has(r.id));
  const snapshot = tx
    .select({ id: holding.id })
    .from(holding)
    .where(and(inArray(holding.securityId, securities), isNull(holding.deletedAt)))
    .get();
  if (foreignTrade || snapshot)
    throw new ImportStateError(
      'in_use',
      'Trades or holdings added after the import use its securities',
    );
}

/**
 * Revert a committed PP run as a whole: `undo` of its audit group (refused when something it wrote
 * was changed later, unless `force`), the price changes of the run, then the keys of its trades
 * and bookings are retired so the same file can be committed again. Only the newest committed run
 * can be reverted.
 */
export function revertPp(
  db: Executor,
  runId: string,
  actor: string,
  options: { force?: boolean } = {},
): void {
  runInTransaction(db, (tx) => {
    const run = tx.select().from(importRun).where(eq(importRun.id, runId)).get();
    if (!run || run.status !== 'committed')
      throw new ImportStateError('not_committed', 'Only a committed run can be reverted');
    const newer = tx
      .select({ id: importRun.id })
      .from(importRun)
      .where(
        and(
          eq(importRun.status, 'committed'),
          ne(importRun.id, runId),
          gt(importRun.committedAt, run.committedAt ?? ''),
        ),
      )
      .get();
    if (newer) throw new ImportStateError('newer_run', 'Revert the newer import run first');
    assertNotInUse(tx, runId);
    const written = tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.groupId, ppGroup(runId)))
      .get();
    const tradeIds = tx
      .select({ id: auditLog.entityId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.groupId, ppGroup(runId)),
          eq(auditLog.action, 'create'),
          eq(auditLog.entityType, 'trade'),
        ),
      )
      .all()
      .map((r) => r.id);
    if (written) undo(tx, { groupId: ppGroup(runId) }, { actor }, options);

    // Prices: delete what the run inserted, restore what it replaced.
    const changes = tx
      .select()
      .from(importPriceChange)
      .where(eq(importPriceChange.importRunId, runId))
      .orderBy(asc(importPriceChange.securityId), asc(importPriceChange.date))
      .all();
    for (const c of changes) {
      const where = and(eq(price.securityId, c.securityId), eq(price.date, c.date));
      if (c.oldPriceMicro === null) tx.delete(price).where(where).run();
      else
        tx.update(price)
          .set({
            priceMicro: c.oldPriceMicro,
            currency: c.oldCurrency ?? 'EUR',
            source: (c.oldSource ?? 'yfinance') as typeof price.$inferInsert.source,
          })
          .where(where)
          .run();
    }
    tx.delete(importPriceChange).where(eq(importPriceChange.importRunId, runId)).run();

    // Retire the keys so the same file can be committed again (bookkeeping of the run: the rows
    // stay deleted).
    const tag = `~reverted:${runId}`;
    if (tradeIds.length > 0)
      tx.update(trade)
        .set({ importKey: sql`${trade.importKey} || ${tag}` })
        .where(and(inArray(trade.id, tradeIds), isNotNull(trade.importKey)))
        .run();
    tx.update(booking)
      .set({ importKey: sql`${booking.importKey} || ${tag}` })
      .where(
        and(
          eq(booking.importRunId, runId),
          isNotNull(booking.deletedAt),
          isNotNull(booking.importKey),
        ),
      )
      .run();
    tx.update(importRun)
      .set({ status: 'reverted', revertedAt: new Date().toISOString() })
      .where(eq(importRun.id, runId))
      .run();
  });
}
