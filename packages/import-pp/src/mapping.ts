import { z } from 'zod';
import type {
  AccountTxType,
  PpModel,
  PpPortfolio,
  PpProblem,
  PpTransaction,
  PortfolioTxType,
} from './model';

/**
 * Target layer (`docs/migration/pp-export.md` §Mapping): the owner-made mapping document says
 * which PP portfolio becomes which investment account and which PP account is tracked (cash
 * bookings) or ignored. The result is a plan of plain rows; nothing here touches the database
 * (P5.11 commits it). Keys are `pp:<uuid>` so a second import is idempotent.
 */

// Mirrors packages/db/src/schema/invest.ts (this package stays pure and does not import the database).
export const SECURITY_KINDS = [
  'etf',
  'stock',
  'fund',
  'bond',
  'crypto',
  'p2p',
  'commodity',
  'other',
] as const;
export type SecurityKind = (typeof SECURITY_KINDS)[number];
export type TradeKind =
  'buy' | 'sell' | 'delivery_in' | 'delivery_out' | 'dividend' | 'interest' | 'fee' | 'tax';

const target = z.object({ accountId: z.string().min(1) });
const ignore = z.literal('ignore');

export const ppMappingSchema = z.object({
  /** PP portfolio uuid -> target investment account, or `ignore`. */
  portfolios: z.record(z.string(), z.union([target, ignore])),
  /** PP (cash) account uuid -> target tracking account, or `ignore`. */
  accounts: z.record(z.string(), z.union([target, ignore])),
  /** Kind per PP security uuid; everything else gets `defaultSecurityKind`. */
  securityKinds: z.record(z.string(), z.enum(SECURITY_KINDS)).default({}),
  defaultSecurityKind: z.enum(SECURITY_KINDS).default('other'),
});
export type PpMapping = z.input<typeof ppMappingSchema>;

export interface PlannedSecurity {
  ppUuid: string;
  name: string;
  kind: SecurityKind;
  symbol: string | null;
  isin: string | null;
  currency: string;
  isRetired: boolean;
}
export interface PlannedPrice {
  securityPpUuid: string;
  date: string;
  priceMicro: number;
  currency: string;
  source: 'import';
}
export interface PlannedTrade {
  importKey: string;
  securityPpUuid: string;
  accountId: string;
  /** Uuid of the PP portfolio the trade belongs to. */
  portfolioPpUuid: string;
  date: string;
  kind: TradeKind;
  /** Signed, 1e-8 units (`trade_units_chk`). */
  unitsE8: number;
  amountCents: number;
  feeCents: number;
  taxCents: number;
  currency: string;
  note: string | null;
}
export interface PlannedBooking {
  importKey: string;
  accountId: string;
  date: string;
  /** Signed cash movement of the account. */
  amountCents: number;
  currency: string;
  ppType: AccountTxType;
  securityPpUuid: string | null;
  note: string | null;
  /** Import key of the trade this cash leg pays for or receives (buy, sell), if any. */
  tradeImportKey: string | null;
  /** Import key of the other leg of an account transfer, if any. */
  counterpartKey: string | null;
  /**
   * The cash leg of a planned trade (buy, sell, or the dividend, interest, fee, tax of a security):
   * the trade's settlement booking carries this cash, so a writer must not book it a second time.
   */
  viaTrade: boolean;
  /** Uuid of the PP account the transaction belongs to. */
  ppAccountUuid: string;
}
export interface PlannedInvestmentAccount {
  portfolioPpUuid: string;
  portfolioName: string;
  accountId: string;
  /** PP's reference (cash) account of the portfolio: the depot view includes it (Gate 3). */
  referenceAccountPpUuid: string | null;
}
export interface Ignored {
  path: string;
  reason: string;
}
export interface ImportPlan {
  securities: PlannedSecurity[];
  prices: PlannedPrice[];
  investmentAccounts: PlannedInvestmentAccount[];
  trades: PlannedTrade[];
  bookings: PlannedBooking[];
  ignored: Ignored[];
  problems: PpProblem[];
}

export const ppKey = (uuid: string): string => `pp:${uuid}`;

