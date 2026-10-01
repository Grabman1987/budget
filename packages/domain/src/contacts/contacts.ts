import { lastDayOfMonth } from '../date';

/**
 * Contacts and their receivables (concept §3.4). A contact split on a booking is a receivable
 * share: money paid for the contact (an outflow split, "Auslage") raises what the contact owes,
 * money repaid by the contact (an inflow split, "Ausgleich") lowers it. All figures here are
 * derived from those splits; the receivable is not a stored balance.
 *
 * Sign convention: `amountCents` of an entry is the split's cash flow (Auslage negative, Ausgleich
 * positive); every result is in the receivable's view (Forderung positive, Verbindlichkeit negative).
 */

/** One contact split of a live booking. */
export interface ContactEntry {
  id: string;
  /** `YYYY-MM-DD` of the booking. */
  date: string;
  /** Cash flow of the split: paid for the contact is negative, repaid by the contact positive. */
  amountCents: number;
  memo?: string | null;
}

/** Stable chronological order: by day, then the given order (the repository sorts by creation). */
const chronological = <T extends { date: string }>(entries: readonly T[]): T[] =>
  entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
    .map((x) => x.entry);

/** The contact's receivable from its splits: −Σ(splits). Negative = the contact has paid ahead. */
export function contactBalanceCents(entries: readonly ContactEntry[]): number {
  let sum = 0;
  for (const e of entries) sum -= e.amountCents;
  return sum;
}

export interface KontoblattRow {
  id: string;
  date: string;
  memo: string | null;
  /** Paid for the contact (+), 0 on a repayment row. */
  auslageCents: number;
  /** Repaid by the contact (+, shown as a deduction), 0 on an Auslage row. */
  ausgleichCents: number;
  /** Receivable after this row. */
  balanceCents: number;
}

/**
 * The Kontoblatt: one row per contact split with Auslage (+), Ausgleich (−) and the running
 * balance. `openingCents` is the receivable before the first row (default 0).
 */
export function kontoblatt(entries: readonly ContactEntry[], openingCents = 0): KontoblattRow[] {
  let balance = openingCents;
  return chronological(entries).map((e) => {
    balance -= e.amountCents;
    return {
      id: e.id,
      date: e.date,
      memo: e.memo ?? null,
      auslageCents: e.amountCents < 0 ? -e.amountCents : 0,
      ausgleichCents: e.amountCents > 0 ? e.amountCents : 0,
      balanceCents: balance,
    };
  });
}

export interface OpenItem {
  /** The Auslage split. */
  id: string;
  date: string;
  memo: string | null;
  /** Size of the Auslage. */
  amountCents: number;
  /** What is still open after the repayments were applied oldest first. */
  openCents: number;
}

export interface OpenItems {
  /** Auslagen with something still open, oldest first. */
  items: OpenItem[];
  /** Σ open amounts of the items. */
  openCents: number;
  /** Repaid beyond all Auslagen: the contact has paid ahead (Verbindlichkeit). */
  creditCents: number;
}

/**
 * Open items, settled FIFO: all repayments together are applied to the oldest Auslagen first, so
 * a repayment never depends on which booking it was entered with. The rest of a partly settled
 * Auslage stays open; repayments beyond all Auslagen are a credit.
 */
export function openItems(entries: readonly ContactEntry[]): OpenItems {
  const ordered = chronological(entries);
  let repaid = 0;
  for (const e of ordered) if (e.amountCents > 0) repaid += e.amountCents;
  const items: OpenItem[] = [];
  let openCents = 0;
  for (const e of ordered) {
    if (e.amountCents >= 0) continue;
    const size = -e.amountCents;
    const settled = Math.min(size, repaid);
    repaid -= settled;
    if (settled < size) {
      items.push({
        id: e.id,
        date: e.date,
        memo: e.memo ?? null,
        amountCents: size,
        openCents: size - settled,
      });
      openCents += size - settled;
    }
  }
  return { items, openCents, creditCents: repaid };
}

export interface Settlement {
  /** How much of each open item the repayment settles, oldest first (items it does not reach are left out). */
  parts: Array<{ id: string; settledCents: number; remainingCents: number }>;
  /** Part of the repayment that exceeds every open item. */
  surplusCents: number;
}

