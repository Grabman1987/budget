import {
  addDays,
  allocateSettlement,
  contactBalanceCents,
  contactOutlook,
  kontoblatt,
  monthlyStatement,
  monthsBetween,
  openItems,
  type ContactEntry,
  type ContactOccurrence,
  type ContactOutlook,
  type KontoblattRow,
  type MonthlyStatement,
  type OpenItem,
  type Settlement,
} from '@budget/domain';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  contact,
  expectedPayment,
  INCOME_TYPES,
  payee,
} from '../schema';
import { withGroup, type AuditContext } from './audit';
import { createBooking } from './bookings';
import { ensureAdvanceCategory } from './categories';
import { createEntity, getEntity, restoreEntity, softDeleteEntity, updateEntity } from './entities';
import { CategoryRuleError, ConflictError, EntityNotFoundError } from './errors';
import { accountBalances } from './queries';
import { runInTransaction, type Executor } from './types';
import { upcoming } from './expected';

/**
 * Contacts (Kontakte) and their receivables (concept §3.4, `docs/data-model.md`). The receivable
 * of a contact is derived, never stored: −Σ(contact splits of live bookings) up to the viewed day
 * (money paid for the contact raises it, money repaid lowers it) plus the balance of the
 * receivable accounts linked to the contact (opening balances from a migration). It is NOT part of
 * the net worth: an Auslage lowers the net worth until it is repaid (owner decision, 01.10.2026).
 * The figures come from `@budget/domain` (`contacts`); this file reads their inputs.
 */

type Contact = typeof contact.$inferSelect;

export interface ContactInput {
  name: string;
  note?: string | null;
}
export type ContactPatch = Partial<ContactInput>;

/** Look-ahead for the expected contributions and pass-through costs on the list. */
export const CONTACT_OUTLOOK_DAYS = 30;

export interface ContactSummary extends Contact {
  /** Forderung (+) or Verbindlichkeit (−): the splits' balance plus the linked account. */
  balanceCents: number;
  /** The part that comes from contact splits (−Σ splits). */
  splitBalanceCents: number;
  /** The part that comes from linked receivable accounts (opening balances). */
  accountBalanceCents: number;
  /** Auslagen still open (FIFO) and how many items they are spread over. */
  openCents: number;
  openItemCount: number;
  /** Repaid beyond all Auslagen. */
  creditCents: number;
  /** Expected contributions (inflows) of the next 30 days. */
  expectedContributionCents: number;
  /** Receivable growth expected from passed-through costs in the next 30 days. */
  expectedPassThroughCents: number;
}

export interface ContactTotals {
  /** Σ of the positive balances: what contacts owe. */
  receivableCents: number;
  /** Σ of the negative balances as a positive number: what is owed to contacts. */
  payableCents: number;
  openItemCount: number;
}

const cleanName = (name: string): string => {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean === '') throw new CategoryRuleError('Der Kontakt braucht einen Namen.');
  return clean;
};

/** A contact split of a live booking, with where it was booked. */
export interface ContactSplitRow extends ContactEntry {
  contactId: string;
  bookingId: string;
  accountId: string;
}

/** Contact splits of live bookings on live accounts up to `asOf`, in booking order. */
export function contactSplits(
  db: Executor,
  asOf: string,
  contactIds?: readonly string[],
): ContactSplitRow[] {
  return db
    .select({
      id: bookingSplit.id,
      contactId: bookingSplit.contactId,
      amountCents: bookingSplit.amountCents,
      memo: bookingSplit.memo,
      bookingMemo: booking.memo,
      date: booking.date,
      bookingId: booking.id,
      accountId: booking.accountId,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(account.deletedAt),
        lte(booking.date, asOf),
        contactIds ? inArray(bookingSplit.contactId, [...contactIds]) : undefined,
      ),
    )
    .orderBy(
      asc(booking.date),
      asc(booking.createdAt),
      asc(bookingSplit.sortOrder),
      asc(bookingSplit.id),
    )
    .all()
    .filter((r) => r.contactId !== null)
    .map((r) => ({
      id: r.id,
      contactId: r.contactId as string,
      bookingId: r.bookingId,
      accountId: r.accountId,
      date: r.date,
      amountCents: r.amountCents,
      memo: r.memo ?? r.bookingMemo,
    }));
}

