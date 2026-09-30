import { addMonths, nextMonth } from '@budget/domain';
import type { PlanRow, RegisterRow } from './parse';

/**
 * The raw layer (`docs/migration/ynab-export.md` §Restructure): the parsed rows grouped into
 * bookings (splits), transfer pairs, accounts with proposals, categories and plan cells. Nothing
 * is interpreted beyond what the export says; the mapping does the rest.
 */

export const READY_TO_ASSIGN = 'Inflow: Ready to Assign';
export const CARD_GROUP = 'Credit Card Payments';
export const HIDDEN_GROUP = 'Hidden Categories';
const TRANSFER = 'Transfer : ';

/** Categories are matched on trimmed names; the names themselves stay as exported. */
export const categoryKey = (group: string, category: string): string =>
  `${group.trim()}: ${category.trim()}`;

export interface Problem {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** Line numbers in the file (Register.tsv unless the code starts with `plan.`). */
  lines: number[];
}

export type SystemPayee = 'opening_balance' | 'reconciliation_adjustment' | 'manual_adjustment';
const SYSTEM_PAYEES: Record<string, SystemPayee> = {
  'Starting Balance': 'opening_balance',
  'Reconciliation Balance Adjustment': 'reconciliation_adjustment',
  'Manual Balance Adjustment': 'manual_adjustment',
};

export interface RawSplit {
  line: number;
  payee: string;
  /** `null` for uncategorised rows; `READY_TO_ASSIGN` for income. */
  categoryKey: string | null;
  /** Without the `Split (i/n) ` prefix. */
  memo: string;
  amountCents: number;
  /** The other account of a transfer leg. */
  transferAccount: string | null;
  /** Shared by both legs once paired. */
  transferId: string | null;
}

export interface RawBooking {
  id: string;
  line: number;
  account: string;
  date: string;
  payee: string;
  systemPayee: SystemPayee | null;
  flag: RegisterRow['flag'];
  cleared: RegisterRow['cleared'];
  memo: string;
  amountCents: number;
  splits: RawSplit[];
}

export interface RawAccount {
  name: string;
  firstDate: string;
  lastDate: string;
  rows: number;
  balanceCents: number;
  startingBalance: { date: string; amountCents: number } | null;
  /** Heuristic proposals for the wizard; the owner confirms them in the mapping. */
  proposal: {
    onBudget: boolean;
    creditCard: boolean;
    type: 'checking' | 'credit_card' | 'loan' | 'other_asset';
    closedAt: string | null;
  };
}

/** Amount and due day (and month, for yearly payments) from a bracketed note in a name. */
export interface Note {
  amountCents: number;
  day: number;
  month: number | null;
}

export interface RawCategory {
  key: string;
  group: string;
  name: string;
  hidden: boolean;
  /** Account name for a category in `Credit Card Payments`. */
  cardAccount: string | null;
  note: Note | null;
}

export interface PlanCell {
  assignedCents: number;
  activityCents: number;
  availableCents: number;
}

export interface RawModel {
  accounts: RawAccount[];
  categories: RawCategory[];
  bookings: RawBooking[];
  /** Plan months, consecutive and ascending. */
  months: string[];
  plan: Record<string, Record<string, PlanCell>>;
  problems: Problem[];
}

const NOTE =
  /\[\s*€\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:-\s*)?am\s*(\d{1,2})\.(?:(\d{1,2})\.)?\s*\]/;
/** `Streaming - [€ 7,49 am 03.]` → 749 cents on day 3; `[€ 980 - am 01.11.]` → yearly on 1 Nov. */
export function parseNote(name: string): Note | null {
  const m = NOTE.exec(name);
  if (!m) return null;
  const euros = Number((m[1] as string).replaceAll('.', ''));
  const day = Number(m[3]);
  const month = m[4] ? Number(m[4]) : null;
  if (day < 1 || day > 31 || (month !== null && (month < 1 || month > 12))) return null;
  return { amountCents: euros * 100 + Number((m[2] ?? '0').padEnd(2, '0')), day, month };
}