/** What a repayment of `amountCents` would settle on `items`, FIFO. */
export function allocateSettlement(items: readonly OpenItem[], amountCents: number): Settlement {
  let left = Math.max(0, amountCents);
  const parts: Settlement['parts'] = [];
  for (const item of items) {
    if (left === 0) break;
    const settledCents = Math.min(item.openCents, left);
    left -= settledCents;
    parts.push({ id: item.id, settledCents, remainingCents: item.openCents - settledCents });
  }
  return { parts, surplusCents: left };
}

export interface MonthlyStatement {
  /** `YYYY-MM` */
  month: string;
  /** Receivable at the start of the month. */
  openingCents: number;
  /** Auslagen of the month. */
  newCents: number;
  /** Repayments of the month. */
  paidCents: number;
  /** newCents − paidCents: how much the receivable grew (negative: it shrank). */
  differenceCents: number;
  /** Receivable at the end of the month = opening + difference. */
  closingCents: number;
}

/** Monthly statement of `month`: offen am Monatsanfang, neu, bezahlt, Differenz. */
export function monthlyStatement(
  entries: readonly ContactEntry[],
  month: string,
): MonthlyStatement {
  const first = `${month}-01`;
  const last = lastDayOfMonth(month);
  let openingCents = 0;
  let newCents = 0;
  let paidCents = 0;
  for (const e of entries) {
    if (e.date < first) openingCents -= e.amountCents;
    else if (e.date <= last) {
      if (e.amountCents < 0) newCents -= e.amountCents;
      else paidCents += e.amountCents;
    }
  }
  const differenceCents = newCents - paidCents;
  return {
    month,
    openingCents,
    newCents,
    paidCents,
    differenceCents,
    closingCents: openingCents + differenceCents,
  };
}

/** An occurrence of an expected payment of (or through) a contact. */
export interface ContactOccurrence {
  occurrenceId: string;
  paymentId: string;
  name: string;
  /** The contact of the payment (or of its payee). */
  contactId: string | null;
  dueDate: string;
  status: 'expected' | 'received' | 'deviating' | 'missed';
  /** Signed: an inflow is positive. */
  amountCents: number;
  /** The part paid for the contact, same sign as the amount. */
  contactShareCents: number;
}

export interface OutlookLine {
  occurrenceId: string;
  paymentId: string;
  name: string;
  dueDate: string;
  status: ContactOccurrence['status'];
  /** Positive: the contribution the contact pays, or the share of the cost passed through. */
  cents: number;
}

export interface ContactOutlook {
  /** Inflows from the contact (Mietbeitrag): what it is expected to pay in. */
  contributions: OutlookLine[];
  /** Outflows of which the contact owes a share (Durchgereichte Kosten). */
  passThroughs: OutlookLine[];
  /** Σ of the contributions still `expected`. */
  contributionCents: number;
  /** Σ of the pass-through shares still `expected`: the receivable will grow by this. */
  passThroughCents: number;
}

/**
 * What to expect from `contactId` between `from` and `to` (inclusive): contributions and passed
 * through costs from the occurrences, each with its status. Only occurrences that are still
 * `expected` add to the sums; received, deviating and missed ones are history.
 */
export function contactOutlook(
  occurrences: readonly ContactOccurrence[],
  contactId: string,
  from: string,
  to: string,
): ContactOutlook {
  const contributions: OutlookLine[] = [];
  const passThroughs: OutlookLine[] = [];
  let contributionCents = 0;
  let passThroughCents = 0;
  const ordered = [...occurrences].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name),
  );
  for (const o of ordered) {
    if (o.contactId !== contactId || o.dueDate < from || o.dueDate > to) continue;
    const line = (cents: number): OutlookLine => ({
      occurrenceId: o.occurrenceId,
      paymentId: o.paymentId,
      name: o.name,
      dueDate: o.dueDate,
      status: o.status,
      cents,
    });
    if (o.amountCents > 0) {
      contributions.push(line(o.amountCents));
      if (o.status === 'expected') contributionCents += o.amountCents;
    } else if (o.amountCents < 0 && o.contactShareCents !== 0) {
      const share = Math.abs(o.contactShareCents);
      passThroughs.push(line(share));
      if (o.status === 'expected') passThroughCents += share;
    }
  }
  return { contributions, passThroughs, contributionCents, passThroughCents };
}
