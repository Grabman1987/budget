import {
  CATS,
  LOAN,
  PRODUCTS,
  PROJECTS,
  TICKET,
  referenceModel,
  type RefCategory,
  type RefMonth,
} from '../reference/model';
import {
  ACC,
  ACCOUNT_OF_PRODUCT,
  CARD_PAYEES,
  catId,
  payeeId,
  projectId,
  projectPayee,
  securityId,
} from './master-data';
import { INCOME_TYPES } from '@budget/db/schema';
import { allocate, cents, hash, isoDate, lastDayOfMonth, seeded } from './util';

const INCOME = {
  salary: INCOME_TYPES.salary.id,
  special: INCOME_TYPES.special.id,
  contribution: INCOME_TYPES.contribution.id,
  side: INCOME_TYPES.side.id,
  capital: INCOME_TYPES.capital.id,
  refund: INCOME_TYPES.refund.id,
  gift: INCOME_TYPES.gift.id,
};

/** A booking before ids are assigned. Transfers are two drafts with the same `transferKey`. */
export interface Draft {
  seq: number;
  date: string;
  accountId: string;
  amountCents: number;
  payeeId?: string;
  memo?: string;
  splits: Array<{
    categoryId: string | null;
    amountCents: number;
    incomeTypeId?: string;
    memo?: string;
  }>;
  projectId?: string;
  original?: { cents: number; currency: string; rateMicro: number };
  transferKey?: string;
  /** Set on investment buys: the trade that settles with this booking. */
  tradeKey?: string;
  /** Account currency when it is not EUR. */
  currency?: string;
  /** Soft-deleted (the booking exists but every read ignores it). */
  deletedAt?: string;
}

/** Products in the order used for allocation, and their share of a contribution. */
export const PRODUCT_SHARES = PRODUCTS.map((p) => p.share);

export const monthEnd = (m: RefMonth): string =>
  m.partial ? isoDate(m.y, m.m, 17) : isoDate(m.y, m.m, 31);
export const clampDay = (m: RefMonth, day: number): number => (m.partial ? Math.min(day, 17) : day);

export interface Contribution {
  k: number;
  date: string;
  component: 'regular' | 'windfall';
  /** Cents per product (same order as PRODUCTS). */
  perProduct: number[];
}

export interface CashflowResult {
  drafts: Draft[];
  contributions: Contribution[];
  /** Total interest of the loan per month, cents (charged on the loan account). */
  interestCents: number[];
}