/** Occurrences of the next days whose payment (or its payee) belongs to a contact. */
function contactOccurrences(db: Executor, from: string, to: string): ContactOccurrence[] {
  const payeeContact = new Map(
    db
      .select({ id: payee.id, contactId: payee.contactId })
      .from(payee)
      .all()
      .map((p) => [p.id, p.contactId]),
  );
  const paymentContact = new Map(
    db
      .select({ id: expectedPayment.id, contactId: expectedPayment.contactId })
      .from(expectedPayment)
      .all()
      .map((p) => [p.id, p.contactId]),
  );
  // Inflows count as contributions only when they are typed as one (or untyped): a salary from an
  // employer that is also a contact is income, not a contribution to the household.
  return upcoming(db, from, to)
    .filter(
      (o) =>
        o.amountCents < 0 ||
        o.incomeTypeId === null ||
        o.incomeTypeId === INCOME_TYPES.contribution.id,
    )
    .map((o) => ({
      occurrenceId: o.occurrenceId,
      paymentId: o.paymentId,
      name: o.name,
      contactId:
        paymentContact.get(o.paymentId) ??
        (o.payeeId ? (payeeContact.get(o.payeeId) ?? null) : null),
      dueDate: o.dueDate,
      status: o.status,
      amountCents: o.amountCents,
      contactShareCents: o.contactShareCents,
    }));
}

const bySplits = (rows: readonly ContactSplitRow[]) => {
  const map = new Map<string, ContactSplitRow[]>();
  for (const r of rows) {
    const list = map.get(r.contactId);
    if (list) list.push(r);
    else map.set(r.contactId, [r]);
  }
  return map;
};

/** Balance of the receivable accounts linked to each contact, as of `asOf`. */
function linkedAccountBalances(db: Executor, asOf: string): Map<string, number> {
  const linked = db
    .select({ id: account.id, contactId: account.contactId })
    .from(account)
    .where(and(isNull(account.deletedAt)))
    .all()
    .filter((a) => a.contactId !== null);
  if (linked.length === 0) return new Map();
  const balances = new Map(accountBalances(db, asOf).map((b) => [b.accountId, b.balanceCents]));
  const sums = new Map<string, number>();
  for (const a of linked)
    sums.set(
      a.contactId as string,
      (sums.get(a.contactId as string) ?? 0) + (balances.get(a.id) ?? 0),
    );
  return sums;
}

function summarise(
  row: Contact,
  entries: readonly ContactEntry[],
  accountBalanceCents: number,
  outlook: ContactOutlook,
): ContactSummary {
  const open = openItems(entries);
  const splitBalanceCents = contactBalanceCents(entries);
  return {
    ...row,
    balanceCents: splitBalanceCents + accountBalanceCents,
    splitBalanceCents,
    accountBalanceCents,
    openCents: open.openCents,
    openItemCount: open.items.length,
    creditCents: open.creditCents,
    expectedContributionCents: outlook.contributionCents,
    expectedPassThroughCents: outlook.passThroughCents,
  };
}

/** All live contacts (by name) with their receivable as of `asOf` and the outlook of 30 days. */
export function listContacts(
  db: Executor,
  asOf: string,
  options: { includeDeleted?: boolean } = {},
): { contacts: ContactSummary[]; totals: ContactTotals } {
  const rows = db
    .select()
    .from(contact)
    .where(options.includeDeleted ? undefined : isNull(contact.deletedAt))
    .orderBy(asc(contact.name), asc(contact.id))
    .all();
  const splits = bySplits(contactSplits(db, asOf));
  const accountSums = linkedAccountBalances(db, asOf);
  const occurrences = contactOccurrences(db, asOf, addDays(asOf, CONTACT_OUTLOOK_DAYS));
  const contacts = rows.map((row) =>
    summarise(
      row,
      splits.get(row.id) ?? [],
      accountSums.get(row.id) ?? 0,
      contactOutlook(occurrences, row.id, asOf, addDays(asOf, CONTACT_OUTLOOK_DAYS)),
    ),
  );
  const totals: ContactTotals = { receivableCents: 0, payableCents: 0, openItemCount: 0 };
  for (const c of contacts) {
    if (c.balanceCents > 0) totals.receivableCents += c.balanceCents;
    else totals.payableCents -= c.balanceCents;
    totals.openItemCount += c.openItemCount;
  }
  return { contacts, totals };
}

