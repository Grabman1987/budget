import { daysBetween, nextMonth } from '@budget/domain';
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
  /** The account or category concerned, by index in the raw model and a short hash of its name. */
  subject?: { kind: 'account' | 'category'; index: number; hash: string };
}

/** 8 hex digits (FNV-1a) of a name: identifies it in problems and logs without showing it. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
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
  /** Dated after the export's "as of" day: scheduled, not yet in YNAB's plan or balances. */
  scheduled: boolean;
}

export interface RawAccount {
  name: string;
  firstDate: string;
  /** Last row and balance on the "as of" day (scheduled rows left out). */
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

/** When a bracketed note says the payment is due. */
export type NoteSchedule =
  | { kind: 'monthly'; day: number }
  | { kind: 'last_day' }
  | { kind: 'yearly'; dates: { day: number; month: number }[] }
  | { kind: 'unknown' };

/**
 * A bracketed note in a category name: the amount (`null` when written as `??`) and either a
 * schedule (`am …`) or none, which makes it a monthly target only (`[€ 350,-]`).
 */
export interface Note {
  amountCents: number | null;
  schedule: NoteSchedule | null;
  targetOnly: boolean;
}

export interface RawCategory {
  key: string;
  group: string;
  name: string;
  hidden: boolean;
  /** Account name for a category in `Credit Card Payments`. */
  cardAccount: string | null;
  /** For a hidden category that the register shows under its group: that group. */
  originalGroup: string | null;
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
  /** The export's "as of" day (from the file name); later rows are scheduled. */
  asOf: string | null;
  problems: Problem[];
}

/** `… as of 2026-09-29 18-30 - Register.tsv` → `2026-09-29`. */
export function exportAsOf(fileName: string): string | null {
  return (
    / as of (\d{4}-\d{2}-\d{2}) \d{2}-\d{2} - (?:Register|Plan)\.tsv$/.exec(fileName)?.[1] ?? null
  );
}

const NOTE =
  /^\s*(?:€\s*)?(\?\?|\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}|-))?\s*-?\s*(?:am\s+(.+?))?\s*$/;
const DAY = /^(\d{1,2})\.$/;
const DATE = /^(\d{1,2})\.(\d{1,2})\.$/;
/**
 * The bracketed note of a category name, best effort. Forms: `[€ 350,-]` (target only),
 * `[€ 30,- am 01.]`, `[€ 122- am 01.]`, `[€ 1.809,61 am 01.]` (monthly), `[€ 42,30 am 30./31.]`
 * (last day), `[€ 42,- am 10.01.]`, `[€ 1.500 - am 01.12.]`, `[€ 400,- am 01.02. & 01.08.]`
 * (yearly), `[€ ??,- am 01.]` (amount unknown), `[9,99 am ?]` (day unknown). `null` otherwise.
 */
export function parseNote(name: string): Note | null {
  const m = NOTE.exec(/\[([^\]]*)\]\s*$/.exec(name)?.[1] ?? '');
  if (!m) return null;
  const [, whole, decimals, when] = m as unknown as [string, string, string?, string?];
  const amountCents =
    whole === '??'
      ? null
      : Number(whole.replaceAll('.', '')) * 100 +
        (decimals && decimals !== '-' ? Number(decimals.padEnd(2, '0')) : 0);
  const valid = (day: number, month = 1) => day >= 1 && day <= 31 && month >= 1 && month <= 12;
  let schedule: NoteSchedule | null = null;
  if (when === '?') schedule = { kind: 'unknown' };
  else if (when === '30./31.' || when === 'ultimo') schedule = { kind: 'last_day' };
  else if (when && DAY.test(when)) {
    const day = Number(DAY.exec(when)?.[1]);
    if (!valid(day)) return null;
    schedule = { kind: 'monthly', day };
  } else if (when) {
    const dates = when.split('&').map((d) => DATE.exec(d.trim()));
    if (dates.some((d) => !d || !valid(Number(d[1]), Number(d[2])))) return null;
    schedule = {
      kind: 'yearly',
      dates: dates.map((d) => ({ day: Number(d?.[1]), month: Number(d?.[2]) })),
    };
  }
  return { amountCents, schedule, targetOnly: schedule === null };
}

