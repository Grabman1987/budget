import {
  addMonths,
  addDays,
  allocation,
  bookWindow,
  lastDayOfMonth,
  monthOf,
  monthsBetween,
  resolveParams,
  toEurCents,
  type BookRuleInputs,
} from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  employerPension,
  INCOME_TYPES,
  payslip,
  rule,
  trade,
} from '../schema';
import { allocationMonth } from './allocation';
import { getBookSettings } from './book-settings';
import { cashSeries, holdingValuesAsOf, valuationSeries, type NetWorth } from './portfolio';
import { accountBalances } from './queries';
import { MissingFxRateError } from './errors';
import { fxRateOnOrBefore } from './prices';
import type { RuleFacts } from './rule-inputs';

const loanBalanceCache = new WeakMap<RuleFacts, Map<string, Map<string, number>>>();

/**
 * EUR balance of every loan account on a day. Only the loan ledgers are read (no position
 * valuation), and the result is shared by every evaluation day that uses the same facts: the
 * Verlauf evaluates 13 days on one fact set whose 12-month windows overlap.
 */
function loanBalancesOn(f: RuleFacts, day: string): Map<string, number> {
  const perFacts = loanBalanceCache.get(f) ?? new Map<string, Map<string, number>>();
  loanBalanceCache.set(f, perFacts);
  const cached = perFacts.get(day);
  if (cached) return cached;
  const loans = new Map(f.accounts.filter((a) => a.type === 'loan').map((a) => [a.id, a]));
  const out = new Map<string, number>();
  for (const b of accountBalances(f.db, day)) {
    const loan = loans.get(b.accountId);
    if (!loan) continue;
    if (loan.currency === 'EUR' || b.balanceCents === 0) {
      out.set(loan.id, b.balanceCents);
      continue;
    }
    const rate = fxRateOnOrBefore(f.db, loan.currency, day);
    if (!rate) throw new MissingFxRateError(loan.currency, day);
    out.set(loan.id, toEurCents(b.balanceCents, rate.rateMicro));
  }
  perFacts.set(day, out);
  return out;
}

