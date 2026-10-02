import { z } from 'zod';
import { statementConfigSchema, type StatementConfig } from './statement';
import {
  dailyValuation,
  eachDay,
  marketValueEurCents,
  type CashFlow,
  type DatedPrice,
  type PositionInput,
  type RateTable,
  type Valuation,
} from '@budget/domain';
import {
  SECURITY_KINDS,
  SIGN,
  type ImportPlan,
  type PlannedTrade,
  type PpMapping,
  type SecurityKind,
} from './mapping';
import type { PpModel, PpSecurity } from './model';

/**
 * The one-time Portfolio Performance migration (`docs/ops.md` §13): the owner's private mapping
 * document, how it resolves against the app's accounts and securities, the rules that keep the
 * import from counting money twice, and the PP side of the Gate 3 report (what PP itself says
 * about holdings, cash and returns, recomputed from the file). Everything here is pure; the
 * operator CLI writes the result (`apps/server/src/imports/pp-*.ts`).
 *
 * Decisions (also in the docs):
 * - Deposits and withdrawals come from the YNAB import, which has them as transfers with the bank
 *   side (`cashFlows: 'ynab'`, the default). PP's own deposits are only compared, never booked.
 *   `'book'` books PP's deposits and removals as plain bookings, for a depot YNAB has no transfers for.
 * - Everything else that PP knows and YNAB cannot (interest, fees, taxes, refunds, dividends) and
 *   every trade is written. The cash of a buy, sell, dividend or cost of a security is the trade's
 *   own settlement booking; the PP cash leg of it is not booked a second time.
 * - A PP-managed account's value is cash plus holdings times price. YNAB's value estimates of the
 *   account (balance adjustments and, with `openingBalance: 'pp'`, the opening balance) stop
 *   counting: adjustments are deleted (undoable), the opening balance becomes PP's cash balance
 *   on the opening day.
 */

// ---- the mapping document -------------------------------------------------------------------

const ignore = z.literal('ignore');
const securityEntry = z.object({
  /** Existing app security to use; default: match by ISIN, then by name, else create. */
  securityId: z.string().min(1).optional(),
  kind: z.enum(SECURITY_KINDS).optional(),
  /** Asset class by name (created when missing). */
  assetClass: z.string().min(1).optional(),
  /** Yahoo symbol (last resort); taken from PP's ticker only when PP's own feed is Yahoo. */
  symbol: z.string().min(1).optional(),
  /** The quote page (Ariva or cryptocalc), by default PP's feed URL; `none` leaves it unset. */
  quoteUrl: z.string().min(1).optional(),
  /** CoinGecko coin id, by default PP's `COINGECKOCOINID` property. */
  coingeckoId: z.string().min(1).optional(),
  /** Ariva exchange (`boerse_id`); wins over the one inside the quote URL. */
  quoteExchange: z.string().min(1).optional(),
  /** Daily refresh on or off; default: on when a symbol is known. */
  pricesEnabled: z.boolean().optional(),
  terBp: z.number().int().min(0).optional(),
  /** Free text for the owner (ignored by the importer), e.g. where the quote id came from. */
  comment: z.string().optional(),
});
export type SecurityEntry = z.infer<typeof securityEntry>;

export const PP_MIGRATION_VERSION = 1;
export const ppMigrationSchema = z.object({
  version: z.literal(PP_MIGRATION_VERSION),
  /** PP portfolio uuid -> app investment account (by name or id), or `ignore`. */
  portfolios: z.record(
    z.string(),
    z.union([
      z.object({
        account: z.string().min(1),
        /**
         * Split a platform into cash and securities like PP: the existing app account `account`
         * (it holds the platform's YNAB flows) is renamed to this name and becomes the cash
         * account; a new securities account named `account` is created, and every trade's cash
         * moves between the two by a transfer.
         */
        cashAccount: z.object({ name: z.string().min(1) }).optional(),
        /** Existing account the depot settles through (Verrechnungskonto), e.g. a giro. */
        referenceAccount: z.string().min(1).optional(),
      }),
      ignore,
    ]),
  ),
  /** PP cash account uuid -> app investment account, or `ignore`. */
  accounts: z.record(
    z.string(),
    z.union([
      z.object({
        account: z.string().min(1),
        /** Where deposits and removals come from: `ynab` (transfers already imported) or `book`. */
        cashFlows: z.enum(['ynab', 'book']).default('ynab'),
        /**
         * `pp`: the opening balance becomes PP's cash on the day before the opening day; `keep`:
         * YNAB's stays; `total` (the cash account of a split platform): YNAB's opening balance
         * minus the value of PP's securities on the opening day, so cash plus securities equal
         * YNAB's total that day; a whole number of cents sets it (what the report suggests).
         */
        openingBalance: z.union([z.enum(['pp', 'keep', 'total']), z.number().int()]).default('pp'),
        /** Delete the account's YNAB balance adjustments (value estimates) on commit. */
        retireYnabValue: z.boolean().default(true),
        /**
         * The real cash of the platform on a day (from its statement). At commit one audited
         * reconciliation booking ("Abgleich mit Plattform-Saldo") on this off-budget account makes
         * its balance on `date` equal `cents` (minus the accounts named in `minus`, whose balance
         * already counts, e.g. a giro the platform settles through). `as`: `flow` = money that
         * crossed the boundary and YNAB missed (a deposit or removal), `result` = a gain or loss
         * (Kapitalerträge, e.g. a write-off).
         */
        /**
         * The platform's cash account statement (`statement.ts`): the cash account then follows it
         * exactly from its opening day. The opening balance is derived from the statement's closing
         * balance, the external transfers are matched with YNAB's, the rows PP lacks are added.
         */
        statement: statementConfigSchema.optional(),
        cashTarget: z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            cents: z.number().int(),
            as: z.enum(['flow', 'result']).default('flow'),
            minus: z.array(z.string().min(1)).default([]),
          })
          .optional(),
      }),
      ignore,
    ]),
  ),
  /** PP security uuid -> options, or `skip`. Securities not listed use the defaults. */
  securities: z.record(z.string(), z.union([securityEntry, z.literal('skip')])).default({}),
  defaultSecurityKind: z.enum(SECURITY_KINDS).default('other'),
});
export type PpMigrationInput = z.input<typeof ppMigrationSchema>;
export type PpMigration = z.output<typeof ppMigrationSchema>;