/** The name without a trailing bracketed note (`Strom - [€ 85 am 05.]` → `Strom`). */
export const stripNote = (name: string): string => name.replace(/\s*-?\s*\[[^\]]*\]\s*$/, '');

/** Group the rows into the raw model. Problems are collected, not thrown. */
export function buildModel(
  register: readonly RegisterRow[],
  plan: readonly PlanRow[],
  options: { asOf?: string | null } = {},
): RawModel {
  const asOf = options.asOf ?? null;
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
      // Account names are matched trimmed, in transfers as everywhere else.
      transferAccount: r.payee.startsWith(TRANSFER) ? r.payee.slice(TRANSFER.length).trim() : null,
      transferId: null,
    };
    const booking = (memo: string): RawBooking => ({
      id: `r${r.line}`,
      line: r.line,
      account: r.account.trim(),
      date: r.date,
      payee: r.payee,
      systemPayee: SYSTEM_PAYEES[r.payee] ?? null,
      flag: r.flag,
      cleared: r.cleared,
      memo,
      amountCents: r.amountCents,
      splits: [split],
      scheduled: asOf !== null && r.date > asOf,
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
      r.account.trim() === open.booking.account &&
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
  const names = new Set(register.map((r) => r.account.trim()));
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
        originalGroup: null,
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
  // A hidden category may appear in the register under its original group (or the other way
  // round): the plan's key wins when exactly one plan category has that name and one is hidden.
  const planKeys = [...categories.values()];
  for (const b of bookings)
    for (const s of b.splits) {
      const key = s.categoryKey;
      if (key === null || key === READY_TO_ASSIGN || categories.has(key)) continue;
      const [group, name] = [key.slice(0, key.indexOf(': ')), key.slice(key.indexOf(': ') + 2)];
      const same = planKeys.filter(
        (c) => c.name.trim() === name && (c.hidden || group === HIDDEN_GROUP),
      );
      if (same.length === 1 && same[0]) {
        s.categoryKey = same[0].key;
        if (same[0].hidden) same[0].originalGroup ??= group;
        continue;
      }
      problem('warning', 'category.not_in_plan', 'Category missing in Plan.tsv', [s.line]);
      const r = register.find((x) => x.line === s.line) as RegisterRow;
      addCategory(r.group, r.category);
    }
  const cards = new Set(
    [...categories.values()].map((c) => c.cardAccount).filter((c) => c !== null),
  );
  for (const card of cards)
    if (!names.has(card))
      problem('warning', 'card.unknown_account', 'Card payment category without its account', []);

  // Accounts with proposals, from the rows up to the "as of" day.
  const today = asOf ?? bookings.reduce((a, b) => (b.date > a ? b.date : a), '1970-01-01');
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
    a.rows += b.splits.length;
    if (b.systemPayee === 'opening_balance') {
      if (a.startingBalance)
        problem('warning', 'account.starting_balance', 'Second Starting Balance', [b.line]);
      else a.startingBalance = { date: b.date, amountCents: b.amountCents };
    }
    if (b.splits.some((s) => s.transferAccount === null && s.categoryKey !== null))
      a.categorised = true;
    if (b.scheduled) continue;
    if (b.date > a.lastDate) a.lastDate = b.date;
    a.balanceCents += b.amountCents;
  }
  const out: RawAccount[] = [...accounts.values()].map(({ categorised, ...a }) => {
    const creditCard = cards.has(a.name);
    // Closed: nothing left and no row in the last 90 days.
    const closed = a.balanceCents === 0 && daysBetween(a.lastDate, today) > 90;
    // A loan starts negative; a paid-off loan is still one. Platforms and depots start positive.
    const loan = (a.startingBalance?.amountCents ?? a.balanceCents) < 0;
    return {
      ...a,
      proposal: {
        onBudget: categorised,
        creditCard,
        type: creditCard ? 'credit_card' : categorised ? 'checking' : loan ? 'loan' : 'other_asset',
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
    asOf,
    problems,
  };
}