/** Book rules use stored sources only, clipped to the evaluated day; never today's balances in history. */
export function bookInputs(
  f: RuleFacts,
  asOf: string,
  ref: string,
  nw: NetWorth,
  preview = false,
): BookRuleInputs {
  const db = f.db;
  const accounts = f.accounts.filter((a) => a.openingDate <= asOf);
  const investment = new Set(accounts.filter((a) => a.role === 'investment').map((a) => a.id));
  const reference = new Set(
    accounts
      .filter((a) => investment.has(a.id))
      .flatMap((a) => (a.referenceAccountId ? [a.referenceAccountId] : [])),
  );
  const inside = new Set([...investment, ...reference]);
  const budgetIds = new Set(
    accounts.filter((a) => a.onBudget && !inside.has(a.id)).map((a) => a.id),
  );
  const window = bookWindow(asOf);
  const bookings = db.select().from(booking).where(isNull(booking.deletedAt)).all();
  const byBooking = new Map(bookings.map((b) => [b.id, b]));
  const trades = db
    .select()
    .from(trade)
    .where(isNull(trade.deletedAt))
    .all()
    .filter((t) => inside.has(t.accountId) && t.date <= asOf);
  let flowUnavailableReason: string | null = null;
  const eur = (cents: number, currency: string, day: string): number | null => {
    if (currency === 'EUR' || cents === 0) return cents;
    const rate = fxRateOnOrBefore(db, currency, day);
    if (!rate) {
      flowUnavailableReason = 'Wechselkurs für Anlagebewegungen fehlt im Fenster.';
      return null;
    }
    return toEurCents(cents, rate.rateMicro);
  };
  // Budget-side transfer splits are EUR and counted once, including withdrawals with a negative sign.
  const investmentFlows = f.ledgerSplits
    .filter(
      (s) =>
        s.date <= asOf &&
        budgetIds.has(s.accountId) &&
        s.transferAccountId !== null &&
        inside.has(s.transferAccountId!) &&
        s.date >= (accounts.find((a) => a.id === s.accountId)?.openingDate ?? asOf),
    )
    .map((s) => ({ day: s.date, cents: -s.amountCents }));
  // Deliveries use the existing wealth-flow convention. Buys and reinvested income are internal.
  for (const t of trades.filter(
    (t) => t.date >= window.from && (t.kind === 'delivery_in' || t.kind === 'delivery_out'),
  )) {
    const a = accounts.find((a) => a.id === t.accountId);
    if (!a || t.date < a.openingDate) continue;
    const value = eur(t.amountCents, a.currency, t.date);
    if (value !== null)
      investmentFlows.push({ day: t.date, cents: t.kind === 'delivery_in' ? value : -value });
  }
  const income = db
    .select({
      day: booking.date,
      cents: bookingSplit.amountCents,
      type: bookingSplit.incomeTypeId,
      currency: booking.currency,
      accountId: booking.accountId,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(account.deletedAt),
        isNull(booking.transferId),
        isNull(bookingSplit.transferId),
      ),
    )
    .all()
    .filter(
      (s) =>
        s.day >= window.from &&
        s.day <= asOf &&
        s.cents > 0 &&
        s.day >= (accounts.find((a) => a.id === s.accountId)?.openingDate ?? asOf),
    );
  const incomeOf = (type: string) =>
    income
      .filter((s) => s.type === type)
      .flatMap((s) => {
        const value = eur(s.cents, s.currency, s.day);
        return value === null ? [] : [{ day: s.day, cents: value }];
      });
  const assignments = monthsBetween(addMonths(ref, -23), ref).flatMap((month) => {
    const budget = f.budgetByMonth.get(month);
    if (!budget) return [];
    const alloc = f.allocByMonth.get(month) ?? allocationMonth(db, month, budget.envelopes);
    f.allocByMonth.set(month, alloc);
    const a = allocation([alloc]);
    return [{ month, incomeCents: a.incomeCents, futureCents: a.futureCents }];
  });
  const rateParams = db.select().from(rule).where(eq(rule.code, 'R09')).get();
  const debtPriorityRateBp = Number(
    resolveParams('R09', rateParams?.paramsJson ? JSON.parse(rateParams.paramsJson) : {})['rateBp'],
  );
  const activity = monthsBetween(addMonths(ref, -11), ref).map((month) => {
    const day = lastDayOfMonth(month);
    // Repayment priority is assessed before this month's repayment, including a final payoff.
    const first = `${month}-01`;
    const historical = accounts.some((a) => a.type === 'loan')
      ? loanBalancesOn(f, addDays(first, -1))
      : null;
    const debtCategories = f.categories.filter((c) => c.kind === 'debt' && (c.stage ?? 1) > 1);
    const extraRepaymentCents = Math.max(
      0,
      debtCategories.reduce(
        (s, c) => s - (f.budgetByMonth.get(month)?.envelopes[c.id]?.activityCents ?? 0),
        0,
      ),
    );
    return {
      month,
      bought: trades.some((t) => t.kind === 'buy' && monthOf(t.date) === month),
      deposited: investmentFlows.some((s) => monthOf(s.day) === month && s.cents > 0),
      extraRepaymentCents,
      loans: accounts
        .filter(
          (a) =>
            a.type === 'loan' &&
            a.openingDate <= day &&
            (a.closedAt === null || a.closedAt >= first),
        )
        .map((a) => ({
          balanceCents: Math.max(
            0,
            -(a.openingDate >= first ? a.openingBalanceCents : (historical?.get(a.id) ?? 0)),
          ),
          rateBp: a.interestRateBp ?? 0,
        })),
    };
  });
  const positions = holdingValuesAsOf(db, asOf)
    .filter((h) => investment.has(h.accountId))
    .flatMap((h) => {
      const s = f.securities.get(h.securityId);
      return s
        ? [
            {
              securityId: s.id,
              name: s.name,
              kind: s.kind,
              valueCents: h.valueCents,
              leverageFactor: s.leverageFactor,
              terBp: s.terBp,
            },
          ]
        : [];
    });
  const fees = trades
    .filter((t) => t.date >= window.from)
    .map((t) =>
      eur(
        t.feeCents + (t.kind === 'fee' ? t.amountCents : 0),
        accounts.find((a) => a.id === t.accountId)?.currency ?? 'EUR',
        t.date,
      ),
    );
  // Display-only fee ratio: the same daily portfolio valuation as wealth reports, with no future prices.
  let averagePortfolioCents: number | null = null;
  const r22 = db.select().from(rule).where(eq(rule.code, 'R22')).get();
  if ((preview || r22?.enabled) && f.firstMonth <= monthOf(window.from)) {
    try {
      const series = valuationSeries(db, {
        from: window.from,
        to: asOf,
        accounts: [...investment],
      });
      averagePortfolioCents = series.totalCents.length
        ? Number(
            (series.totalCents.reduce((s, n) => s + BigInt(n), 0n) +
              BigInt(Math.floor(series.totalCents.length / 2))) /
              BigInt(series.totalCents.length),
          )
        : null;
    } catch {
      /* An incomplete historical valuation only withholds the display-only fee ratio. */
    }
  }
  const cash = cashSeries(db, [asOf], [...inside]);
  const settings = getBookSettings(db);
  return {
    firstMonth: f.firstMonth,
    payslips: db
      .select()
      .from(payslip)
      .where(isNull(payslip.deletedAt))
      .all()
      .flatMap((p) => {
        const day =
          (p.bookingId ? byBooking.get(p.bookingId)?.date : undefined) ?? lastDayOfMonth(p.month);
        return day <= asOf ? [{ month: p.month, day, grossCents: p.grossCents }] : [];
      }),
    investmentFlows,
    employerPension: db
      .select()
      .from(employerPension)
      .where(isNull(employerPension.deletedAt))
      .all()
      .map((r) => ({ month: r.month, cents: r.amountCents })),
    birthMonth: settings.birthMonth || null,
    netWorthCents: nw.totalCents,
    sideIncome: incomeOf(INCOME_TYPES.side.id),
    capitalIncome: incomeOf(INCOME_TYPES.capital.id),
    assignments,
    activity,
    debtPriorityRateBp,
    positions,
    investmentValueCents:
      positions.reduce((s, p) => s + p.valueCents, 0) +
      [...cash.values()].reduce((s, v) => s + Math.max(0, v[0] ?? 0), 0),
    platformBalances: accounts
      .filter((a) => inside.has(a.id) && a.type !== 'loan')
      .map((a) => ({ id: a.id, balanceCents: cash.get(a.id)?.[0] ?? 0 })),
    tradingFeesCents: fees.some((f) => f === null)
      ? null
      : fees.reduce<number>((s, v) => s + (v ?? 0), 0),
    averagePortfolioCents,
    flowUnavailableReason,
  };
}