export interface MigrationProblem {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface AppAccountRef {
  id: string;
  name: string;
  role: string;
  currency: string;
  openingDate: string;
  openingBalanceCents: number;
  referenceAccountId?: string | null;
}
export interface AppSecurityRef {
  id: string;
  name: string;
  isin: string | null;
  symbol: string | null;
  currency: string;
}

/** An app account the migration takes over, with its options and the PP objects behind it. */
export interface AccountTarget {
  accountId: string;
  name: string;
  currency: string;
  openingDate: string;
  openingBalanceCents: number;
  cashFlows: 'ynab' | 'book';
  openingBalance: 'pp' | 'keep' | 'total' | number;
  retireYnabValue: boolean;
  ppAccountUuids: string[];
  portfolioUuids: string[];
  /** Verrechnungskonto: the cash account of a split platform, or the account named in the mapping. */
  referenceAccountId: string | null;
  /** Real cash on a day, see the mapping document; `minusIds` are accounts that already count. */
  cashTarget: { date: string; cents: number; as: 'flow' | 'result'; minusIds: string[] } | null;
  /** The statement of the cash account and the app account of its bank. */
  statement: { config: StatementConfig; bankAccountId: string; ppAccountUuid: string } | null;
  /** The cash account of a split platform (a securities account whose cash lives elsewhere). */
  cashAccountId: string | null;
}

/** A platform split into a cash account (the renamed YNAB account) and a securities account. */
export interface SplitPlan {
  /** `new`: the run renames and creates; `done`: both accounts exist already. */
  state: 'new' | 'done';
  cashAccountId: string;
  /** Existing account id, or `new:<cash account id>` until the run creates it. */
  depotAccountId: string;
  cashName: string;
  depotName: string;
  /** Names before the split (the cash account's old name). */
  previousName: string;
}

export interface ResolvedMigration {
  /** The plan mapping (`mapToTarget`): PP uuid -> app account id. */
  mapping: PpMapping;
  targets: AccountTarget[];
  splits: SplitPlan[];
  problems: MigrationProblem[];
}

/** Same pattern as the Yahoo adapter accepts for a symbol (`packages/market/src/yahoo.ts`). */
const YAHOO_SYMBOL = /^[A-Za-z0-9.^=\-_]{1,30}$/;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Resolves the account names of the mapping document against the app's accounts. */
export function resolveMigration(
  model: PpModel,
  doc: PpMigration,
  realApps: ReadonlyArray<AppAccountRef>,
): ResolvedMigration {
  const problems: MigrationProblem[] = [];
  const error = (code: string, message: string) =>
    problems.push({ severity: 'error', code, message });

  // Splits first: the app as it will be after them (renamed cash account, new securities account).
  let apps: AppAccountRef[] = [...realApps];
  const splits: SplitPlan[] = [];
  const named = (name: string) => apps.filter((a) => norm(a.name) === norm(name));
  for (const [uuid, entry] of Object.entries(doc.portfolios)) {
    if (entry === 'ignore' || !entry.cashAccount) continue;
    const cashName = entry.cashAccount.name;
    const [cash, depot] = [named(cashName), named(entry.account)];
    if (cash.length === 1 && depot.length === 1) {
      if ((depot[0] as AppAccountRef).referenceAccountId === (cash[0] as AppAccountRef).id)
        splits.push({
          state: 'done',
          cashAccountId: (cash[0] as AppAccountRef).id,
          depotAccountId: (depot[0] as AppAccountRef).id,
          cashName,
          depotName: entry.account,
          previousName: entry.account,
        });
      else
        error(
          'mapping.split_conflict',
          `Portfolio ${uuid}: both accounts exist but are not linked`,
        );
    } else if (cash.length === 0 && depot.length === 1) {
      const old = depot[0] as AppAccountRef;
      const virtual: AppAccountRef = {
        id: `new:${old.id}`,
        name: entry.account,
        role: 'investment',
        currency: old.currency,
        openingDate: old.openingDate,
        openingBalanceCents: 0,
        referenceAccountId: old.id,
      };
      apps = [...apps.map((a) => (a.id === old.id ? { ...a, name: cashName } : a)), virtual];
      splits.push({
        state: 'new',
        cashAccountId: old.id,
        depotAccountId: virtual.id,
        cashName,
        depotName: entry.account,
        previousName: old.name,
      });
    } else
      error(
        'mapping.split_account',
        `Portfolio ${uuid}: account "${entry.account}" is not unique or missing`,
      );
  }
  const splitOfCash = new Map(splits.map((p) => [p.cashAccountId, p]));

  const find = (what: string, ref: string): AppAccountRef | null => {
    const byId = apps.find((a) => a.id === ref);
    if (byId) return byId;
    const named = apps.filter((a) => norm(a.name) === norm(ref));
    if (named.length === 1) return named[0] as AppAccountRef;
    error(
      named.length === 0 ? 'mapping.account_unknown' : 'mapping.account_ambiguous',
      `${what}: app account "${ref}" ${named.length === 0 ? 'does not exist' : 'is not unique'}`,
    );
    return null;
  };
  const mapping: PpMapping = { portfolios: {}, accounts: {} };
  const targets = new Map<string, AccountTarget>();
  const target = (app: AppAccountRef): AccountTarget => {
    let t = targets.get(app.id);
    if (!t) {
      t = {
        accountId: app.id,
        name: app.name,
        currency: app.currency,
        openingDate: app.openingDate,
        openingBalanceCents: app.openingBalanceCents,
        cashFlows: 'ynab',
        openingBalance: 'keep',
        retireYnabValue: true,
        ppAccountUuids: [],
        portfolioUuids: [],
        referenceAccountId: app.referenceAccountId ?? null,
        cashTarget: null,
        statement: null,
        cashAccountId: null,
      };
      targets.set(app.id, t);
    }
    return t;
  };
  const investment = (what: string, app: AppAccountRef): boolean => {
    if (app.role !== 'investment') {
      error('mapping.account_role', `${what}: "${app.name}" is not an investment account`);
      return false;
    }
    if (app.currency !== 'EUR') {
      error('mapping.account_currency', `${what}: "${app.name}" is not a EUR account`);
      return false;
    }
    return true;
  };

  for (const pf of model.portfolios) {
    const entry = doc.portfolios[pf.uuid];
    if (entry === undefined) {
      if (pf.transactions.length > 0)
        error('mapping.portfolio_unmapped', `Portfolio ${pf.uuid} has transactions but no entry`);
      continue;
    }
    if (entry === 'ignore') {
      mapping.portfolios[pf.uuid] = 'ignore';
      continue;
    }
    const app = find(`Portfolio ${pf.uuid}`, entry.account);
    if (!app || !investment(`Portfolio ${pf.uuid}`, app)) continue;
    mapping.portfolios[pf.uuid] = { accountId: app.id };
    const t = target(app);
    t.portfolioUuids.push(pf.uuid);
    if (entry.cashAccount) {
      const own = splits.find((p) => p.depotName === entry.account);
      if (own) {
        t.cashAccountId = own.cashAccountId;
        t.referenceAccountId = own.cashAccountId;
      }
    }
    if (entry.referenceAccount) {
      const ref = find(`Portfolio ${pf.uuid} reference account`, entry.referenceAccount);
      if (ref) t.referenceAccountId = ref.id;
    }
  }
  for (const acc of model.accounts) {
    const entry = doc.accounts[acc.uuid];
    if (entry === undefined) {
      if (acc.transactions.length > 0)
        error('mapping.account_unmapped', `PP account ${acc.uuid} has transactions but no entry`);
      continue;
    }
    if (entry === 'ignore') {
      mapping.accounts[acc.uuid] = 'ignore';
      continue;
    }
    const app = find(`PP account ${acc.uuid}`, entry.account);
    if (!app || !investment(`PP account ${acc.uuid}`, app)) continue;
    mapping.accounts[acc.uuid] = { accountId: app.id };
    const t = target(app);
    if (entry.openingBalance === 'total' && !splitOfCash.has(app.id))
      error(
        'mapping.opening_total',
        `PP account ${acc.uuid}: openingBalance total needs a split platform`,
      );
    t.ppAccountUuids.push(acc.uuid);
    t.cashFlows = entry.cashFlows;
    t.openingBalance = entry.openingBalance;
    t.retireYnabValue = entry.retireYnabValue;
    if (entry.statement) {
      const bank = find(`PP account ${acc.uuid} statement bank`, entry.statement.bank);
      if (bank)
        t.statement = { config: entry.statement, bankAccountId: bank.id, ppAccountUuid: acc.uuid };
    }
    if (entry.cashTarget) {
      const minusIds = entry.cashTarget.minus.flatMap((name) => {
        const other = find(`PP account ${acc.uuid} cash target`, name);
        return other ? [other.id] : [];
      });
      t.cashTarget = {
        date: entry.cashTarget.date,
        cents: entry.cashTarget.cents,
        as: entry.cashTarget.as,
        minusIds,
      };
    }
  }
  // A depot settles through its reference account: both must end up on the same app account.
  for (const pf of model.portfolios) {
    const own = mapping.portfolios[pf.uuid];
    if (own === undefined || own === 'ignore' || pf.referenceAccountUuid === null) continue;
    const ref = mapping.accounts[pf.referenceAccountUuid];
    const refTxs =
      model.accounts.find((a) => a.uuid === pf.referenceAccountUuid)?.transactions.length ?? 0;
    if ((ref === undefined || ref === 'ignore') && refTxs === 0) continue;
    const wanted = targets.get(own.accountId)?.cashAccountId ?? own.accountId;
    if (ref === undefined || ref === 'ignore' || ref.accountId !== wanted)
      error(
        'mapping.reference_account',
        `Portfolio ${pf.uuid}: its reference account must map to ${wanted === own.accountId ? 'the same app account' : 'the platform cash account'}`,
      );
  }
  for (const t of targets.values())
    if (t.cashFlows === 'book' && t.ppAccountUuids.length === 0)
      error('mapping.cash_flows', `Account "${t.name}": cashFlows book needs a PP cash account`);
  return { mapping, targets: [...targets.values()], splits, problems };
}

// ---- securities -----------------------------------------------------------------------------

export interface SecurityPlan {
  ppUuid: string;
  action: 'match' | 'create' | 'skip';
  /** Existing security (`match`). */
  securityId: string | null;
  matchedBy: 'id' | 'isin' | 'name' | null;
  name: string;
  isin: string | null;
  kind: SecurityKind;
  currency: string;
  symbol: string | null;
  quoteUrl: string | null;
  coingeckoId: string | null;
  quoteExchange: string | null;
  pricesEnabled: boolean;
  terBp: number;
  assetClass: string | null;
}

/**
 * The quote page of a security as the live sources want it (`docs/market-data.md`): PP's HTML-table
 * feed URL when it is https, has no credentials and points at Ariva or cryptocalc; otherwise none.
 */
export function ppQuoteUrl(s: Pick<PpSecurity, 'feed' | 'feedUrl'>): string | null {
  if (s.feed !== 'GENERIC_HTML_TABLE' || !s.feedUrl) return null;
  try {
    const url = new URL(s.feedUrl);
    const host = url.hostname.toLowerCase();
    const known = host === 'ariva.de' || host === 'www.ariva.de' || host === 'cryptocalc.cc';
    if (url.protocol !== 'https:' || url.username || url.password || !known) return null;
    return s.feedUrl;
  } catch {
    return null;
  }
}

/** Match or create every PP security: id from the document, then ISIN, then name. */
export function planSecurities(
  model: PpModel,
  doc: PpMigration,
  existing: ReadonlyArray<AppSecurityRef>,
  resolveCoin?: (security: PpSecurity) => string | null,
): { securities: SecurityPlan[]; problems: MigrationProblem[] } {
  const problems: MigrationProblem[] = [];
  const byIsin = new Map<string, AppSecurityRef[]>();
  const byName = new Map<string, AppSecurityRef[]>();
  for (const s of existing) {
    if (s.isin) byIsin.set(s.isin.toUpperCase(), [...(byIsin.get(s.isin.toUpperCase()) ?? []), s]);
    byName.set(norm(s.name), [...(byName.get(norm(s.name)) ?? []), s]);
  }
  const taken = new Map<string, string>();
  const securities = model.securities.map((s): SecurityPlan => {
    const entry = doc.securities[s.uuid];
    const base = {
      ppUuid: s.uuid,
      name: s.name,
      isin: s.isin,
      currency: s.currency,
    };
    if (entry === 'skip')
      return {
        ...base,
        action: 'skip',
        securityId: null,
        matchedBy: null,
        kind: doc.defaultSecurityKind,
        symbol: null,
        quoteUrl: null,
        coingeckoId: null,
        quoteExchange: null,
        pricesEnabled: false,
        terBp: 0,
        assetClass: null,
      };
    const opt = entry ?? {};
    let match: AppSecurityRef | undefined;
    let matchedBy: SecurityPlan['matchedBy'] = null;
    if (opt.securityId) {
      match = existing.find((e) => e.id === opt.securityId);
      matchedBy = 'id';
      if (!match)
        problems.push({
          severity: 'error',
          code: 'security.unknown',
          message: `Security ${s.uuid}: app security ${opt.securityId} does not exist`,
        });
    } else if (s.isin && byIsin.has(s.isin.toUpperCase())) {
      const hits = byIsin.get(s.isin.toUpperCase()) as AppSecurityRef[];
      match = hits[0];
      matchedBy = 'isin';
      if (hits.length > 1)
        problems.push({
          severity: 'error',
          code: 'security.ambiguous',
          message: `Security ${s.uuid}: several app securities share its ISIN`,
        });
    } else {
      const hits = (byName.get(norm(s.name)) ?? []).filter((h) => !h.isin || !s.isin);
      if (hits.length === 1) {
        match = hits[0];
        matchedBy = 'name';
      } else if (hits.length > 1)
        problems.push({
          severity: 'error',
          code: 'security.ambiguous',
          message: `Security ${s.uuid}: several app securities have its name`,
        });
    }
    if (match && match.currency !== s.currency)
      problems.push({
        severity: 'error',
        code: 'security.currency',
        message: `Security ${s.uuid}: the app security has another currency than PP`,
      });
    if (match) {
      const other = taken.get(match.id);
      if (other)
        problems.push({
          severity: 'error',
          code: 'security.duplicate_match',
          message: `PP securities ${other} and ${s.uuid} match the same app security`,
        });
      taken.set(match.id, s.uuid);
    }
    const symbol = opt.symbol ?? (s.feed === 'YAHOO' ? s.tickerSymbol : null);
    const quoteUrl = opt.quoteUrl ?? ppQuoteUrl(s);
    const coingeckoId =
      opt.coingeckoId ?? (s.feedProperties['COINGECKOCOINID'] || resolveCoin?.(s) || null);
    return {
      ...base,
      action: match ? 'match' : 'create',
      securityId: match?.id ?? null,
      matchedBy: match ? matchedBy : null,
      kind: opt.kind ?? doc.defaultSecurityKind,
      symbol,
      quoteUrl,
      coingeckoId,
      quoteExchange: opt.quoteExchange ?? null,
      pricesEnabled:
        opt.pricesEnabled ?? (symbol !== null || quoteUrl !== null || coingeckoId !== null),
      terBp: opt.terBp ?? 0,
      assetClass: opt.assetClass ?? null,
    };
  });
  return { securities, problems };
}

// ---- trades the ledger accepts --------------------------------------------------------------

export interface NormalizedTrade {
  trade: PlannedTrade;
  /** What was adjusted to fit the ledger's trade rules (codes, one per adjustment). */
  notes: string[];
  /** The trade breaks a rule that cannot be fixed by an adjustment. */
  error: string | null;
}

/**
 * Fits a planned trade to the ledger's trade rules (`moneyRuleViolation`): a buy has no tax
 * (PP's tax on a purchase becomes part of the fee, so the cash stays exact), a delivery has no fee
 * or tax (its amount is PP's amount, the cost carried in), a standalone fee or tax has neither.
 */
export function normalizeTrade(t: PlannedTrade): NormalizedTrade {
  const notes: string[] = [];
  const out = { ...t };
  if (t.kind === 'buy' && t.taxCents > 0) {
    out.feeCents += t.taxCents;
    out.taxCents = 0;
    notes.push('buy-tax-in-fee');
  }
  if (
    (t.kind === 'delivery_in' || t.kind === 'delivery_out') &&
    (t.feeCents > 0 || t.taxCents > 0)
  ) {
    out.amountCents += t.feeCents + t.taxCents;
    out.feeCents = 0;
    out.taxCents = 0;
    notes.push('delivery-fee-in-amount');
  }
  if ((t.kind === 'fee' || t.kind === 'tax') && (t.feeCents > 0 || t.taxCents > 0)) {
    out.amountCents += t.feeCents + t.taxCents;
    out.feeCents = 0;
    out.taxCents = 0;
    notes.push('cost-fee-in-amount');
  }
  let error: string | null = null;
  if (
    (out.kind === 'sell' || out.kind === 'dividend' || out.kind === 'interest') &&
    out.feeCents + out.taxCents > out.amountCents
  )
    error = 'fee and tax exceed the gross amount';
  return { trade: out, notes, error };
}

// ---- the PP side of the Gate 3 report -------------------------------------------------------

export interface PpPosition {
  accountId: string;
  securityPpUuid: string;
  unitsE8: number;
  priceMicro: number | null;
  priceDate: string | null;
  /** `null` without a PP quote on or before the day. */
  valueCents: number | null;
}

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

/** Prices of a security ascending, EUR only (the migration is EUR-only). */
function pricesBySecurity(plan: ImportPlan): Map<string, DatedPrice[]> {
  const out = new Map<string, DatedPrice[]>();
  for (const p of plan.prices) {
    const list = out.get(p.securityPpUuid) ?? [];
    list.push({ date: p.date, priceMicro: p.priceMicro, currency: p.currency });
    out.set(p.securityPpUuid, list);
  }
  for (const list of out.values()) list.sort(byDate);
  return out;
}

function priceOn(list: ReadonlyArray<DatedPrice> | undefined, day: string): DatedPrice | undefined {
  let found: DatedPrice | undefined;
  for (const p of list ?? []) {
    if (p.date > day) break;
    found = p;
  }
  return found;
}

/** Units and value per app account and security on a day, from PP's trades and quotes alone. */
export function ppPositionsAsOf(
  plan: ImportPlan,
  day: string,
  skipped: ReadonlySet<string> = new Set(),
): PpPosition[] {
  const units = new Map<string, { accountId: string; sec: string; units: number }>();
  for (const t of plan.trades) {
    if (t.date > day || skipped.has(t.securityPpUuid)) continue;
    const key = `${t.accountId}\0${t.securityPpUuid}`;
    const e = units.get(key) ?? { accountId: t.accountId, sec: t.securityPpUuid, units: 0 };
    e.units += t.unitsE8;
    units.set(key, e);
  }
  const prices = pricesBySecurity(plan);
  return [...units.values()]
    .filter((e) => e.units !== 0)
    .map((e): PpPosition => {
      const p = priceOn(prices.get(e.sec), day);
      return {
        accountId: e.accountId,
        securityPpUuid: e.sec,
        unitsE8: e.units,
        priceMicro: p?.priceMicro ?? null,
        priceDate: p?.date ?? null,
        valueCents: p ? marketValueEurCents(e.units, p.priceMicro, 1_000_000) : null,
      };
    })
    .sort(
      (a, b) =>
        a.accountId.localeCompare(b.accountId) || a.securityPpUuid.localeCompare(b.securityPpUuid),
    );
}

/** PP's cash on `day` (inclusive) or before `day` (exclusive) summed over the given PP accounts. */
export function ppCash(
  model: PpModel,
  ppAccountUuids: ReadonlyArray<string>,
  day: string,
  inclusive = true,
): number {
  let sum = 0;
  for (const a of model.accounts) {
    if (!ppAccountUuids.includes(a.uuid)) continue;
    for (const tx of a.transactions)
      if (inclusive ? tx.date <= day : tx.date < day) sum += SIGN[tx.type] * tx.amountCents;
  }
  return sum;
}

/** PP cash movements per PP account type, per year: what PP says was deposited, paid out, earned. */
export interface PpCashFlowSummary {
  deposits: number;
  removals: number;
  transfersIn: number;
  transfersOut: number;
  interest: number;
  dividends: number;
  fees: number;
  taxes: number;
}

export function ppCashFlowByYear(
  model: PpModel,
  ppAccountUuids: ReadonlyArray<string>,
): Map<string, PpCashFlowSummary> {
  const out = new Map<string, PpCashFlowSummary>();
  for (const a of model.accounts) {
    if (!ppAccountUuids.includes(a.uuid)) continue;
    for (const tx of a.transactions) {
      const year = tx.date.slice(0, 4);
      const e =
        out.get(year) ??
        ({
          deposits: 0,
          removals: 0,
          transfersIn: 0,
          transfersOut: 0,
          interest: 0,
          dividends: 0,
          fees: 0,
          taxes: 0,
        } satisfies PpCashFlowSummary);
      const v = tx.amountCents;
      switch (tx.type) {
        case 'DEPOSIT':
          e.deposits += v;
          break;
        case 'REMOVAL':
          e.removals += v;
          break;
        case 'TRANSFER_IN':
          e.transfersIn += v;
          break;
        case 'TRANSFER_OUT':
          e.transfersOut += v;
          break;
        case 'INTEREST':
          e.interest += v;
          break;
        case 'INTEREST_CHARGE':
          e.interest -= v;
          break;
        case 'DIVIDENDS':
          e.dividends += v;
          break;
        case 'FEES':
        case 'FEES_REFUND':
          e.fees += SIGN[tx.type] * v;
          break;
        case 'TAXES':
        case 'TAX_REFUND':
          e.taxes += SIGN[tx.type] * v;
          break;
        default:
      }
      out.set(year, e);
    }
  }
  return out;
}

export interface PpDepotSeries {
  days: string[];
  valuations: Valuation[];
  /** Deposits, removals, transfers out of the depot and deliveries: PP's capital flows. */
  flows: CashFlow[];
  cashCents: number[];
  holdingsCents: number[];
}

/**
 * Daily value and capital flows of one app account "depot incl. reference account" from PP's own
 * data. Flows as in PP: deposits and removals, account transfers that leave the depot, and
 * deliveries and portfolio transfers at their amount. Dividends, interest, fees and taxes are
 * performance.
 */
export function ppDepotSeries(
  model: PpModel,
  plan: ImportPlan,
  target: Pick<AccountTarget, 'accountId' | 'ppAccountUuids' | 'portfolioUuids'>,
  from: string,
  to: string,
  skipped: ReadonlySet<string> = new Set(),
): PpDepotSeries {
  const days = eachDay(from, to);
  const prices = pricesBySecurity(plan);
  const trades = plan.trades.filter(
    (t) => t.accountId === target.accountId && !skipped.has(t.securityPpUuid),
  );
  const positions = new Map<
    string,
    PositionInput & { trades: { date: string; unitsE8: number }[] }
  >();
  for (const t of trades) {
    let p = positions.get(t.securityPpUuid);
    if (!p) {
      p = {
        accountId: target.accountId,
        securityId: t.securityPpUuid,
        snapshots: [],
        trades: [],
        prices: prices.get(t.securityPpUuid) ?? [],
      };
      positions.set(t.securityPpUuid, p);
    }
    p.trades.push({ date: t.date, unitsE8: t.unitsE8 });
  }
  const noRates: RateTable = new Map();
  const holdings = dailyValuation([...positions.values()], days, noRates).totalCents;

  const accounts = model.accounts.filter((a) => target.ppAccountUuids.includes(a.uuid));
  const cashByDay = new Map<string, number>();
  const flows: CashFlow[] = [];
  const mine = new Set(accounts.flatMap((a) => a.transactions.map((t) => t.uuid)));
  for (const a of accounts)
    for (const tx of a.transactions) {
      cashByDay.set(tx.date, (cashByDay.get(tx.date) ?? 0) + SIGN[tx.type] * tx.amountCents);
      if (tx.type === 'DEPOSIT') flows.push({ date: tx.date, cents: tx.amountCents });
      else if (tx.type === 'REMOVAL') flows.push({ date: tx.date, cents: -tx.amountCents });
      else if (tx.type === 'TRANSFER_IN' || tx.type === 'TRANSFER_OUT') {
        const peer = tx.crossEntry?.peerUuid ?? null;
        if (peer === null || !mine.has(peer))
          flows.push({ date: tx.date, cents: SIGN[tx.type] * tx.amountCents });
      }
    }
  const portfolios = model.portfolios.filter((p) => target.portfolioUuids.includes(p.uuid));
  const ownPf = new Set(portfolios.flatMap((p) => p.transactions.map((t) => t.uuid)));
  for (const p of portfolios)
    for (const tx of p.transactions) {
      if (skipped.has(tx.securityUuid ?? '')) continue;
      const sign =
        tx.type === 'DELIVERY_INBOUND' || tx.type === 'TRANSFER_IN'
          ? 1
          : tx.type === 'DELIVERY_OUTBOUND' || tx.type === 'TRANSFER_OUT'
            ? -1
            : 0;
      if (sign === 0) continue;
      const peer = tx.crossEntry?.peerUuid ?? null;
      if (tx.type.startsWith('TRANSFER') && peer !== null && ownPf.has(peer)) continue;
      flows.push({ date: tx.date, cents: sign * tx.amountCents });
    }
  flows.sort(byDate);
  const merged: CashFlow[] = [];
  for (const f of flows) {
    const last = merged[merged.length - 1];
    if (last && last.date === f.date) last.cents += f.cents;
    else merged.push({ ...f });
  }

  const opening = ppCash(model, target.ppAccountUuids, from, false);
  let run = opening;
  const cashCents = days.map((d) => {
    run += cashByDay.get(d) ?? 0;
    return run;
  });
  const valuations = days.map((date, i) => ({
    date,
    valueCents: (holdings[i] as number) + (cashCents[i] as number),
  }));
  return {
    days,
    valuations,
    flows: merged.filter((f) => f.cents !== 0),
    cashCents,
    holdingsCents: holdings,
  };
}

// ---- proposal for the owner's mapping -------------------------------------------------------

export interface AccountNote {
  ppName: string;
  note: string;
}

/**
 * A first mapping for the owner to edit: PP objects to app accounts by name similarity and the
 * reference-account rule, securities by ISIN, asset classes from the PP taxonomy's leaf, kind by a
 * conservative guess. Returns the document and a list of everything that needs a decision.
 */
export function proposeMigration(
  model: PpModel,
  apps: ReadonlyArray<AppAccountRef>,
  existing: ReadonlyArray<AppSecurityRef> = [],
): { doc: PpMigrationInput; open: string[] } {
  const open: string[] = [];
  const investmentApps = apps.filter((a) => a.role === 'investment');
  const words = (s: string) =>
    norm(s)
      .replace(/\b(konto|depot|account)\b/g, '')
      .replace(/[^a-z0-9äöüß ]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  const guess = (name: string): AppAccountRef | null => {
    const w = words(name);
    const hits = investmentApps.filter((a) => words(a.name) === w);
    return hits.length === 1 ? (hits[0] as AppAccountRef) : null;
  };
  const doc: PpMigrationInput = { version: 1, portfolios: {}, accounts: {}, securities: {} };
  const used = new Set<string>();
  for (const p of model.portfolios)
    for (const t of p.transactions) if (t.securityUuid) used.add(t.securityUuid);
  for (const a of model.accounts)
    for (const t of a.transactions) if (t.securityUuid) used.add(t.securityUuid);

  const pfApp = new Map<string, AppAccountRef>();
  for (const p of model.portfolios) {
    const app = guess(p.name);
    if (p.transactions.length === 0) doc.portfolios[p.uuid] = 'ignore';
    else if (app) {
      doc.portfolios[p.uuid] = { account: app.name };
      pfApp.set(p.uuid, app);
    } else {
      open.push(`Portfolio "${p.name}": no unique app account of that name; set "account"`);
      doc.portfolios[p.uuid] = { account: '?' };
    }
  }
  for (const a of model.accounts) {
    const viaPortfolio = model.portfolios.find(
      (p) => p.referenceAccountUuid === a.uuid && pfApp.has(p.uuid),
    );
    const app = viaPortfolio ? pfApp.get(viaPortfolio.uuid) : guess(a.name);
    if (a.transactions.length === 0 && !viaPortfolio) doc.accounts[a.uuid] = 'ignore';
    else if (app)
      doc.accounts[a.uuid] = {
        account: app.name,
        cashFlows: 'ynab',
        // Owner decision 02.10.2026: YNAB is more current than PP; its cash flows and opening
        // balances stay. A depot's YNAB value adjustments are retired (holdings carry the value);
        // an account without a depot (P2P platform) keeps its YNAB values.
        openingBalance: 'keep',
        retireYnabValue: viaPortfolio !== undefined,
      };
    else {
      open.push(`PP account "${a.name}": no unique app account of that name; set "account"`);
      doc.accounts[a.uuid] = {
        account: '?',
        cashFlows: 'ynab',
        openingBalance: 'keep',
        retireYnabValue: false,
      };
    }
  }

  // Asset class: the deepest classification of the first taxonomy a security is assigned to.
  const taxonomy = model.taxonomies[0];
  const classOf = new Map<string, string>();
  if (taxonomy)
    for (const c of taxonomy.classifications)
      for (const as of c.assignments)
        if (as.vehicle === 'security' && !classOf.has(as.uuid)) classOf.set(as.uuid, c.name);

  const plan = planSecurities(model, { ...ppMigrationSchema.parse(doc) }, existing);
  let noSource = 0;
  let imported = 0;
  let skipped = 0;
  for (const s of model.securities) {
    const cls = classOf.get(s.uuid);
    const entry: SecurityEntry = { kind: guessKind(s, cls) };
    if (cls) entry.assetClass = cls;
    const isBenchmark = /^benchmark/i.test(s.name);
    if (!used.has(s.uuid) && !isBenchmark && !cls) {
      (doc.securities as Record<string, unknown>)[s.uuid] = 'skip';
      skipped += 1;
      continue;
    }
    imported += 1;
    // Quote sources come from PP's own feed (`planSecurities`): the Yahoo symbol of a Yahoo feed,
    // the Ariva or cryptocalc page of an HTML-table feed, the CoinGecko property. Nothing is guessed.
    const sp = plan.securities.find((p) => p.ppUuid === s.uuid);
    if (sp?.symbol && YAHOO_SYMBOL.test(sp.symbol)) entry.symbol = sp.symbol;
    if (used.has(s.uuid) && !sp?.symbol && !sp?.quoteUrl && !sp?.coingeckoId) noSource += 1;
    (doc.securities as Record<string, unknown>)[s.uuid] = entry;
  }
  open.push(
    `Securities: ${imported} imported, ${skipped} never-traded watchlist ones skipped; ${noSource} traded ones have no live quote source in PP`,
  );
  return { doc, open };
}

function guessKind(s: PpSecurity, cls: string | undefined): SecurityKind {
  if (
    !s.isin &&
    (s.feed === 'COINGECKO' ||
      (s.feedUrl ?? '').includes('cryptocalc.cc') ||
      /krypto|bitcoin|ethereum/i.test(cls ?? ''))
  )
    return 'crypto';
  if (!s.isin) return 'other';
  if (
    /\b(etf|ucits)\b|ishares|xtrackers|vanguard|amundi|invesco|wisdomtree|spdr|lyxor/i.test(s.name)
  )
    return 'etf';
  if (/^(US|CA|NL|DE|FR|GB|CH)[0-9A-Z]{9}[0-9]$/.test(s.isin) && !/^DE000[A-Z]/.test(s.isin))
    return 'stock';
  return 'other';
}

/** Securities in `plan.trades` that the document skips: such a trade cannot be written. */
export function skippedButTraded(
  plan: ImportPlan,
  securities: ReadonlyArray<SecurityPlan>,
): string[] {
  const skipped = new Set(securities.filter((s) => s.action === 'skip').map((s) => s.ppUuid));
  return [
    ...new Set(
      plan.trades.filter((t) => skipped.has(t.securityPpUuid)).map((t) => t.securityPpUuid),
    ),
  ];
}