/** The name without a trailing bracketed note (`Strom - [€ 85 am 05.]` → `Strom`). */
export const stripNote = (name: string): string => name.replace(/\s*-?\s*\[[^\]]*\]\s*$/, '');

/** Group the rows into the raw model. Problems are collected, not thrown. */
export function buildModel(register: readonly RegisterRow[], plan: readonly PlanRow[]): RawModel {
  const problems: Problem[] = [];
  const problem = (severity: Problem['severity'], code: string, message: string, lines: number[]) =>
    problems.push({ severity, code, message, lines });

  // Splits: consecutive `Split (i/n)` rows of one account and date form one booking.
  const bookings: RawBooking[] = [];
  let open: { booking: RawBooking; n: number } | null = null;
  const abandon = () => {
    if (!open) return;
    const lines = open.booking.splits.map((s) => s.line);
    problem('error', 'split.incomplete', `Split with ${lines.length} of ${open.n} rows`, lines);
    open = null;
  };
  for (const r of register) {
    const m = /^Split \((\d+)\/(\d+)\)(?: ([\s\S]*))?$/.exec(r.memo);
    const split: RawSplit = {
      line: r.line,
      payee: r.payee,
      categoryKey: r.category ? categoryKey(r.group, r.category) : null,
      memo: m ? (m[3] ?? '') : r.memo,
      amountCents: r.amountCents,
      transferAccount: r.payee.startsWith(TRANSFER) ? r.payee.slice(TRANSFER.length) : null,
      transferId: null,
    };
    const booking = (memo: string): RawBooking => ({
      id: `r${r.line}`,
      line: r.line,
      account: r.account,
      date: r.date,
      payee: r.payee,
      systemPayee: SYSTEM_PAYEES[r.payee] ?? null,
      flag: r.flag,
      cleared: r.cleared,
      memo,
      amountCents: r.amountCents,
      splits: [split],
    });
    if (!m) {
      abandon();
      bookings.push(booking(r.memo));
      continue;
    }
    const [i, n] = [Number(m[1]), Number(m[2])];
    if (i === 1 && n >= 2) {
      abandon();
      open = { booking: booking(''), n };
    } else if (
      open &&
      i === open.booking.splits.length + 1 &&
      n === open.n &&
      r.account === open.booking.account &&
      r.date === open.booking.date
    ) {
      open.booking.splits.push(split);
      open.booking.amountCents += split.amountCents;
    } else {
      abandon();
      problem('error', 'split.sequence', `Split row ${i}/${n} out of sequence`, [r.line]);
      continue;
    }
    if (open.booking.splits.length === open.n) {
      bookings.push(open.booking);
      open = null;
    }
  }
  abandon();

  // Transfers: pair legs by (account pair, date, opposite amount) in file order.
  const names = new Set(register.map((r) => r.account));
  const waiting = new Map<string, RawSplit[]>();
  for (const b of bookings)
    for (const s of b.splits) {
      if (s.transferAccount === null) continue;
      if (!names.has(s.transferAccount)) {
        problem('error', 'transfer.unknown_account', 'Transfer to an account without rows', [
          s.line,
        ]);
        continue;
      }
      const pair = [b.account, s.transferAccount].sort().join('\u0000');
      const other = `${pair}|${b.date}|${s.transferAccount}|${-s.amountCents}`;
      const match = waiting.get(other)?.shift();
      if (match) {
        match.transferId = s.transferId = `t${match.line}-${s.line}`;
        if (waiting.get(other)?.length === 0) waiting.delete(other);
      } else {
        const own = `${pair}|${b.date}|${b.account}|${s.amountCents}`;
        waiting.set(own, [...(waiting.get(own) ?? []), s]);
      }
    }
  for (const legs of waiting.values())
    for (const s of legs)
      problem('error', 'transfer.unpaired', 'Transfer leg without its other leg', [s.line]);

  // Categories and plan cells.
  const categories = new Map<string, RawCategory>();
  const addCategory = (group: string, name: string) => {
    const key = categoryKey(group, name);
    if (!categories.has(key))
      categories.set(key, {
        key,
        group,
        name,
        hidden: group.trim() === HIDDEN_GROUP,
        cardAccount: group.trim() === CARD_GROUP ? name.trim() : null,
        note: parseNote(name),
      });
    return key;
  };
  const cells: RawModel['plan'] = {};
  for (const p of plan) {
    if (p.group.trim() === 'Inflow') continue;
    const key = addCategory(p.group, p.category);
    const month = (cells[p.month] ??= {});
    if (month[key]) problem('error', 'plan.duplicate', 'Category twice in one month', [p.line]);
    month[key] = {
      assignedCents: p.assignedCents,
      activityCents: p.activityCents,
      availableCents: p.availableCents,
    };
  }
  const months = Object.keys(cells).sort();
  months.forEach((m, i) => {
    if (i > 0 && nextMonth(months[i - 1] as string) !== m)
      problem('error', 'plan.gap', `Plan months jump from ${months[i - 1]} to ${m}`, []);
  });
  for (const r of register)
    if (r.category && categoryKey(r.group, r.category) !== READY_TO_ASSIGN) {
      const key = categoryKey(r.group, r.category);
      if (!categories.has(key))
        problem('warning', 'category.not_in_plan', 'Category missing in Plan.tsv', [r.line]);
      addCategory(r.group, r.category);
    }
  const cards = new Set(
    [...categories.values()].map((c) => c.cardAccount).filter((c) => c !== null),
  );
  for (const card of cards)
    if (!names.has(card))
      problem('warning', 'card.unknown_account', 'Card payment category without its account', []);

  // Accounts with proposals.
  const latest = register.reduce((a, r) => (r.date > a ? r.date : a), '');
  const closedBefore = latest ? addMonths(latest.slice(0, 7), -3) : '';
  const accounts = new Map<string, RawAccount & { categorised: boolean }>();
  for (const b of bookings) {
    let a = accounts.get(b.account);
    if (!a) {
      a = {
        name: b.account,
        firstDate: b.date,
        lastDate: b.date,
        rows: 0,
        balanceCents: 0,
        startingBalance: null,
        categorised: false,
        proposal: { onBudget: false, creditCard: false, type: 'checking', closedAt: null },
      };
      accounts.set(b.account, a);
    }
    if (b.date < a.firstDate) a.firstDate = b.date;
    if (b.date > a.lastDate) a.lastDate = b.date;
    a.rows += b.splits.length;
    a.balanceCents += b.amountCents;
    if (b.systemPayee === 'opening_balance') {
      if (a.startingBalance)
        problem('warning', 'account.starting_balance', 'Second Starting Balance', [b.line]);
      else a.startingBalance = { date: b.date, amountCents: b.amountCents };
    }
    if (b.splits.some((s) => s.transferAccount === null && s.categoryKey !== null))
      a.categorised = true;
  }
  const out: RawAccount[] = [...accounts.values()].map(({ categorised, ...a }) => {
    const creditCard = cards.has(a.name);
    const closed = a.balanceCents === 0 && a.lastDate.slice(0, 7) < closedBefore;
    return {
      ...a,
      proposal: {
        onBudget: categorised,
        creditCard,
        type: creditCard
          ? 'credit_card'
          : categorised
            ? 'checking'
            : a.balanceCents < 0
              ? 'loan'
              : 'other_asset',
        closedAt: closed ? a.lastDate : null,
      },
    };
  });
  return {
    accounts: out,
    categories: [...categories.values()],
    bookings,
    months,
    plan: cells,
    problems,
  };
}