/** One contact with its figures; deleted contacts only with `includeDeleted`. */
export function getContact(
  db: Executor,
  id: string,
  asOf: string,
  options: { includeDeleted?: boolean } = {},
): ContactSummary {
  const row = getEntity(db, contact, id, options);
  if (!row) throw new EntityNotFoundError('contact', id);
  const to = addDays(asOf, CONTACT_OUTLOOK_DAYS);
  return summarise(
    row,
    contactSplits(db, asOf, [id]),
    linkedAccountBalances(db, asOf).get(id) ?? 0,
    contactOutlook(contactOccurrences(db, asOf, to), id, asOf, to),
  );
}

export interface LedgerRow extends KontoblattRow {
  bookingId: string;
  accountId: string;
}

export interface ContactLedger {
  contact: ContactSummary;
  /** Receivable (from splits) before the first row of the range. */
  openingCents: number;
  /** Kontoblatt rows with a date in `from`..`to`, the balance running over the whole history. */
  rows: LedgerRow[];
  /** One statement per month of the range, oldest first. */
  statements: MonthlyStatement[];
  /** Open Auslagen, oldest first, as of today (whatever the range). */
  openItems: OpenItem[];
  /** Expected contributions and passed-through costs of the next 30 days, with status. */
  outlook: ContactOutlook;
}

/** Kontoblatt of a contact for a range (inclusive days, capped at `asOf`). */
export function contactLedger(
  db: Executor,
  id: string,
  asOf: string,
  range: { from?: string | undefined; to?: string | undefined } = {},
): ContactLedger {
  const summary = getContact(db, id, asOf);
  const to = range.to && range.to < asOf ? range.to : asOf;
  const all = contactSplits(db, to, [id]);
  const from = range.from ?? all[0]?.date ?? to;
  const sheet = kontoblatt(all);
  const where = new Map(all.map((s) => [s.id, s]));
  const rows = sheet
    .filter((r) => r.date >= from && r.date <= to)
    .map((r) => ({
      ...r,
      bookingId: where.get(r.id)?.bookingId ?? '',
      accountId: where.get(r.id)?.accountId ?? '',
    }));
  const before = all.filter((s) => s.date < from);
  const months = from <= to ? monthsBetween(from.slice(0, 7), to.slice(0, 7)).slice(-60) : [];
  const end = addDays(asOf, CONTACT_OUTLOOK_DAYS);
  return {
    contact: summary,
    openingCents: contactBalanceCents(before),
    rows,
    statements: months.map((m) => monthlyStatement(all, m)),
    openItems: openItems(to === asOf ? all : contactSplits(db, asOf, [id])).items,
    outlook: contactOutlook(contactOccurrences(db, asOf, end), id, asOf, end),
  };
}

/** Create a contact (audit `create`). */
export function createContact(db: Executor, input: ContactInput, ctx: AuditContext): Contact {
  return createEntity(
    db,
    contact,
    { name: cleanName(input.name), note: input.note?.trim() || null },
    ctx,
  );
}

/** Rename a contact or change its note (audit `update`). */
export function updateContact(
  db: Executor,
  id: string,
  patch: ContactPatch,
  ctx: AuditContext,
): Contact {
  return updateEntity(
    db,
    contact,
    id,
    {
      ...(patch.name !== undefined ? { name: cleanName(patch.name) } : {}),
      ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
    },
    ctx,
  );
}