/** Everything that moves money on the accounts, month by month, as integer-cent drafts. */
export function buildCashflow(): CashflowResult {
  const ref = referenceModel();
  const drafts: Draft[] = [];
  const contributions: Contribution[] = [];
  let seq = 0;
  let transferNo = 0;

  const add = (d: Omit<Draft, 'seq'>) => {
    drafts.push({ seq: seq++, ...d });
  };
  const addTransfer = (opts: {
    date: string;
    from: string;
    to: string;
    cents: number;
    categoryId?: string;
    memo?: string;
    payee?: string;
    tradeKey?: string;
  }) => {
    const transferKey = `t${transferNo++}`;
    add({
      date: opts.date,
      accountId: opts.from,
      amountCents: -opts.cents,
      ...(opts.payee ? { payeeId: opts.payee } : {}),
      ...(opts.memo ? { memo: opts.memo } : {}),
      splits: [{ categoryId: opts.categoryId ?? null, amountCents: -opts.cents }],
      transferKey,
    });
    add({
      date: opts.date,
      accountId: opts.to,
      amountCents: opts.cents,
      ...(opts.memo ? { memo: opts.memo } : {}),
      splits: [{ categoryId: null, amountCents: opts.cents }],
      transferKey,
    });
  };
  const accountOfPayee = (name: string) => (CARD_PAYEES.has(name) ? ACC.karte : ACC.giro);

  const interestCents: number[] = [];
  const cardTotals: number[] = [];

  for (const m of ref.months) {
    const k = m.k;
    const spend = ref.spend[k] as Record<string, number>;
    const income = ref.income[k] as Record<string, number>;
    const proj = ref.proj[k];
    const date = (day: number) => isoDate(m.y, m.m, clampDay(m, day));
    cardTotals[k] = 0;
    const purchase = (d: Omit<Draft, 'seq'>) => {
      add(d);
      if (d.accountId === ACC.karte) cardTotals[k] = (cardTotals[k] ?? 0) - d.amountCents;
    };

    // ---------- Income ----------
    if ((income['Gehalt'] ?? 0) > 0) {
      add({
        date: isoDate(m.y, m.m, 30),
        accountId: ACC.giro,
        amountCents: cents(income['Gehalt'] as number),
        payeeId: payeeId('Arbeitgeber'),
        memo: 'Gehalt',
        splits: [
          {
            categoryId: null,
            amountCents: cents(income['Gehalt'] as number),
            incomeTypeId: INCOME.salary,
          },
        ],
      });
    }
    if ((income['Sonderzahlung'] ?? 0) > 0) {
      const c = cents(income['Sonderzahlung'] as number);
      add({
        date: date(15),
        accountId: ACC.giro,
        amountCents: c,
        payeeId: payeeId('Arbeitgeber'),
        memo: 'Sonderzahlung',
        splits: [{ categoryId: null, amountCents: c, incomeTypeId: INCOME.special }],
      });
    }
    if ((income['Beiträge von Kontakten'] ?? 0) > 0) {
      const c = cents(income['Beiträge von Kontakten'] as number);
      add({
        date: date(1),
        accountId: ACC.giro,
        amountCents: c,
        payeeId: payeeId('Kontakt M. Muster'),
        memo: 'Beitrag zum Haushalt',
        splits: [{ categoryId: null, amountCents: c, incomeTypeId: INCOME.contribution }],
      });
    }
    for (const p of PROJECTS) {
      const row = proj?.[p.id as 'trading' | 'kurse' | 'orgel'];
      if (row && row.inc > 0) {
        const c = cents(row.inc);
        add({
          date: date(20),
          accountId: ACC.giro,
          amountCents: c,
          payeeId: payeeId(projectPayee(p.id)),
          memo: p.name,
          projectId: projectId(p.id),
          splits: [{ categoryId: null, amountCents: c, incomeTypeId: INCOME.side }],
        });
      }
    }
    if ((income['Kapitalerträge'] ?? 0) > 0) {
      const c = cents(income['Kapitalerträge'] as number);
      add({
        date: date(15),
        accountId: ACC.tagesgeld,
        amountCents: c,
        payeeId: payeeId('Bank B'),
        memo: 'Zinsen und Ausschüttungen',
        splits: [{ categoryId: null, amountCents: c, incomeTypeId: INCOME.capital }],
      });
    }
    if ((income['Erstattungen'] ?? 0) > 0) {
      const c = cents(income['Erstattungen'] as number);
      add({
        date: date(12),
        accountId: ACC.giro,
        amountCents: c,
        payeeId: payeeId('Versicherung G'),
        memo: 'Erstattung',
        splits: [{ categoryId: null, amountCents: c, incomeTypeId: INCOME.refund }],
      });
    }
    if ((income['Geschenke'] ?? 0) > 0) {
      const c = cents(income['Geschenke'] as number);
      add({
        date: date(24),
        accountId: ACC.giro,
        amountCents: c,
        payeeId: payeeId('Verwandtschaft'),
        memo: 'Geldgeschenk',
        splits: [{ categoryId: null, amountCents: c, incomeTypeId: INCOME.gift }],
      });
    }

    // ---------- Fixed costs, project costs, periodic costs ----------
    for (const c of CATS) {
      const euros = spend[c.id] as number;
      const total = cents(euros);
      if (total <= 0) continue;
      if (c.kind === 'fix' && !c.transfer && c.id !== 'kreditrate') {
        const payee = c.payee as string;
        const original = c.usd
          ? {
              cents: -cents(ref.usdAt(c, m.key)),
              currency: 'USD',
              rateMicro: Math.round(ref.fxAt(m.key) * 1e6),
            }
          : undefined;
        purchase({
          date: isoDate(m.y, m.m, c.due ?? 1),
          accountId: accountOfPayee(payee),
          amountCents: -total,
          payeeId: payeeId(payee),
          memo: c.name,
          splits: [{ categoryId: catId(c.id), amountCents: -total }],
          ...(original ? { original } : {}),
        });
      } else if (c.kind === 'project') {
        for (const p of PROJECTS) {
          const row = proj?.[p.id as 'trading' | 'kurse' | 'orgel'];
          if (!row || row.cost <= 0) continue;
          const cc = cents(row.cost);
          purchase({
            date: date(10),
            accountId: ACC.giro,
            amountCents: -cc,
            payeeId: payeeId(projectPayee(p.id)),
            memo: `${p.name}: Kosten`,
            projectId: projectId(p.id),
            splits: [{ categoryId: catId(c.id), amountCents: -cc }],
          });
        }
      } else if (c.kind === 'periodic') {
        const payee = c.payee as string;
        purchase({
          date: date(12),
          accountId: accountOfPayee(payee),
          amountCents: -total,
          payeeId: payeeId(payee),
          memo: c.name,
          splits: [{ categoryId: catId(c.id), amountCents: -total }],
        });
      } else if (c.kind === 'var') {
        variableBookings(c, m, total).forEach(purchase);
      }
    }

    // ---------- Loan: rate and extra repayment are transfers with a category, interest is charged on the loan ----------
    const pmt = LOAN.pmt * 100;
    addTransfer({
      date: isoDate(m.y, m.m, 3),
      from: ACC.giro,
      to: ACC.kredit,
      cents: pmt,
      categoryId: catId('kreditrate'),
      memo: 'Kreditrate',
      payee: payeeId('Bank F'),
    });
    const extra = cents(spend['sondertilgung'] as number);
    if (extra > 0)
      addTransfer({
        date: isoDate(m.y, m.m, 3),
        from: ACC.giro,
        to: ACC.kredit,
        cents: extra,
        categoryId: catId('sondertilgung'),
        memo: 'Sondertilgung',
        payee: payeeId('Bank F'),
      });
    const interest = cents((ref.loanh[k] as { interest: number }).interest);
    interestCents[k] = interest;
    add({
      date: monthEnd(m),
      accountId: ACC.kredit,
      amountCents: -interest,
      payeeId: payeeId('Bank F'),
      memo: 'Sollzinsen',
      splits: [{ categoryId: catId('bankspesen'), amountCents: -interest }],
    });

    // ---------- Notgroschen ----------
    const notRegular = cents(
      ref.priceAt(CATS.find((c) => c.id === 'notgroschen') as RefCategory, m.key),
    );
    const notTotal = cents(spend['notgroschen'] as number);
    if (notRegular > 0)
      addTransfer({
        date: isoDate(m.y, m.m, 16),
        from: ACC.giro,
        to: ACC.tagesgeld,
        cents: notRegular,
        categoryId: catId('notgroschen'),
        memo: 'Notgroschen',
      });
    if (notTotal - notRegular > 0)
      addTransfer({
        date: date(15),
        from: ACC.giro,
        to: ACC.tagesgeld,
        cents: notTotal - notRegular,
        categoryId: catId('notgroschen'),
        memo: 'Notgroschen aus Sonderzahlung',
      });

    // ---------- Investieren: regular and windfall transfers, split over the products by share ----------
    const invCat = CATS.find((c) => c.id === 'investieren') as RefCategory;
    const invRegular = cents(ref.priceAt(invCat, m.key));
    const invTotal = cents(spend['investieren'] as number);
    for (const [component, amount, day] of [
      ['regular', invRegular, 5],
      ['windfall', invTotal - invRegular, 15],
    ] as const) {
      if (amount <= 0) continue;
      const perProduct = allocate(amount, PRODUCT_SHARES);
      contributions.push({ k, date: date(day), component, perProduct });
      const byAccount = new Map<string, number>();
      PRODUCTS.forEach((p, i) => {
        const acc = ACCOUNT_OF_PRODUCT[p.id] as string;
        byAccount.set(acc, (byAccount.get(acc) ?? 0) + (perProduct[i] ?? 0));
      });
      for (const [acc, sum] of byAccount) {
        if (sum <= 0) continue;
        addTransfer({
          date: date(day),
          from: ACC.giro,
          to: acc,
          cents: sum,
          categoryId: catId('investieren'),
          memo: component === 'regular' ? 'ETF-Sparplan' : 'Investieren aus Sonderzahlung',
        });
      }
    }
  }

  // ---------- Credit card settlement: the previous month's purchases on the 3rd ----------
  for (const m of ref.months) {
    const prev = cardTotals[m.k - 1];
    if (m.k > 0 && prev && prev > 0)
      addTransfer({
        date: isoDate(m.y, m.m, 3),
        from: ACC.giro,
        to: ACC.karte,
        cents: prev,
        memo: 'Kreditkartenabrechnung',
      });
  }

  return { drafts, contributions, interestCents };

  /** Variable spend of one category: bookings per payee with ticket sizes near the prototype's receipts. */
  function variableBookings(c: RefCategory, m: RefMonth, total: number): Array<Omit<Draft, 'seq'>> {
    const out: Array<Omit<Draft, 'seq'>> = [];
    const payees = c.payees as Array<[string, number]>;
    const shares = allocate(
      total,
      payees.map(([, s]) => s),
    );
    const maxDay = m.partial ? 17 : lastDayOfMonth(m.y, m.m);
    payees.forEach(([name], i) => {
      const payeeCents = shares[i] ?? 0;
      if (payeeCents <= 0) return;
      const rnd = seeded(hash(`${m.k}|${c.id}|${name}`));
      const n = Math.min(
        payeeCents,
        Math.max(1, Math.round(payeeCents / 100 / (TICKET[name] ?? 30))),
      );
      const parts = allocate(
        payeeCents,
        Array.from({ length: n }, () => 0.5 + rnd()),
      );
      parts.forEach((part) => {
        const day = 1 + Math.floor(rnd() * maxDay);
        out.push({
          date: isoDate(m.y, m.m, day),
          accountId: accountOfPayee(name),
          amountCents: -part,
          payeeId: payeeId(name),
          splits: [{ categoryId: catId(c.id), amountCents: -part }],
        });
      });
    });
    return out;
  }
}