/** Sign of the cash movement of an account transaction type. */
export const SIGN: Record<AccountTxType, 1 | -1> = {
  DEPOSIT: 1,
  INTEREST: 1,
  DIVIDENDS: 1,
  FEES_REFUND: 1,
  TAX_REFUND: 1,
  SELL: 1,
  TRANSFER_IN: 1,
  REMOVAL: -1,
  INTEREST_CHARGE: -1,
  FEES: -1,
  TAXES: -1,
  BUY: -1,
  TRANSFER_OUT: -1,
};

const PORTFOLIO_KIND: Record<PortfolioTxType, TradeKind> = {
  BUY: 'buy',
  SELL: 'sell',
  DELIVERY_INBOUND: 'delivery_in',
  DELIVERY_OUTBOUND: 'delivery_out',
  TRANSFER_IN: 'delivery_in',
  TRANSFER_OUT: 'delivery_out',
};
const ADDS: ReadonlySet<TradeKind> = new Set(['buy', 'delivery_in']);

/** Maps the parsed model with the owner's mapping document. */
export function mapToTarget(model: PpModel, mappingInput: PpMapping): ImportPlan {
  const mapping = ppMappingSchema.parse(mappingInput);
  const plan: ImportPlan = {
    securities: [],
    prices: [],
    investmentAccounts: [],
    trades: [],
    bookings: [],
    ignored: [],
    problems: [],
  };
  const problem = (code: string, path: string, message: string) =>
    plan.problems.push({ code, path, message, count: 1 });

  const securities = new Map(model.securities.map((s) => [s.uuid, s]));
  for (const s of model.securities) {
    plan.securities.push({
      ppUuid: s.uuid,
      name: s.name,
      kind: mapping.securityKinds[s.uuid] ?? mapping.defaultSecurityKind,
      symbol: s.tickerSymbol,
      isin: s.isin,
      currency: s.currency,
      isRetired: s.isRetired,
    });
    for (const p of s.prices)
      plan.prices.push({
        securityPpUuid: s.uuid,
        date: p.date,
        priceMicro: p.priceMicro,
        currency: s.currency,
        source: 'import',
      });
    for (const e of s.events)
      problem('security-event', s.path, `Security event ${e.type} is not mapped`);
  }

  // Portfolios -> investment accounts.
  const portfolioAccount = new Map<string, string>();
  for (const pf of model.portfolios) {
    const m = mapping.portfolios[pf.uuid];
    if (m === undefined) {
      problem('unmapped-portfolio', pf.path, 'Portfolio is not in the mapping, ignored');
      plan.ignored.push({ path: pf.path, reason: 'unmapped portfolio' });
    } else if (m === 'ignore') plan.ignored.push({ path: pf.path, reason: 'portfolio ignored' });
    else {
      portfolioAccount.set(pf.uuid, m.accountId);
      plan.investmentAccounts.push({
        portfolioPpUuid: pf.uuid,
        portfolioName: pf.name,
        accountId: m.accountId,
        referenceAccountPpUuid: pf.referenceAccountUuid,
      });
    }
  }
  // Portfolio that books the dividends/fees of a cash account: the one using it as reference.
  const portfolioOfAccount = new Map<string, PpPortfolio[]>();
  for (const pf of model.portfolios)
    if (pf.referenceAccountUuid !== null)
      portfolioOfAccount.set(pf.referenceAccountUuid, [
        ...(portfolioOfAccount.get(pf.referenceAccountUuid) ?? []),
        pf,
      ]);

  const trade = (
    tx: PpTransaction<string>,
    pf: PpPortfolio,
    accountId: string,
    kind: TradeKind,
    units: number,
    note?: string | null,
  ): boolean => {
    if (tx.securityUuid === null || !securities.has(tx.securityUuid)) {
      problem('trade-no-security', tx.path, 'Transaction without a known security skipped');
      return false;
    }
    if ((kind === 'buy' || kind === 'sell' || kind.startsWith('delivery')) && units === 0) {
      problem('trade-no-units', tx.path, 'Trade without shares skipped');
      return false;
    }
    plan.trades.push({
      importKey: ppKey(tx.uuid),
      securityPpUuid: tx.securityUuid,
      accountId,
      portfolioPpUuid: pf.uuid,
      date: tx.date,
      kind,
      unitsE8: units,
      // PP's interest amount is net of fee and tax, like a dividend (`grossValueCents` covers the latter).
      amountCents: kind === 'interest' ? tx.amountCents + tx.feeCents + tx.taxCents : tx.grossCents,
      feeCents: tx.feeCents,
      taxCents: tx.taxCents,
      currency: tx.currency,
      note: note ?? tx.note,
    });
    return true;
  };

  for (const pf of model.portfolios) {
    const accountId = portfolioAccount.get(pf.uuid);
    if (accountId === undefined) continue;
    for (const tx of pf.transactions) {
      const kind = PORTFOLIO_KIND[tx.type];
      const units = ADDS.has(kind) ? tx.sharesE8 : -tx.sharesE8;
      trade(tx, pf, accountId, kind, units, tx.type.startsWith('TRANSFER') ? 'transfer' : null);
    }
  }

  const tradeKindOf = new Map(plan.trades.map((t) => [t.importKey, t.kind]));
  for (const acc of model.accounts) {
    const m = mapping.accounts[acc.uuid];
    if (m === undefined) {
      problem('unmapped-account', acc.path, 'Account is not in the mapping, ignored');
      plan.ignored.push({ path: acc.path, reason: 'unmapped account' });
      continue;
    }
    const tracking = m === 'ignore' ? null : m.accountId;
    for (const tx of acc.transactions) {
      // Income and costs of a security (dividend, interest, fee, tax) are trades of the portfolio
      // that settles through this account.
      const moneyKind: Partial<Record<AccountTxType, TradeKind>> = {
        DIVIDENDS: 'dividend',
        INTEREST: 'interest',
        FEES: 'fee',
        TAXES: 'tax',
      };
      const tk = moneyKind[tx.type];
      let viaTrade = false;
      if (tk !== undefined && tx.securityUuid !== null) {
        const candidates = (portfolioOfAccount.get(acc.uuid) ?? []).filter((p) =>
          portfolioAccount.has(p.uuid),
        );
        const pf = candidates.length === 1 ? (candidates[0] as PpPortfolio) : undefined;
        if (pf) viaTrade = trade(tx, pf, portfolioAccount.get(pf.uuid) as string, tk, 0);
        else if (candidates.length > 1)
          problem('ambiguous-portfolio', tx.path, 'Several portfolios settle through this account');
        else if (!(portfolioOfAccount.get(acc.uuid) ?? []).length)
          problem('no-portfolio', tx.path, 'No portfolio settles through this account');
      } else if (
        tx.securityUuid !== null &&
        (tx.type === 'FEES_REFUND' || tx.type === 'TAX_REFUND')
      )
        problem('refund-not-mapped', tx.path, 'Refund of a security is booked as cash only');

      if (tracking === null) {
        plan.ignored.push({ path: tx.path, reason: 'account ignored' });
        continue;
      }
      const peer = tx.crossEntry?.peerUuid ?? null;
      const legTrade =
        (tx.type === 'BUY' || tx.type === 'SELL') &&
        peer !== null &&
        ['buy', 'sell'].includes(tradeKindOf.get(ppKey(peer)) ?? '');
      plan.bookings.push({
        importKey: ppKey(tx.uuid),
        accountId: tracking,
        date: tx.date,
        amountCents: SIGN[tx.type] * tx.amountCents,
        currency: tx.currency,
        ppType: tx.type,
        securityPpUuid: tx.securityUuid,
        note: tx.note,
        tradeImportKey: legTrade && peer !== null ? ppKey(peer) : null,
        viaTrade: viaTrade || legTrade,
        ppAccountUuid: acc.uuid,
        counterpartKey:
          (tx.type === 'TRANSFER_IN' || tx.type === 'TRANSFER_OUT') && peer !== null
            ? ppKey(peer)
            : null,
      });
    }
  }
  plan.problems.unshift(...model.problems);
  return plan;
}