/**
 * Delete a contact (soft). Refused while anything refers to it: bookings (contact splits), linked
 * accounts, payees or expected payments. Their history would lose its counterpart otherwise.
 */
export function deleteContact(db: Executor, id: string, ctx: AuditContext): { groupId: string } {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    if (!getEntity(tx, contact, id)) throw new EntityNotFoundError('contact', id);
    const used =
      tx
        .select({ id: bookingSplit.id })
        .from(bookingSplit)
        .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
        .where(and(eq(bookingSplit.contactId, id), isNull(booking.deletedAt)))
        .get() ??
      tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.contactId, id), isNull(account.deletedAt)))
        .get() ??
      tx
        .select({ id: payee.id })
        .from(payee)
        .where(and(eq(payee.contactId, id), isNull(payee.deletedAt)))
        .get() ??
      tx
        .select({ id: expectedPayment.id })
        .from(expectedPayment)
        .where(and(eq(expectedPayment.contactId, id), isNull(expectedPayment.deletedAt)))
        .get();
    if (used)
      throw new ConflictError(
        'Der Kontakt hat Buchungen, Konten, Empfänger oder erwartete Zahlungen und kann nicht gelöscht werden.',
      );
    softDeleteEntity(tx, contact, id, grouped);
  });
  return { groupId: grouped.groupId };
}

/** Bring a deleted contact back (audit `restore`). */
export function restoreContact(db: Executor, id: string, ctx: AuditContext): Contact {
  return restoreEntity(db, contact, id, ctx);
}

export interface SettleInput {
  /** The account the repayment arrived on: an open account in EUR. */
  accountId: string;
  /** `YYYY-MM-DD`, not after today. */
  date: string;
  /** Positive cents; at most what is open. */
  amountCents: number;
  memo?: string | null;
}

export interface SettleResult {
  bookingId: string;
  groupId: string;
  /** Which open items the repayment settled (FIFO). */
  settlement: Settlement;
  contact: ContactSummary;
}

/**
 * Book a repayment ("Ausgleich buchen"): an inflow on `accountId` with one contact split in the
 * Auslagen category. The split lands on the open items oldest first (the Kontoblatt derives that,
 * nothing else is stored). The booking and, if it had to be created, the Auslagen category are
 * one audit group, so one undo reverts everything.
 */
export function settleContact(
  db: Executor,
  id: string,
  input: SettleInput,
  ctx: AuditContext,
  asOf: string,
): SettleResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = getEntity(tx, contact, id);
    if (!row) throw new EntityNotFoundError('contact', id);
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
      throw new CategoryRuleError('Der Ausgleich muss über 0 liegen.');
    if (input.date > asOf)
      throw new CategoryRuleError('Ein Ausgleich kann nicht in der Zukunft liegen.');
    const target = getEntity(tx, account, input.accountId);
    if (!target) throw new EntityNotFoundError('account', input.accountId);
    if (target.closedAt) throw new ConflictError('Das Konto ist geschlossen.');
    if (target.currency !== 'EUR')
      throw new CategoryRuleError('Ein Ausgleich wird in einem Euro-Konto gebucht.');
    const open = openItems(contactSplits(tx, asOf, [id]));
    if (input.amountCents > open.openCents)
      throw new CategoryRuleError(
        open.openCents === 0
          ? 'Es ist nichts offen, das ausgeglichen werden könnte.'
          : 'Der Ausgleich ist höher als der offene Betrag.',
      );
    const settlement = allocateSettlement(open.items, input.amountCents);
    const categoryId = ensureAdvanceCategory(tx, grouped);
    const memo = input.memo?.trim() || `Ausgleich ${row.name}`;
    const bookingId = createBooking(
      tx,
      {
        accountId: input.accountId,
        date: input.date,
        amountCents: input.amountCents,
        memo,
        status: 'confirmed',
        source: 'manual',
        splits: [{ categoryId, amountCents: input.amountCents, contactId: id }],
      },
      grouped,
    );
    return {
      bookingId,
      groupId: grouped.groupId,
      settlement,
      contact: getContact(tx, id, asOf),
    };
  });
}