/**
 * Some online orders contain items of two categories: pairs of consecutive "Online-Händler"
 * bookings of one month become one booking with two splits (same total, same categories).
 */
export function mergeOnlineOrders(drafts: Draft[]): Draft[] {
  const shop = payeeId('Online-Händler');
  const byMonth = new Map<string, Draft[]>();
  for (const d of drafts) {
    if (d.payeeId === shop && d.splits.length === 1 && !d.transferKey && d.splits[0]?.categoryId) {
      const list = byMonth.get(d.date.slice(0, 7)) ?? [];
      list.push(d);
      byMonth.set(d.date.slice(0, 7), list);
    }
  }
  const removed = new Set<Draft>();
  for (const [month, list] of byMonth) {
    const rnd = seeded(hash(`merge|${month}`));
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i] as Draft;
      const b = list[i + 1] as Draft;
      if (removed.has(a) || removed.has(b) || a.accountId !== b.accountId) continue;
      if (a.splits[0]?.categoryId === b.splits[0]?.categoryId || rnd() > 0.6) continue;
      a.splits.push(...b.splits);
      a.amountCents += b.amountCents;
      a.memo = 'Online-Bestellung';
      removed.add(b);
    }
  }
  return drafts.filter((d) => !removed.has(d));
}

export { securityId };
